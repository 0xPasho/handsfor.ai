import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, users, reviews } from "@/modules/db/schema";
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

  if (task.status !== "submitted") {
    return NextResponse.json(
      { error: `Task is ${task.status}, can only approve when submitted` },
      { status: 400 },
    );
  }

  if (task.creatorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task creator can approve" },
      { status: 403 },
    );
  }

  let rating: number;
  let review: string | undefined;
  try {
    const body = await req.json();
    rating = body.rating;
    review = body.review;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "rating is required (integer 1-5)" },
      { status: 400 },
    );
  }

  if (!task.appSessionId || !task.acceptorId) {
    return NextResponse.json(
      { error: "Task missing app session or acceptor" },
      { status: 500 },
    );
  }

  // Load acceptor and creator addresses
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

  // Close Yellow session — all funds to acceptor
  await closeTaskAppSession({
    appSessionId: task.appSessionId,
    creatorAddress: creator.walletAddress as Address,
    acceptorAddress: acceptor.walletAddress as Address,
    amount: task.amount,
    winner: "acceptor",
  });

  await db
    .update(tasks)
    .set({
      status: "completed",
      resolution: "acceptor_wins",
      completedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  // Save review
  await db.insert(reviews).values({
    taskId: task.id,
    reviewerId: user.id,
    revieweeId: task.acceptorId,
    rating: String(rating),
    comment: review?.trim() || null,
  });

  return NextResponse.json({
    task_id: task.id,
    status: "completed",
    resolution: "acceptor_wins",
  });
}
