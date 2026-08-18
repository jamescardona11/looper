import { Select as BaseSelect } from "@base-ui/react/select";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/cn";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  items: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  /** Accessible name when the trigger has no associated visible label. */
  "aria-label"?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

// Token-styled wrapper over Base UI Select. Replaces native <select> 1:1 while
// adding a styled popup, keyboard typeahead, scroll-locking and focus return.
// The `items` prop is forwarded to Base UI so <Select.Value /> can render the
// selected option's label (not its raw value) when the popup is closed.
export function Select<T extends string>({
  value,
  onValueChange,
  items,
  placeholder,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  return (
    <BaseSelect.Root
      items={items as Array<{ value: T; label: string }>}
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-10 w-full select-none items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-foreground text-sm transition-colors",
          "hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "data-[disabled]:cursor-not-allowed data-[popup-open]:bg-secondary/40 data-[disabled]:opacity-50",
          className,
        )}
      >
        <BaseSelect.Value>
          {(value: T | null) => {
            const label = items.find((item) => item.value === value)?.label;
            return (
              <span className={cn("truncate", !label && "text-muted-foreground")}>
                {label ?? placeholder}
              </span>
            );
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="shrink-0 text-muted-foreground">
          <IconChevronDown className="size-4" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
          <BaseSelect.Popup
            className={cn(
              "max-h-[min(24rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none",
              "origin-[var(--transform-origin)] transition-[transform,opacity] duration-150 ease-out",
              "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            )}
          >
            {items.map((item) => (
              <BaseSelect.Item
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                className={cn(
                  "flex cursor-default select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm outline-none",
                  "data-[highlighted]:bg-secondary data-[highlighted]:text-foreground",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="text-primary">
                  <IconCheck className="size-4" />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
