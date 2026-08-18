import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PageSurface } from "@/shared/components/page-surface";

const WIDTH_CLASS = {
  standard: "max-w-6xl",
  compact: "max-w-5xl",
} as const;

/**
 * Shared frame for authenticated product routes.
 *
 * Page features keep their own content layout, while spacing, readable width,
 * surface and foreground remain stable when the product theme evolves.
 */
export function ProductPageLayout({
  children,
  width = "standard",
  compactTop = false,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH_CLASS;
  compactTop?: boolean;
}) {
  return (
    <PageSurface className="min-h-full">
      <div
        className={cn(
          "mx-auto w-full px-5 sm:px-8",
          WIDTH_CLASS[width],
          compactTop ? "py-6 md:py-12" : "py-8 sm:py-12",
        )}
      >
        {children}
      </div>
    </PageSurface>
  );
}
