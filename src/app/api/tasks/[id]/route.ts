import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, users } from "@/modules/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Load creator info
  const [creator] = await db
    .select({ id: users.id, walletAddress: users.walletAddress })
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  // Load acceptor info if present
  let acceptor = null;
  if (task.acceptorId) {
    const [a] = await db
      .select({ id: users.id, walletAddress: users.walletAddress })
      .from(users)
      .where(eq(users.id, task.acceptorId))
      .limit(1);
    acceptor = a ?? null;
  }

  return NextResponse.json({
    id: task.id,
    status: task.status,
    amount: task.amount,
    description: task.description,
    creator: creator
      ? { id: creator.id, wallet_address: creator.walletAddress }
      : null,
    acceptor: acceptor
      ? { id: acceptor.id, wallet_address: acceptor.walletAddress }
      : null,
    evidence_notes: task.evidenceNotes,
    dispute_reason: task.disputeReason,
    resolution: task.resolution,
    created_at: task.createdAt,
    accepted_at: task.acceptedAt,
    submitted_at: task.submittedAt,
    completed_at: task.completedAt,
  });
}
