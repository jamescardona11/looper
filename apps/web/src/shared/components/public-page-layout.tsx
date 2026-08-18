import type { ReactNode } from "react";
import { PageSurface } from "@/shared/components/page-surface";
import { PublicPageNav } from "@/shared/components/public-page-nav";

/** Shared chrome for public, non-landing routes. */
export function PublicPageLayout({
  children,
  purchaseRequest = false,
}: {
  children: ReactNode;
  purchaseRequest?: boolean;
}) {
  return (
    <PageSurface className="min-h-screen">
      <PublicPageNav purchaseRequest={purchaseRequest} />
      {children}
    </PageSurface>
  );
}
