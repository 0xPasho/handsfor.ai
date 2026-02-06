"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { TaskCard } from "@/components/task-card";
import { Button } from "@/modules/shared/components/ui/button";
import { Input } from "@/modules/shared/components/ui/input";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import type { Task } from "@/hooks/use-user";

type TaskWithExtras = Task & {
  tags?: string[];
  deadline?: string | null;
  applicationCount?: number;
  creator?: {
    username?: string | null;
    ens_name?: string | null;
    base_name?: string | null;
    active_identity?: string | null;
    wallet_address?: string | null;
  } | null;
};

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Highest Reward", value: "highest" },
  { label: "Ending Soon", value: "deadline" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?status=open");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Compute popular tags from task data
  const popularTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      for (const tag of t.tags || []) {
        const normalized = tag.toLowerCase();
        counts[normalized] = (counts[normalized] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = tasks;

    // Tag filter
    if (activeTag) {
      result = result.filter((t) =>
        (t.tags || []).some((tag) => tag.toLowerCase() === activeTag),
      );
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          (t.tags || []).some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sort === "highest")
        return parseFloat(b.amount) - parseFloat(a.amount);
      if (sort === "deadline") {
        const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const db_ = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return da - db_;
      }
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [tasks, activeTag, search, sort]);

  const totalUsdc = useMemo(
    () =>
      tasks
        .reduce((sum, t) => sum + parseFloat(t.amount), 0)
        .toFixed(2),
    [tasks],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Task Marketplace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.length} open task{tasks.length !== 1 ? "s" : ""}
            {" "}&middot;{" "}
            <span className="text-usdc font-medium">${totalUsdc}</span> USDC
            available
          </p>
        </div>
        <Link href="/tasks/new">
          <Button>
            Post a Task <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </Link>
      </div>

      {/* Search + Sort bar */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
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

      {/* Task grid */}
      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                description={task.description}
                amount={task.amount}
                status={task.status}
                tags={task.tags}
                createdAt={task.createdAt}
                creatorWallet={task.creatorWallet}
                deadline={task.deadline}
                applicationCount={task.applicationCount}
                creator={task.creator}
              />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center">
            <p className="text-lg font-medium text-foreground/60">
              No tasks found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || activeTag
                ? "Try adjusting your filters"
                : "Check back soon or post your own task"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
