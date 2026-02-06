import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { closeTaskAppSession } from "@/modules/yellow/server/platform";

/**
 * Simple AI dispute resolution.
 * Calls an LLM to decide based on task description, evidence, and dispute reason.
 */
async function resolveDispute(params: {
  taskDescription: string | null;
  evidenceNotes: string | null;
  disputeReason: string;
}): Promise<"creator_wins" | "acceptor_wins"> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // No AI key configured — default to creator wins
    console.warn("OPENROUTER_API_KEY not set, defaulting dispute to creator_wins");
    return "creator_wins";
  }

  try {
    const prompt = `You are a dispute resolver for a task marketplace. A task creator disputes the submitted work.

Task description: ${params.taskDescription || "(no description)"}
Evidence/work submitted: ${params.evidenceNotes || "(no evidence notes)"}
Dispute reason: ${params.disputeReason}

Based on this information, decide who wins the dispute.
Respond with ONLY one of: "creator_wins" or "acceptor_wins"`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      console.error("AI dispute resolution failed:", await response.text());
      return "creator_wins";
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase();

    if (answer?.includes("acceptor_wins")) {
      return "acceptor_wins";
    }
    return "creator_wins";
  } catch (err) {
    console.error("AI dispute resolution error:", err);
    return "creator_wins";
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

  if (task.status !== "submitted") {
    return NextResponse.json(
      { error: `Task is ${task.status}, can only dispute when submitted` },
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

  if (!task.appSessionId || !task.acceptorId) {
    return NextResponse.json(
      { error: "Task missing app session or acceptor" },
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
  const resolution = await resolveDispute({
    taskDescription: task.description,
    evidenceNotes: task.evidenceNotes,
    disputeReason: reason,
  });

  // Load participants
  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  const [acceptor] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.acceptorId))
    .limit(1);

  if (!creator || !acceptor) {
    return NextResponse.json(
      { error: "Creator or acceptor not found" },
      { status: 500 },
    );
  }

  // Close Yellow session based on resolution
  await closeTaskAppSession({
    appSessionId: task.appSessionId,
    creatorAddress: creator.walletAddress as Address,
    acceptorAddress: acceptor.walletAddress as Address,
    amount: task.amount,
    winner: resolution === "acceptor_wins" ? "acceptor" : "creator",
  });

  await db
    .update(tasks)
    .set({
      status: "completed",
      resolution,
      completedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  return NextResponse.json({
    task_id: task.id,
    status: "completed",
    resolution,
  });
}
