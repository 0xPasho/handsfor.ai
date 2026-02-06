import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, submissions, users, reviews } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
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

  if (task.status !== "open" && task.status !== "reviewing") {
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

  // Load creator for Yellow session closing
  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  if (!creator) {
    return NextResponse.json(
      { error: "Creator not found" },
      { status: 500 },
    );
  }

  // Close Yellow session — funds to winner's wallet
  if (task.appSessionId) {
    await closeTaskAppSession({
      appSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: submission.workerWallet as Address,
      amount: task.amount,
      winner: "acceptor",
    });
  }

  // Mark submission as winner
  await db
    .update(submissions)
    .set({ isWinner: true })
    .where(eq(submissions.id, submissionId));

  // Update task
  await db
    .update(tasks)
    .set({
      status: "completed",
      resolution: "acceptor_wins",
      winnerSubmissionId: submissionId,
      completedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  // Save review
  await db.insert(reviews).values({
    taskId: task.id,
    reviewerId: user.id,
    revieweeId: submission.workerId,
    rating: String(rating),
    comment: review?.trim() || null,
  });

  return NextResponse.json({
    task_id: task.id,
    status: "completed",
    winner_submission_id: submissionId,
    winner_wallet: submission.workerWallet,
  });
}
