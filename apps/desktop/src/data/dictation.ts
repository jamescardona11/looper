// Entrada explícita al flujo de Dictation desde el dock de la bandeja.
// Mantiene fuera del componente el contrato Tauri de este gesto de captura.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type CapturePillPresentation = "dock" | "floating";
export type CapturePillDockPosition =
  "top_center" | "left_center" | "right_center" | "bottom_center";

export interface CapturePillPreferences {
  presentation: CapturePillPresentation;
  dockPosition: CapturePillDockPosition;
  language: string;
}

export async function startDictationFromDock(): Promise<void> {
  await invoke("start_dictation_from_dock");
}

export async function setDictationLanguage(language: string): Promise<void> {
  await invoke("set_dictation_language", { language });
}

export async function setPreflightLanguageMenuOpen(
  open: boolean,
): Promise<void> {
  await invoke("set_preflight_language_menu_open", { open });
}

export async function syncPillRendererState(): Promise<void> {
  await invoke("sync_pill_renderer_state");
}

export async function getCapturePillPreferences(): Promise<CapturePillPreferences> {
  return invoke("get_capture_pill_preferences");
}

export async function setCapturePillPresentation(
  presentation: CapturePillPresentation,
): Promise<CapturePillPreferences> {
  return invoke("set_capture_pill_presentation", { presentation });
}

export async function setCapturePillDockPosition(
  dockPosition: CapturePillDockPosition,
): Promise<CapturePillPreferences> {
  return invoke("set_capture_pill_dock_position", { dockPosition });
}

export async function onCapturePillPreferencesChanged(
  callback: (preferences: CapturePillPreferences) => void,
): Promise<UnlistenFn> {
  return listen<CapturePillPreferences>(
    "capture-pill:preferences",
    ({ payload }) => callback(payload),
  );
}
