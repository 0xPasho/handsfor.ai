import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { cancelInitialSession } from "@/modules/yellow/server/platform";

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
      { error: `Task is ${task.status}, can only cancel open tasks` },
      { status: 400 },
    );
  }

  if (task.creatorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task creator can cancel" },
      { status: 403 },
    );
  }

  // Close the 2-party Yellow session, returning funds to creator
  if (task.appSessionId) {
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.id, task.creatorId))
      .limit(1);

    if (creator) {
      await cancelInitialSession({
        appSessionId: task.appSessionId,
        creatorAddress: creator.walletAddress as Address,
        amount: task.amount,
      });
    }
  }

  await db
    .update(tasks)
    .set({
      status: "cancelled",
      completedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  return NextResponse.json({
    task_id: task.id,
    status: "cancelled",
  });
}
