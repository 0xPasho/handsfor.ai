import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, applications, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAuthedTask(req, id);
  if (result instanceof NextResponse) return result;

  const { user, task } = result;

  const isCreator = task.creatorId === user.id;

  // Creator sees all applications; non-creators see only their own
  const conditions = isCreator
    ? [eq(applications.taskId, task.id)]
    : [eq(applications.taskId, task.id), eq(applications.applicantId, user.id)];

  const rows = await db
    .select({
      id: applications.id,
      taskId: applications.taskId,
      applicantId: applications.applicantId,
      applicantWallet: applications.applicantWallet,
      message: applications.message,
      status: applications.status,
      createdAt: applications.createdAt,
      reviewedAt: applications.reviewedAt,
      avatarUrl: users.avatarUrl,
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      bio: users.bio,
      location: users.location,
      username: users.username,
      ensName: users.ensName,
      baseName: users.baseName,
      activeIdentity: users.activeIdentity,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(and(...conditions));

  return NextResponse.json({
    applications: rows.map((r) => ({
      id: r.id,
      task_id: r.taskId,
      applicant_id: r.applicantId,
      applicant_wallet: r.applicantWallet,
      message: r.message,
      status: r.status,
      created_at: r.createdAt,
      reviewed_at: r.reviewedAt,
      applicant: {
        avatar_url: r.avatarUrl || null,
        tags: r.tags || [],
        hourly_rate: r.hourlyRate || null,
        bio: r.bio || null,
        location: r.location || null,
        username: r.username || null,
        ens_name: r.ensName || null,
        base_name: r.baseName || null,
        active_identity: r.activeIdentity || "username",
      },
    })),
  });
}
