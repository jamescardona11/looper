import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = BaseTooltip.Provider;

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  label: ReactNode;
  children: ReactElement;
  side?: Side;
  sideOffset?: number;
  className?: string;
}

// Accessible hover/focus tooltip replacing bare `title` attributes (which never
// show on keyboard focus and can't be styled). `children` is the trigger
// element; Base UI merges the trigger props (incl. aria-describedby) onto it.
export function Tooltip({
  label,
  children,
  side = "top",
  sideOffset = 6,
  className,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={sideOffset} className="z-50">
          <BaseTooltip.Popup
            className={cn(
              "rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md outline-none",
              "origin-[var(--transform-origin)] transition-[transform,opacity] duration-100 ease-out",
              "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              className,
            )}
          >
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
