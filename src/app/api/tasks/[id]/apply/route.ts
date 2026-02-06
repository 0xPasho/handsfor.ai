import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, applications } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";

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
      { error: `Task is ${task.status}, can only apply to open tasks` },
      { status: 400 },
    );
  }

  if (task.creatorId === user.id) {
    return NextResponse.json(
      { error: "Cannot apply to your own task" },
      { status: 400 },
    );
  }

  // Check for existing application
  const [existing] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.taskId, task.id),
        eq(applications.applicantId, user.id),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "You have already applied to this task" },
      { status: 409 },
    );
  }

  let message: string | undefined;
  try {
    const body = await req.json();
    message = body.message;
  } catch {
    // No body is fine — message is optional
  }

  const [application] = await db
    .insert(applications)
    .values({
      taskId: task.id,
      applicantId: user.id,
      applicantWallet: user.walletAddress,
      message: message || null,
    })
    .returning();

  return NextResponse.json({
    id: application.id,
    task_id: application.taskId,
    applicant_id: application.applicantId,
    applicant_wallet: application.applicantWallet,
    message: application.message,
    status: application.status,
    created_at: application.createdAt,
  });
}
