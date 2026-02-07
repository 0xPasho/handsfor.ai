import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, submissions, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { transitionToWorkerSession, closeTaskAppSession } from "@/modules/yellow/server/platform";

/**
 * AI dispute resolution via OpenRouter.
 * Evaluates task description, all submissions, and the dispute reason
 * to decide whether a submission is adequate or the creator is right.
 */
async function resolveDispute(params: {
  taskDescription: string | null;
  submissions: { id: string; evidenceNotes: string | null; workerWallet: string }[];
  disputeReason: string;
}): Promise<{ resolution: "creator_wins" | "acceptor_wins"; winnerSubmissionId?: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not set, defaulting dispute to creator_wins");
    return { resolution: "creator_wins" };
  }

  const submissionsList = params.submissions
    .map((s, i) => `Submission ${i + 1} (ID: ${s.id}):\n${s.evidenceNotes || "(no evidence)"}`)
    .join("\n\n");

  try {
    const prompt = `You are a dispute resolver for a task marketplace. A task creator is disputing the submitted work.

Task description: ${params.taskDescription || "(no description)"}

Submissions:
${submissionsList}

Creator's dispute reason: ${params.disputeReason}

Based on this information, decide who wins the dispute.
- If ANY submission adequately fulfills the task, respond with: acceptor_wins:SUBMISSION_ID (using the actual submission ID)
- If NO submission adequately fulfills the task, respond with: creator_wins

Respond with ONLY one line in the format above.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("AI dispute resolution failed");
      return { resolution: "creator_wins" };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || "";

    if (answer.toLowerCase().startsWith("acceptor_wins")) {
      // Extract submission ID from response
      const parts = answer.split(":");
      const submissionId = parts.slice(1).join(":").trim();
      // Verify it's a valid submission
      const validSubmission = params.submissions.find((s) => s.id === submissionId);
      if (validSubmission) {
        return { resolution: "acceptor_wins", winnerSubmissionId: validSubmission.id };
      }
      // AI gave invalid submission ID — default to creator wins for safety
      console.error(`AI dispute returned invalid submission ID: ${submissionId}`);
      return { resolution: "creator_wins" };
    }

    return { resolution: "creator_wins" };
  } catch (err) {
    console.error("AI dispute resolution error:", err);
    return { resolution: "creator_wins" };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  if (task.status !== "open") {
    return NextResponse.json(
      { error: `Task is ${task.status}, can only dispute when open` },
      { status: 400 },
    );
  }

  if (task.creatorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task creator can dispute" },
      { status: 403 },
    );
  }

  let reason = "";
  try {
    const body = await req.json();
    reason = body.reason || "";
  } catch {
    // no body
  }

  if (!reason) {
    return NextResponse.json(
      { error: "Dispute reason is required" },
      { status: 400 },
    );
  }

  // Load submissions
  const taskSubmissions = await db
    .select()
    .from(submissions)
    .where(eq(submissions.taskId, task.id));

  if (taskSubmissions.length === 0) {
    return NextResponse.json(
      { error: "No submissions to dispute — cancel the task instead" },
      { status: 400 },
    );
  }

  if (!task.appSessionId) {
    return NextResponse.json(
      { error: "Task missing escrow session" },
      { status: 500 },
    );
  }

  // Mark as disputed
  await db
    .update(tasks)
    .set({
      status: "disputed",
      disputeReason: reason,
    })
    .where(eq(tasks.id, task.id));

  // AI resolution
  const { resolution, winnerSubmissionId } = await resolveDispute({
    taskDescription: task.description,
    submissions: taskSubmissions.map((s) => ({
      id: s.id,
      evidenceNotes: s.evidenceNotes,
      workerWallet: s.workerWallet,
    })),
    disputeReason: reason,
  });

  // Load creator
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

  if (resolution === "acceptor_wins" && winnerSubmissionId) {
    // AI picked a winner — transition session and pay the worker
    const winningSubmission = taskSubmissions.find((s) => s.id === winnerSubmissionId)!;

    const [winner] = await db
      .select()
      .from(users)
      .where(eq(users.id, winningSubmission.workerId))
      .limit(1);

    if (!winner?.privyWalletId) {
      return NextResponse.json(
        { error: "Winner has no server wallet" },
        { status: 500 },
      );
    }

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

    // Mark winner
    await db
      .update(submissions)
      .set({ isWinner: true })
      .where(eq(submissions.id, winnerSubmissionId));

    await db
      .update(tasks)
      .set({
        status: "completed",
        resolution: "acceptor_wins",
        acceptorId: winner.id,
        winnerSubmissionId,
        completedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
  } else {
    // Creator wins — close session returning funds to creator
    await closeTaskAppSession({
      appSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: creator.walletAddress as Address,
      amount: task.amount,
      winner: "creator",
    });

    await db
      .update(tasks)
      .set({
        status: "completed",
        resolution: "creator_wins",
        completedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
  }

  return NextResponse.json({
    task_id: task.id,
    status: "completed",
    resolution,
    winner_submission_id: winnerSubmissionId || null,
  });
}
