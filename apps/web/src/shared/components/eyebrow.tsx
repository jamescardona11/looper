import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Mono uppercase eyebrow — the system's section / group / metric label.
 * One source so every surface uses the identical JetBrains Mono treatment
 * (mirrors the reference in routes/usage.tsx). Never set body copy with this.
 */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] text-muted-foreground uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </p>
  );
}
