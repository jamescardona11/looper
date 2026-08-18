import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
}

// Token-styled wrapper over Base UI Switch. Renders a real <button role="switch">
// with a hidden form input, replacing hand-rolled role="switch" divs that lacked
// keyboard support and a submittable value.
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: SwitchProps) {
  return (
    <BaseSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent outline-none transition-colors",
        "bg-input data-[checked]:bg-primary",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb className="size-5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[checked]:translate-x-[1.375rem]" />
    </BaseSwitch.Root>
  );
}
