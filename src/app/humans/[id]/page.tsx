"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/hooks/use-user";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { Separator } from "@/modules/shared/components/ui/separator";
import { truncAddr } from "@/lib/format";
import { getDisplayName, getInitials } from "@/lib/identity";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { CopyButton } from "@/components/copy-button";
import {
  ArrowLeft,
  MapPin,
  DollarSign,
  Globe,
  Briefcase,
  FileText,
  Users,
  Star,
  Pencil,
  LayoutDashboard,
} from "lucide-react";

type UserReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_wallet: string;
  reviewer_id: string;
  task_id: string;
};

type UserProfile = {
  id: string;
  wallet_address: string;
  bio: string | null;
  location: string | null;
  tags: string[];
  avatar_url: string | null;
  hourly_rate: string | null;
  twitter_handle: string | null;
  github_handle: string | null;
  website_url: string | null;
  created_at: string;
  tasks_created: number;
  applications_made: number;
  submissions: number;
  avg_rating: number | null;
  review_count: number;
  reviews: UserReview[];
  username: string | null;
  ens_name: string | null;
  ens_avatar: string | null;
  base_name: string | null;
  base_avatar: string | null;
  active_identity: string | null;
};

export default function HumanProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const { user: me } = useUser();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        setUser(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="mb-6 h-6 w-32" />
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="mt-6 h-20 w-full" />
          </div>
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">User not found.</p>
        <Link href="/humans" className="mt-4 inline-block text-sm underline">
          Back to Humans
        </Link>
      </div>
    );
  }

  const initials = getInitials(user);

  const joinedDate = new Date(user.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link
        href="/humans"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to Humans
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar className="size-20">
              {user.avatar_url ? (
                <AvatarImage
                  src={user.avatar_url}
                  alt={getDisplayName(user)}
                />
              ) : null}
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {getDisplayName(user)}
                </h1>
                {me && (me.user_id === user.id || me.username === userId || me.wallet_address === user.wallet_address) && (
                  <>
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-zinc-50 hover:text-foreground"
                    >
                      <LayoutDashboard className="size-3" />
                      Dashboard
                    </Link>
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-zinc-50 hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                      Edit Profile
                    </Link>
                  </>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono">
                  {truncAddr(user.wallet_address)}
                </span>
                <CopyButton text={user.wallet_address} />
              </div>
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <MarkdownRenderer content={user.bio} className="max-h-96 overflow-y-auto" />
          )}

          {/* Tags */}
          {user.tags.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Skills
              </p>
              <div className="flex flex-wrap gap-2">
                {user.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Details grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {user.location && (
              <DetailItem
                icon={<MapPin className="size-3.5" />}
                label="Location"
                value={user.location}
              />
            )}
            {user.hourly_rate && (
              <DetailItem
                icon={<DollarSign className="size-3.5" />}
                label="Hourly Rate"
                value={`$${user.hourly_rate} USDC`}
              />
            )}
            {user.website_url && (
              <DetailItem
                icon={<Globe className="size-3.5" />}
                label="Website"
                value={
                  <a
                    href={user.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                  >
                    {user.website_url.replace(/^https?:\/\//, "")}
                  </a>
                }
              />
            )}
            {user.twitter_handle && (
              <DetailItem
                icon={<span className="text-[11px] font-bold">𝕏</span>}
                label="Twitter"
                value={
                  <a
                    href={`https://x.com/${user.twitter_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                  >
                    @{user.twitter_handle}
                  </a>
                }
              />
            )}
            {user.github_handle && (
              <DetailItem
                icon={<span className="text-[11px] font-bold">GH</span>}
                label="GitHub"
                value={
                  <a
                    href={`https://github.com/${user.github_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                  >
                    @{user.github_handle}
                  </a>
                }
              />
            )}
          </div>

          {/* Reviews */}
          {user.reviews.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                  Reviews ({user.review_count})
                </p>
                <div className="space-y-3">
                  {user.reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-1 mb-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`size-3.5 ${
                              s <= review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      {review.comment && (
                        <MarkdownRenderer content={review.comment} className="mt-1" />
                      )}
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Link
                          href={`/humans/${review.reviewer_id}`}
                          className="hover:underline"
                        >
                          {review.reviewer_name || truncAddr(review.reviewer_wallet)}
                        </Link>
                        <span>&middot;</span>
                        <Link
                          href={`/tasks/${review.task_id}`}
                          className="hover:underline"
                        >
                          View task
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Rating */}
          {user.avg_rating !== null && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Rating
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`size-4 ${
                        s <= Math.round(user.avg_rating!)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium">{user.avg_rating}</span>
                <span className="text-xs text-muted-foreground">
                  ({user.review_count} review{user.review_count !== 1 ? "s" : ""})
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
              Activity
            </p>
            <div className="space-y-3">
              <StatRow
                icon={<FileText className="size-3.5" />}
                label="Tasks created"
                value={user.tasks_created}
              />
              <StatRow
                icon={<Users className="size-3.5" />}
                label="Applications"
                value={user.applications_made}
              />
              <StatRow
                icon={<Briefcase className="size-3.5" />}
                label="Submissions"
                value={user.submissions}
              />
            </div>
          </div>

          {/* Member since */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Member since
            </p>
            <p className="text-sm font-medium">{joinedDate}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
