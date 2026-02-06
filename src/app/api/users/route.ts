import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/modules/db";
import { users, tasks, applications } from "@/modules/db/schema";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search");

  // Only return users who have a display name or bio (i.e. have set up a profile)
  const results = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      displayName: users.displayName,
      bio: users.bio,
      location: users.location,
      tags: users.tags,
      avatarUrl: users.avatarUrl,
      hourlyRate: users.hourlyRate,
      twitterHandle: users.twitterHandle,
      githubHandle: users.githubHandle,
      websiteUrl: users.websiteUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(sql`${users.displayName} IS NOT NULL OR ${users.bio} IS NOT NULL`);

  // Count completed tasks per user (as worker — winning submissions)
  const userIds = results.map((u) => u.id);
  const taskCountMap: Record<string, number> = {};
  const applicationCountMap: Record<string, number> = {};

  if (userIds.length > 0) {
    const { inArray, eq } = await import("drizzle-orm");

    // Tasks created by each user
    const createdCounts = await db
      .select({
        creatorId: tasks.creatorId,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(inArray(tasks.creatorId, userIds))
      .groupBy(tasks.creatorId);

    for (const c of createdCounts) {
      taskCountMap[c.creatorId] = c.count;
    }

    // Applications by each user
    const appCounts = await db
      .select({
        applicantId: applications.applicantId,
        count: sql<number>`count(*)::int`,
      })
      .from(applications)
      .where(inArray(applications.applicantId, userIds))
      .groupBy(applications.applicantId);

    for (const c of appCounts) {
      applicationCountMap[c.applicantId] = c.count;
    }
  }

  let filtered = results;
  if (search) {
    const q = search.toLowerCase();
    filtered = results.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(q) ||
        u.bio?.toLowerCase().includes(q) ||
        u.location?.toLowerCase().includes(q) ||
        (u.tags || []).some((t: string) => t.toLowerCase().includes(q)),
    );
  }

  const enriched = filtered.map((u) => ({
    id: u.id,
    wallet_address: u.walletAddress,
    display_name: u.displayName,
    bio: u.bio,
    location: u.location,
    tags: u.tags || [],
    avatar_url: u.avatarUrl,
    hourly_rate: u.hourlyRate,
    twitter_handle: u.twitterHandle,
    github_handle: u.githubHandle,
    website_url: u.websiteUrl,
    created_at: u.createdAt,
    tasks_created: taskCountMap[u.id] || 0,
    applications_made: applicationCountMap[u.id] || 0,
  }));

  return NextResponse.json({ users: enriched });
}
