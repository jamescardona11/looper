import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Compact placeholder for "nothing here yet" states. It explains the next
// state without turning absence into the largest object on the page.
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
        "web-product-panel flex min-h-40 flex-col items-center justify-center gap-4 rounded-xl px-6 py-8 text-center sm:flex-row sm:justify-start sm:px-7 sm:text-left",
        className,
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--web-highlight)] [&_svg]:size-5">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-foreground tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-1 max-w-md text-pretty text-muted-foreground text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
