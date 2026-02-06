import { NextRequest, NextResponse } from "next/server";
import { eq, sql, or } from "drizzle-orm";
import { db } from "@/modules/db";
import { users, tasks, applications, submissions, reviews } from "@/modules/db/schema";
import { getDisplayName } from "@/lib/identity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Support lookup by UUID or username
  const isUuid = UUID_RE.test(id);
  const whereClause = isUuid
    ? eq(users.id, id)
    : eq(users.username, id.toLowerCase());

  const [user] = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      bio: users.bio,
      location: users.location,
      tags: users.tags,
      avatarUrl: users.avatarUrl,
      hourlyRate: users.hourlyRate,
      twitterHandle: users.twitterHandle,
      githubHandle: users.githubHandle,
      websiteUrl: users.websiteUrl,
      createdAt: users.createdAt,
      username: users.username,
      ensName: users.ensName,
      ensAvatar: users.ensAvatar,
      baseName: users.baseName,
      baseAvatar: users.baseAvatar,
      activeIdentity: users.activeIdentity,
    })
    .from(users)
    .where(whereClause)
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Count tasks created
  const [taskStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.creatorId, user.id));

  // Count applications made
  const [appStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.applicantId, user.id));

  // Count winning submissions
  const [winStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(submissions)
    .where(eq(submissions.workerId, user.id));

  // Load reviews received (as reviewee)
  const userReviews = await db
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
      taskId: reviews.taskId,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.reviewerId, users.id))
    .where(eq(reviews.revieweeId, user.id))
    .orderBy(sql`${reviews.createdAt} desc`)
    .limit(20);

  const avgRating =
    userReviews.length > 0
      ? userReviews.reduce((sum, r) => sum + Number(r.rating), 0) / userReviews.length
      : null;

  return NextResponse.json({
    id: user.id,
    wallet_address: user.walletAddress,
    bio: user.bio,
    location: user.location,
    tags: user.tags || [],
    avatar_url: user.avatarUrl,
    hourly_rate: user.hourlyRate,
    twitter_handle: user.twitterHandle,
    github_handle: user.githubHandle,
    website_url: user.websiteUrl,
    created_at: user.createdAt,
    username: user.username || null,
    ens_name: user.ensName || null,
    ens_avatar: user.ensAvatar || null,
    base_name: user.baseName || null,
    base_avatar: user.baseAvatar || null,
    active_identity: user.activeIdentity || "username",
    tasks_created: taskStats?.count || 0,
    applications_made: appStats?.count || 0,
    submissions: winStats?.count || 0,
    avg_rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
    review_count: userReviews.length,
    reviews: userReviews.map((r) => ({
      id: r.id,
      rating: Number(r.rating),
      comment: r.comment,
      created_at: r.createdAt,
      reviewer_name: getDisplayName({
        username: r.reviewerUsername,
        ensName: r.reviewerEnsName,
        baseName: r.reviewerBaseName,
        activeIdentity: r.reviewerActiveIdentity,
        walletAddress: r.reviewerWallet,
      }),
      reviewer_wallet: r.reviewerWallet,
      reviewer_id: r.reviewerId,
      task_id: r.taskId,
    })),
  });
}
