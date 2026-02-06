import { cn } from "@/modules/shared/utils";

export function UsdcAmount({
  amount,
  size = "default",
  className,
}: {
  amount: string | number;
  size?: "sm" | "default" | "lg" | "xl";
  className?: string;
}) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = value.toFixed(2);

  const sizeStyles = {
    sm: "text-sm",
    default: "text-lg",
    lg: "text-2xl",
    xl: "text-4xl",
  };

  return (
    <span
      className={cn(
        "font-bold tabular-nums text-usdc",
        sizeStyles[size],
        className,
      )}
    >
      ${formatted}
      <span className="text-muted-foreground font-normal text-[0.6em] ml-1">
        USDC
      </span>
    </span>
  );
}
