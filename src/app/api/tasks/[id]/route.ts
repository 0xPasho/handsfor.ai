import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, users, submissions, applications } from "@/modules/db/schema";

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

  // Load submissions
  const taskSubmissions = await db
    .select()
    .from(submissions)
    .where(eq(submissions.taskId, id));

  // Load applications with applicant profile data
  const taskApplications = await db
    .select({
      id: applications.id,
      taskId: applications.taskId,
      applicantId: applications.applicantId,
      applicantWallet: applications.applicantWallet,
      message: applications.message,
      status: applications.status,
      createdAt: applications.createdAt,
      reviewedAt: applications.reviewedAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      bio: users.bio,
      location: users.location,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(applications.taskId, id));

  return NextResponse.json({
    id: task.id,
    status: task.status,
    amount: task.amount,
    description: task.description,
    tags: task.tags,
    deadline: task.deadline,
    competitionMode: task.competitionMode,
    winnerSubmissionId: task.winnerSubmissionId,
    creatorId: task.creatorId,
    acceptorId: task.acceptorId,
    appSessionId: task.appSessionId,
    creator: creator
      ? { id: creator.id, wallet_address: creator.walletAddress }
      : null,
    acceptor: acceptor
      ? { id: acceptor.id, wallet_address: acceptor.walletAddress }
      : null,
    creatorWallet: creator?.walletAddress || null,
    acceptorWallet: acceptor?.walletAddress || null,
    evidence_notes: task.evidenceNotes,
    evidenceNotes: task.evidenceNotes,
    dispute_reason: task.disputeReason,
    disputeReason: task.disputeReason,
    resolution: task.resolution,
    created_at: task.createdAt,
    createdAt: task.createdAt,
    accepted_at: task.acceptedAt,
    acceptedAt: task.acceptedAt,
    submitted_at: task.submittedAt,
    submittedAt: task.submittedAt,
    completed_at: task.completedAt,
    completedAt: task.completedAt,
    submissions: taskSubmissions.map((s) => ({
      id: s.id,
      worker_id: s.workerId,
      worker_wallet: s.workerWallet,
      evidence_notes: s.evidenceNotes,
      attachment_url: s.attachmentUrl,
      submitted_at: s.submittedAt,
      is_winner: s.isWinner,
    })),
    applications: taskApplications.map((a) => ({
      id: a.id,
      applicant_id: a.applicantId,
      applicant_wallet: a.applicantWallet,
      message: a.message,
      status: a.status,
      created_at: a.createdAt,
      reviewed_at: a.reviewedAt,
      applicant: {
        display_name: a.displayName || null,
        avatar_url: a.avatarUrl || null,
        tags: a.tags || [],
        hourly_rate: a.hourlyRate || null,
        bio: a.bio || null,
        location: a.location || null,
      },
    })),
    application_count: taskApplications.length,
  });
}
