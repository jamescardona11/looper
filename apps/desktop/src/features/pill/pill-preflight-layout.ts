import type {
  CapturePillDockPosition,
  CapturePillPresentation,
} from "../../data/capture/dictation";

// `shellPlacement` decides where the expanded pill lands, and the native hover
// hit-test reproduces that anchor in `capture_pill.rs::expanded_rect`. Moving a
// shell anchor here without moving it there leaves a strip of the pill inert;
// the Rust side has the tests that catch it.
export function resolveDockLayout(
  dock: CapturePillDockPosition,
  presentation: CapturePillPresentation,
  menuOpen: boolean,
) {
  const alignment = {
    top_center: "items-start",
    left_center: "items-center justify-start",
    right_center: "items-center justify-end",
    bottom_center: "items-end",
  }[dock];
  const edgeHandle = {
    top_center: "left-1/2 top-0 h-1.5 w-11 -translate-x-1/2 rounded-b-full",
    left_center: "left-0 top-1/2 h-11 w-1.5 -translate-y-1/2 rounded-r-full",
    right_center: "right-0 top-1/2 h-11 w-1.5 -translate-y-1/2 rounded-l-full",
    bottom_center:
      "bottom-0 left-1/2 h-1.5 w-11 -translate-x-1/2 rounded-t-full",
  }[dock];

  let shellPlacement: string;
  if (presentation === "floating") {
    shellPlacement = menuOpen
      ? "bottom-0 left-0"
      : "left-0 top-1/2 -translate-y-1/2";
  } else if (dock === "top_center") {
    shellPlacement = "left-0 top-0";
  } else if (menuOpen || dock === "bottom_center") {
    shellPlacement = "bottom-0 left-0";
  } else {
    shellPlacement =
      dock === "left_center"
        ? "left-0 top-1/2 -translate-y-1/2"
        : "right-0 top-1/2 -translate-y-1/2";
  }

  return { alignment, edgeHandle, shellPlacement };
}

export function languageMenuPlacement(
  sticky: boolean,
  dock: CapturePillDockPosition,
) {
  if (!sticky) return "right-0 top-[calc(100%+6px)]";
  return dock === "top_center"
    ? "left-1/2 top-[54px] -translate-x-1/2"
    : "bottom-[54px] left-1/2 -translate-x-1/2";
}
