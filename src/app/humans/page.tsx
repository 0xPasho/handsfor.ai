"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { UserCard } from "@/components/user-card";
import { Input } from "@/modules/shared/components/ui/input";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { Search, SlidersHorizontal } from "lucide-react";

type HumanUser = {
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
  username: string | null;
  ens_name: string | null;
  base_name: string | null;
  active_identity: string | null;
};

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Most Active", value: "active" },
];

export default function HumansPage() {
  const [users, setUsers] = useState<HumanUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Compute popular tags from user data
  const popularTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      for (const tag of u.tags || []) {
        const normalized = tag.toLowerCase();
        counts[normalized] = (counts[normalized] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [users]);

  const filtered = useMemo(() => {
    let result = users;

    // Tag filter
    if (activeTag) {
      result = result.filter((u) =>
        (u.tags || []).some((tag) => tag.toLowerCase() === activeTag),
      );
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.ens_name?.toLowerCase().includes(q) ||
          u.base_name?.toLowerCase().includes(q) ||
          u.bio?.toLowerCase().includes(q) ||
          u.location?.toLowerCase().includes(q) ||
          (u.tags || []).some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sort === "active") {
        const actA = a.tasks_created + a.applications_made;
        const actB = b.tasks_created + b.applications_made;
        return actB - actA;
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [users, activeTag, search, sort]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Humans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} registered human{users.length !== 1 ? "s" : ""} ready
          to work.
        </p>
      </div>

      {/* Search + Sort bar */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, skill, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <SlidersHorizontal className="size-3.5 text-muted-foreground mr-1" />
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${
                sort === opt.value
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-zinc-100 hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic tag pills */}
      {popularTags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTag === null
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            All
          </button>
          {popularTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTag === tag
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* User grid */}
      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((user) => (
              <UserCard
                key={user.id}
                id={user.id}
                walletAddress={user.wallet_address}
                bio={user.bio}
                location={user.location}
                tags={user.tags}
                avatarUrl={user.avatar_url}
                hourlyRate={user.hourly_rate}
                tasksCreated={user.tasks_created}
                applicationsMade={user.applications_made}
                username={user.username}
                ensName={user.ens_name}
                baseName={user.base_name}
                activeIdentity={user.active_identity}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center">
            <p className="text-lg font-medium text-foreground/60">
              No humans found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || activeTag
                ? "Try adjusting your filters"
                : "No one has set up a profile yet"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
