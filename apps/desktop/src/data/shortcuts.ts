import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ShortcutCapturePayload =
  | { kind: "preview"; shortcut: string }
  | { kind: "captured"; shortcut: string }
  | { kind: "error"; message: string };

export const checkShortcutPermission = () =>
  invoke<boolean>("check_accessibility_permission");

export const retryShortcuts = () => invoke<void>("retry_shortcuts");

export const openShortcutPermissionSettings = () =>
  invoke<void>("open_accessibility_settings");

// Los ajustes del sistema enseñan el permiso ya marcado aunque no valga para
// este binario; la explicación de qué hacer está dentro de la app.
export const openShortcutPermissionHelp = () =>
  invoke<void>("open_accessibility_help");

export const subscribeShortcutCapture = (
  handler: (payload: ShortcutCapturePayload) => void,
): Promise<UnlistenFn> =>
  listen<ShortcutCapturePayload>("shortcut:capture", ({ payload }) =>
    handler(payload),
  );
