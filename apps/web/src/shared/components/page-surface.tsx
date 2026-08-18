import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageSurfaceProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

/**
 * Root visual contract for every web surface.
 *
 * Layout families own geometry and chrome; this component owns the product
 * background and foreground so a theme change cannot drift route by route.
 */
export function PageSurface<T extends ElementType = "main">({
  as,
  children,
  className,
  ...props
}: PageSurfaceProps<T>) {
  const Component = as ?? "main";

  return (
    <Component className={cn("bg-background text-foreground", className)} {...props}>
      {children}
    </Component>
  );
}
