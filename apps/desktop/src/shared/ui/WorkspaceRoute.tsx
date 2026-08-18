import type { ReactNode } from "react";

const WIDTH_CLASS = {
  reading: "max-w-[820px]",
  full: "max-w-none",
} as const;

type WorkspaceRouteProps = {
  active: boolean;
  children: ReactNode;
  width?: keyof typeof WIDTH_CLASS;
  paddedTop?: boolean;
};

/** Shared route slot inside the desktop workspace stage. */
export default function WorkspaceRoute({
  active,
  children,
  width = "reading",
  paddedTop = true,
}: WorkspaceRouteProps) {
  return (
    <div
      hidden={!active}
      aria-hidden={!active}
      className={`mx-auto min-h-0 w-full min-w-0 flex-1 flex-col ${active ? "flex" : "hidden"} ${WIDTH_CLASS[width]} ${paddedTop ? "pt-8" : ""}`}
    >
      {children}
    </div>
  );
}
