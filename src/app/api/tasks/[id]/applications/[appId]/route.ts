import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { applications } from "@/modules/db/schema";
import { getAuthedTask } from "../../helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> },
) {
  const { id, appId } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  if (task.creatorId !== user.id) {
    return NextResponse.json(
      { error: "Only the task creator can review applications" },
      { status: 403 },
    );
  }

  if (task.status !== "open") {
    return NextResponse.json(
      { error: `Task is ${task.status}, can only review applications on open tasks` },
      { status: 400 },
    );
  }

  let newStatus: string;
  try {
    const body = await req.json();
    newStatus = body.status;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (newStatus !== "accepted" && newStatus !== "rejected") {
    return NextResponse.json(
      { error: "status must be 'accepted' or 'rejected'" },
      { status: 400 },
    );
  }

  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, appId))
    .limit(1);

  if (!application || application.taskId !== task.id) {
    return NextResponse.json(
      { error: "Application not found for this task" },
      { status: 404 },
    );
  }

  if (application.status !== "pending") {
    return NextResponse.json(
      { error: `Application is already ${application.status}` },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(applications)
    .set({ status: newStatus, reviewedAt: new Date() })
    .where(eq(applications.id, appId))
    .returning();

  return NextResponse.json({
    id: updated.id,
    task_id: updated.taskId,
    applicant_id: updated.applicantId,
    applicant_wallet: updated.applicantWallet,
    message: updated.message,
    status: updated.status,
    created_at: updated.createdAt,
    reviewed_at: updated.reviewedAt,
  });
}
