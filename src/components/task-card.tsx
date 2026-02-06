import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { timeAgo, truncAddr } from "@/lib/format";
import { Clock, Users } from "lucide-react";

type TaskCardProps = {
  id: string;
  description: string | null;
  amount: string;
  status: string;
  tags?: string[];
  createdAt: string;
  creatorWallet?: string | null;
  deadline?: string | null;
  applicationCount?: number;
};

export function TaskCard({
  id,
  description,
  amount,
  status,
  tags = [],
  createdAt,
  creatorWallet,
  deadline,
  applicationCount = 0,
}: TaskCardProps) {
  const value = parseFloat(amount).toFixed(2);
  const isUrgent =
    deadline && new Date(deadline).getTime() - Date.now() < 6 * 60 * 60 * 1000;

  return (
    <Link
      href={`/tasks/${id}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Top row: amount + status */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums text-usdc">
          ${value}
        </span>
        <StatusBadge status={status} />
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      <p className="mt-3 flex-1 text-sm leading-relaxed text-foreground/80 line-clamp-3">
        {description || "No description provided"}
      </p>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{timeAgo(createdAt)}</span>

        {applicationCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" />
            {applicationCount}
          </span>
        )}

        {deadline && (
          <span
            className={`inline-flex items-center gap-1 ${isUrgent ? "text-orange-500" : ""}`}
          >
            <Clock className="size-3" />
            {timeAgo(deadline).replace(" ago", " left")}
          </span>
        )}

        <span className="ml-auto font-mono">
          {creatorWallet ? truncAddr(creatorWallet) : ""}
        </span>
      </div>
    </Link>
  );
}
