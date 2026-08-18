import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ref, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: ComponentPropsWithRef<"h3">) {
  return (
    <h3
      ref={ref}
      className={cn("font-medium text-base leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ref, ...props }: ComponentPropsWithRef<"div">) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
}
