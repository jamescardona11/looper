import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, type, ref, ...props }: ComponentPropsWithRef<"input">) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
        "file:border-0 file:bg-transparent file:font-medium file:text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
