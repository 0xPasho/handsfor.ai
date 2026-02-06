export function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatTime(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(ts: string) {
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  open: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    label: "Open",
  },
  in_progress: {
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    label: "In Progress",
  },
  submitted: {
    bg: "bg-violet-500/10",
    text: "text-violet-600",
    label: "Submitted",
  },
  reviewing: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    label: "Reviewing",
  },
  disputed: {
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    label: "Disputed",
  },
  completed: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600",
    label: "Completed",
  },
  cancelled: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    label: "Cancelled",
  },
};
