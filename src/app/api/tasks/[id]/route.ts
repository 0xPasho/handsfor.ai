import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, users, submissions, applications, reviews } from "@/modules/db/schema";
import { getDisplayName } from "@/lib/identity";

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
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      username: users.username,
      ensName: users.ensName,
      baseName: users.baseName,
      activeIdentity: users.activeIdentity,
    })
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  // Load acceptor info if present
  let acceptor: typeof creator | null = null;
  if (task.acceptorId) {
    const [a] = await db
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
        username: users.username,
        ensName: users.ensName,
        baseName: users.baseName,
        activeIdentity: users.activeIdentity,
      })
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
      avatarUrl: users.avatarUrl,
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      bio: users.bio,
      location: users.location,
      username: users.username,
      ensName: users.ensName,
      ensAvatar: users.ensAvatar,
      baseName: users.baseName,
      baseAvatar: users.baseAvatar,
      activeIdentity: users.activeIdentity,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(applications.taskId, id));

  // Load review for this task (if completed)
  const taskReviews = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      reviewerWallet: users.walletAddress,
      reviewerId: reviews.reviewerId,
      reviewerUsername: users.username,
      reviewerEnsName: users.ensName,
      reviewerBaseName: users.baseName,
      reviewerActiveIdentity: users.activeIdentity,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.reviewerId, users.id))
    .where(eq(reviews.taskId, id));

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
      ? {
          id: creator.id,
          wallet_address: creator.walletAddress,
          username: creator.username || null,
          ens_name: creator.ensName || null,
          base_name: creator.baseName || null,
          active_identity: creator.activeIdentity || "username",
        }
      : null,
    acceptor: acceptor
      ? {
          id: acceptor.id,
          wallet_address: acceptor.walletAddress,
          username: acceptor.username || null,
          ens_name: acceptor.ensName || null,
          base_name: acceptor.baseName || null,
          active_identity: acceptor.activeIdentity || "username",
        }
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
        avatar_url: a.avatarUrl || null,
        tags: a.tags || [],
        hourly_rate: a.hourlyRate || null,
        bio: a.bio || null,
        location: a.location || null,
        username: a.username || null,
        ens_name: a.ensName || null,
        ens_avatar: a.ensAvatar || null,
        base_name: a.baseName || null,
        base_avatar: a.baseAvatar || null,
        active_identity: a.activeIdentity || "username",
      },
    })),
    application_count: taskApplications.length,
    review: taskReviews.length > 0
      ? {
          id: taskReviews[0].id,
          rating: Number(taskReviews[0].rating),
          comment: taskReviews[0].comment,
          created_at: taskReviews[0].createdAt,
          reviewer_name: getDisplayName({
            username: taskReviews[0].reviewerUsername,
            ensName: taskReviews[0].reviewerEnsName,
            baseName: taskReviews[0].reviewerBaseName,
            activeIdentity: taskReviews[0].reviewerActiveIdentity,
            walletAddress: taskReviews[0].reviewerWallet,
          }),
          reviewer_wallet: taskReviews[0].reviewerWallet,
          reviewer_id: taskReviews[0].reviewerId,
        }
      : null,
  });
}
