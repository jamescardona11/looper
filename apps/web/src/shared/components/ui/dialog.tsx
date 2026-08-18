import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { IconX } from "@tabler/icons-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;

const backdropClasses = cn(
  "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-150",
  "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
);

interface DialogContentProps extends ComponentPropsWithoutRef<typeof BaseDialog.Popup> {
  /** Render the top-right close affordance. Default true. */
  showClose?: boolean;
  closeLabel?: string;
}

// Centered modal surface with built-in portal, dimmed backdrop, focus trap,
// scroll lock and entry/exit transitions. Consumers override placement by
// passing positioning utilities in `className` (twMerge dedupes top/translate),
// e.g. a command palette anchors to `top-[15vh] translate-y-0`.
export function DialogContent({
  className,
  children,
  showClose = true,
  closeLabel = "Close",
  ...props
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className={backdropClasses} />
      <BaseDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
          "rounded-2xl border border-border bg-card text-card-foreground shadow-2xl outline-none",
          "origin-center transition-[transform,opacity] duration-150 ease-out",
          "data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <BaseDialog.Close
            aria-label={closeLabel}
            className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconX className="size-4" />
          </BaseDialog.Close>
        ) : null}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 p-6 pb-2", className)}>{children}</div>;
}

export function DialogTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <BaseDialog.Title
      className={cn("font-medium text-base text-foreground tracking-tight", className)}
    >
      {children}
    </BaseDialog.Title>
  );
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <BaseDialog.Description className={cn("text-muted-foreground text-sm", className)}>
      {children}
    </BaseDialog.Description>
  );
}
