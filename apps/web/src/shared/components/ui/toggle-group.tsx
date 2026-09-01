import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ToggleGroupItem<T extends string> {
  value: T;
  label: ReactNode;
  "aria-label"?: string;
  disabled?: boolean;
}

interface ToggleGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<ToggleGroupItem<T>>;
  "aria-label"?: string;
  className?: string;
  size?: "sm" | "md";
}

// Single-select segmented control over Base UI ToggleGroup. Base UI models the
// pressed state as an array; here we expose a single value and ignore the
// "deselect the active item" transition so exactly one option stays pressed —
// the contract a segmented control needs (roving-tabindex arrow keys come free).
export function ToggleGroup<T extends string>({
  value,
  onValueChange,
  items,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: ToggleGroupProps<T>) {
  return (
    <BaseToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const selected = next.at(-1);
        if (selected) onValueChange(selected as T);
      }}
      // Base UI renders aria-orientation on the root; a generic/group role does
      // not allow it (axe aria-allowed-attr, WCAG 4.1.2). role="toolbar" is the
      // correct ARIA pattern for a horizontal set of toggle buttons and DOES
      // permit aria-orientation, so it clears the violation without losing semantics.
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1",
        className,
      )}
    >
      {items.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          aria-label={item["aria-label"]}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md font-medium text-muted-foreground outline-none transition-colors",
            size === "sm" ? "h-11 px-2.5 text-xs sm:h-10" : "h-11 px-3 text-sm sm:h-10",
            "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "data-[pressed]:bg-card data-[pressed]:text-foreground data-[pressed]:shadow-sm",
            "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          )}
        >
          {item.label}
        </Toggle>
      ))}
    </BaseToggleGroup>
  );
}
