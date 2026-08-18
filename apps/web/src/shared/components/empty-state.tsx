import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Centered placeholder for "nothing here yet" states. Mirrors the mobile
// EmptyState (haloed icon + title + description) so both platforms read the
// same, while keeping the web dashed-border drop-zone aesthetic.
export function EmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-border border-dashed px-6 py-20 text-center",
        className,
      )}
    >
      <div className="grid size-14 place-items-center rounded-full border border-border bg-card">
        {icon}
      </div>
      <h3 className="font-medium text-foreground tracking-tight">{title}</h3>
      {description ? (
        <p className="max-w-xs text-muted-foreground text-sm leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}
