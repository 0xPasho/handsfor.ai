import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, submissions, users, reviews } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { transitionToWorkerSession } from "@/modules/yellow/server/platform";
import { closeTaskAppSession } from "@/modules/yellow/server/platform";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  if (task.creatorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task creator can pick a winner" },
      { status: 403 },
    );
  }

  if (task.status !== "open") {
    return NextResponse.json(
      { error: `Task is ${task.status}, cannot pick winner` },
      { status: 400 },
    );
  }

  let submissionId: string;
  let rating: number;
  let review: string | undefined;
  try {
    const body = await req.json();
    submissionId = body.submission_id;
    rating = body.rating;
    review = body.review;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!submissionId) {
    return NextResponse.json(
      { error: "submission_id is required" },
      { status: 400 },
    );
  }

  if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "rating is required (integer 1-5)" },
      { status: 400 },
    );
  }

  // Load the winning submission
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!submission || submission.taskId !== task.id) {
    return NextResponse.json(
      { error: "Submission not found for this task" },
      { status: 404 },
    );
  }

  // Load creator for Yellow session
  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  if (!creator?.privyWalletId) {
    return NextResponse.json(
      { error: "Creator has no server wallet" },
      { status: 500 },
    );
  }

  // Load winner for Yellow session
  const [winner] = await db
    .select()
    .from(users)
    .where(eq(users.id, submission.workerId))
    .limit(1);

  if (!winner?.privyWalletId) {
    return NextResponse.json(
      { error: "Winner has no server wallet" },
      { status: 400 },
    );
  }

  // Yellow session: transition 2-party → 3-party with winner, then close with funds to winner
  let yellowSettled = false;
  if (task.appSessionId) {
    const { appSessionId } = await transitionToWorkerSession({
      existingAppSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      creatorUserId: creator.id,
      creatorPrivyWalletId: creator.privyWalletId,
      acceptorAddress: winner.walletAddress as Address,
      acceptorUserId: winner.id,
      acceptorPrivyWalletId: winner.privyWalletId,
      amount: task.amount,
    });

    await closeTaskAppSession({
      appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: winner.walletAddress as Address,
      amount: task.amount,
      winner: "acceptor",
    });
    yellowSettled = true;
  }

  // All DB updates in a single transaction — retry once if it fails after Yellow settled
  const finalizeDb = () =>
    db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({ isWinner: true })
        .where(eq(submissions.id, submissionId));

      await tx
        .update(tasks)
        .set({
          status: "completed",
          resolution: "acceptor_wins",
          acceptorId: winner.id,
          winnerSubmissionId: submissionId,
          completedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));

      await tx.insert(reviews).values({
        taskId: task.id,
        reviewerId: user.id,
        revieweeId: submission.workerId,
        rating: String(rating),
        comment: review?.trim() || null,
      });
    });

  try {
    await finalizeDb();
  } catch (dbError) {
    if (!yellowSettled) throw dbError;
    console.error(`[CRITICAL] Yellow settled but DB failed for task ${task.id}:`, dbError);
    try {
      await finalizeDb();
    } catch (retryError) {
      console.error(`[CRITICAL] DB retry failed for task ${task.id}. Winner: ${winner.id}, submission: ${submissionId}. Manual fix needed.`, retryError);
      return NextResponse.json({
        task_id: task.id,
        status: "completed",
        winner_submission_id: submissionId,
        winner_wallet: submission.workerWallet,
        warning: "Payment released but database update failed. Contact support.",
      });
    }
  }

  return NextResponse.json({
    task_id: task.id,
    status: "completed",
    winner_submission_id: submissionId,
    winner_wallet: submission.workerWallet,
  });
}
