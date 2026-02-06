import { cn } from "@/modules/shared/utils";

export function MethodBadge({
  method,
  className,
}: {
  method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  className?: string;
}) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600",
    POST: "bg-blue-500/10 text-blue-600",
    DELETE: "bg-red-500/10 text-red-600",
    PUT: "bg-amber-500/10 text-amber-600",
    PATCH: "bg-violet-500/10 text-violet-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider font-mono",
        colors[method] || "bg-zinc-500/10 text-zinc-600",
        className,
      )}
    >
      {method}
    </span>
  );
}
