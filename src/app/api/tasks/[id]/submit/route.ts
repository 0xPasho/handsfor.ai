import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  if (task.status !== "in_progress") {
    return NextResponse.json(
      { error: `Task is ${task.status}, can only submit when in_progress` },
      { status: 400 },
    );
  }

  if (task.acceptorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task acceptor can submit evidence" },
      { status: 403 },
    );
  }

  let notes: string | undefined;
  try {
    const body = await req.json();
    notes = body.notes;
  } catch {
    // no body is fine
  }

  await db
    .update(tasks)
    .set({
      status: "submitted",
      evidenceNotes: notes ?? null,
      submittedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  return NextResponse.json({
    task_id: task.id,
    status: "submitted",
  });
}
