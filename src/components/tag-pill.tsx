import { cn } from "@/modules/shared/utils";
import { X } from "lucide-react";

export function TagPill({
  tag,
  active = false,
  removable = false,
  onClick,
  onRemove,
  className,
}: {
  tag: string;
  active?: boolean;
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground",
        onClick && !active && "hover:border-foreground/30 hover:text-foreground cursor-pointer",
        !onClick && !removable && "cursor-default",
        className,
      )}
    >
      {tag}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}
