import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ShortcutCapturePayload =
  | { kind: "preview"; shortcut: string }
  | { kind: "captured"; shortcut: string }
  | { kind: "error"; message: string };

export const checkShortcutPermission = () =>
  invoke<boolean>("check_accessibility_permission");

export type ShortcutStatus =
  "ready" | "accessibility_required" | "unavailable" | "disabled" | "capturing";

export const refreshShortcutStatus = () =>
  invoke<ShortcutStatus>("refresh_shortcut_status");

export const retryShortcuts = () => invoke<void>("retry_shortcuts");

export const openShortcutPermissionSettings = () =>
  invoke<void>("open_accessibility_settings");

export const openShortcutPermissionHelp = async () => {
  if (!(await checkShortcutPermission())) {
    return openShortcutPermissionSettings();
  }
  return invoke<void>("open_accessibility_help");
};

export const subscribeShortcutCapture = (
  handler: (payload: ShortcutCapturePayload) => void,
): Promise<UnlistenFn> =>
  listen<ShortcutCapturePayload>("shortcut:capture", ({ payload }) =>
    handler(payload),
  );
