import type { ReactNode } from "react";

type WorkspacePageProps = {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

/**
 * The shared structural contract for full-height desktop workspace views.
 *
 * Feature views keep their own data and interaction logic, while this
 * component keeps the page header outside the scrollable/content region.
 */
export default function WorkspacePage({
  header,
  children,
  className = "",
  contentClassName = "",
}: WorkspacePageProps) {
  return (
    <section className={`flex min-h-0 w-full flex-col ${className}`}>
      <div className="shrink-0">{header}</div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
