export type DesktopWindowRoute =
  "settings" | "meeting-awareness" | "toast" | "main-overlay";

export type PreviewRoute = "dashboard" | "floating" | "motion" | "pill";

export function resolveDesktopWindowRoute(
  nativeWindowLabel: string,
  previewMode: boolean,
): DesktopWindowRoute {
  if (previewMode || nativeWindowLabel === "settings") return "settings";
  if (nativeWindowLabel === "meeting-awareness") return "meeting-awareness";
  if (nativeWindowLabel === "toast") return "toast";
  return "main-overlay";
}

export function resolvePreviewRoute(search: string): PreviewRoute {
  const surface = new URLSearchParams(search).get("surface");
  if (surface === "floating" || surface === "motion" || surface === "pill") {
    return surface;
  }
  return "dashboard";
}
