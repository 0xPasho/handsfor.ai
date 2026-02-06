import { cn } from "@/modules/shared/utils";
import { STATUS_COLORS } from "@/lib/format";

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const style = STATUS_COLORS[status] || STATUS_COLORS.open;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        style.bg,
        style.text,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
