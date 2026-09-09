import type {
  CapturePillDockPosition,
  CapturePillPresentation,
} from "../../data/capture/dictation";

// `launcherPlacement` anchors the same shell before and during hover expansion.
// The native window grows around that anchor in `pill/capture.rs`; changing one
// side without the other makes the visible pill move as hover begins.
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
  // El pill compacto debe seguir la misma ancla que el rail expandido. Antes
  // Dock pintaba una manija púrpura de borde que no compartía el lenguaje del
  // launcher negro ni explicaba dónde iniciar la captura.
  const launcherPlacement = {
    top_center: "left-1/2 top-0 -translate-x-1/2",
    left_center: "left-0 top-1/2 -translate-y-1/2",
    right_center: "right-0 top-1/2 -translate-y-1/2",
    bottom_center: "bottom-0 left-1/2 -translate-x-1/2",
  }[dock];

  let shellPlacement: string;
  if (menuOpen && presentation === "floating") {
    // Language amplía la ventana hacia el lado libre. El frame cerrado mide
    // exactamente lo mismo que el shell, así que anclarlo al borde conserva
    // su coordenada global sin márgenes transparentes.
    shellPlacement = dock === "top_center" ? "left-0 top-0" : "bottom-0 left-0";
  } else if (menuOpen && (dock === "left_center" || dock === "right_center")) {
    shellPlacement =
      dock === "left_center" ? "bottom-0 left-0" : "bottom-0 right-0";
  } else if (presentation === "floating") {
    shellPlacement = "left-0 top-1/2 -translate-y-1/2";
  } else if (dock === "top_center") {
    shellPlacement = "left-0 top-0";
  } else if (dock === "bottom_center") {
    shellPlacement = "bottom-0 left-0";
  } else {
    shellPlacement =
      dock === "left_center"
        ? "left-0 top-1/2 -translate-y-1/2"
        : "right-0 top-1/2 -translate-y-1/2";
  }

  const hoverShellPlacement = menuOpen
    ? shellPlacement
    : presentation === "floating"
      ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      : launcherPlacement;

  return {
    alignment,
    launcherPlacement,
    shellPlacement,
    hoverShellPlacement,
  };
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
