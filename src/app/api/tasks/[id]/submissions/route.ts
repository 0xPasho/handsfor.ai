import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, submissions, users, applications } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";

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

  const results = await db
    .select()
    .from(submissions)
    .where(eq(submissions.taskId, id));

  return NextResponse.json({
    submissions: results.map((s) => ({
      id: s.id,
      task_id: s.taskId,
      worker_id: s.workerId,
      worker_wallet: s.workerWallet,
      evidence_notes: s.evidenceNotes,
      attachment_url: s.attachmentUrl,
      submitted_at: s.submittedAt,
      is_winner: s.isWinner,
    })),
  });
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
      { error: `Task is ${task.status}, can only submit when open` },
      { status: 400 },
    );
  }

  if (task.creatorId === user.id) {
    return NextResponse.json(
      { error: "Task creator cannot submit work on their own task" },
      { status: 403 },
    );
  }

  // Check for accepted application
  const [acceptedApp] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.taskId, task.id),
        eq(applications.applicantId, user.id),
        eq(applications.status, "accepted"),
      ),
    )
    .limit(1);

  if (!acceptedApp) {
    return NextResponse.json(
      { error: "You must have an accepted application to submit work" },
      { status: 403 },
    );
  }

  // Prevent duplicate submissions from same worker
  const [existing] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.taskId, task.id),
        eq(submissions.workerId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted work for this task" },
      { status: 409 },
    );
  }

  let evidenceNotes: string | undefined;
  let attachmentUrl: string | undefined;
  try {
    const body = await req.json();
    evidenceNotes = body.evidence_notes || body.notes;
    attachmentUrl = body.attachment_url;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!evidenceNotes) {
    return NextResponse.json(
      { error: "Evidence notes are required" },
      { status: 400 },
    );
  }

  if (evidenceNotes.length > 5000) {
    return NextResponse.json(
      { error: "Evidence notes must be 5000 characters or less" },
      { status: 400 },
    );
  }

  const [submission] = await db
    .insert(submissions)
    .values({
      taskId: task.id,
      workerId: user.id,
      workerWallet: user.walletAddress,
      evidenceNotes,
      attachmentUrl,
    })
    .returning();

  return NextResponse.json({
    id: submission.id,
    task_id: submission.taskId,
    worker_wallet: submission.workerWallet,
    evidence_notes: submission.evidenceNotes,
    submitted_at: submission.submittedAt,
  });
}
