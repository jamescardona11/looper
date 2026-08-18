import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverTitle = BasePopover.Title;

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface PopoverContentProps extends ComponentPropsWithoutRef<typeof BasePopover.Popup> {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  alignOffset?: number;
  children: ReactNode;
}

// Floating panel anchored to a trigger, with portal, collision-aware
// positioning, focus management and transitions. Replaces hand-rolled
// absolute-positioned dropdowns that broke near viewport edges.
export function PopoverContent({
  className,
  children,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  alignOffset = 0,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50"
      >
        <BasePopover.Popup
          className={cn(
            "rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none",
            "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out",
            "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
