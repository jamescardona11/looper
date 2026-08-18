import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface MenuContentProps extends ComponentPropsWithoutRef<typeof BaseMenu.Popup> {
  side?: Side;
  align?: Align;
  sideOffset?: number;
  children: ReactNode;
}

// Dropdown menu with portal, roving-tabindex keyboard nav, typeahead and
// collision-aware positioning. Replaces hand-rolled role="menu" panels.
export function MenuContent({
  className,
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  ...props
}: MenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <BaseMenu.Popup
          className={cn(
            "min-w-[10rem] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none",
            "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out",
            "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

interface MenuItemProps extends ComponentPropsWithoutRef<typeof BaseMenu.Item> {
  destructive?: boolean;
}

export function MenuItem({ className, destructive, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item
      className={cn(
        "flex w-full cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none",
        "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive
          ? "text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
          : "text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <BaseSeparator className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}
