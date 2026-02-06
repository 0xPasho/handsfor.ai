import { cn } from "@/modules/shared/utils";

type TimelineStep = {
  label: string;
  active: boolean;
  completed: boolean;
};

export function Timeline({
  steps,
  className,
}: {
  steps: TimelineStep[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0", className)}>
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "size-2 rounded-full mt-1.5",
                step.completed
                  ? "bg-foreground"
                  : step.active
                    ? "bg-foreground ring-4 ring-foreground/10"
                    : "bg-border",
              )}
            />
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "w-px h-6",
                  step.completed ? "bg-foreground/30" : "bg-border",
                )}
              />
            )}
          </div>
          <span
            className={cn(
              "text-xs",
              step.completed || step.active
                ? "text-foreground font-medium"
                : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
