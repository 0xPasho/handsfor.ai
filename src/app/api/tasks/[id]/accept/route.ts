import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { transitionToWorkerSession } from "@/modules/yellow/server/platform";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  // Validations
  if (task.status !== "open") {
    return NextResponse.json(
      { error: `Task is ${task.status}, not open` },
      { status: 400 },
    );
  }

  if (task.creatorId === user.id) {
    return NextResponse.json(
      { error: "Cannot accept your own task" },
      { status: 400 },
    );
  }

  if (!task.appSessionId) {
    return NextResponse.json(
      { error: "Task has no Yellow session — cannot accept" },
      { status: 400 },
    );
  }

  // Load creator
  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: "Task creator not found" }, { status: 500 });
  }

  if (!creator.privyWalletId) {
    return NextResponse.json(
      { error: "Task creator has no server wallet" },
      { status: 400 },
    );
  }

  if (!user.privyWalletId) {
    return NextResponse.json(
      { error: "You need a server wallet to accept tasks" },
      { status: 400 },
    );
  }

  // Transition: close 2-party session, open 3-party session with worker
  // All participants are authenticated on a fresh connection inside this call
  const { appSessionId } = await transitionToWorkerSession({
    existingAppSessionId: task.appSessionId,
    creatorAddress: creator.walletAddress as Address,
    creatorUserId: creator.id,
    creatorPrivyWalletId: creator.privyWalletId!,
    acceptorAddress: user.walletAddress as Address,
    acceptorUserId: user.id,
    acceptorPrivyWalletId: user.privyWalletId!,
    amount: task.amount,
  });

  // Update task
  await db
    .update(tasks)
    .set({
      status: "in_progress",
      acceptorId: user.id,
      appSessionId,
      acceptedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  return NextResponse.json({
    task_id: task.id,
    status: "in_progress",
    app_session_id: appSessionId,
    acceptor_id: user.id,
  });
}
