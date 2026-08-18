import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ToastPayload } from "../types";

export function subscribeToastShow(
  handler: (payload: ToastPayload) => void,
): Promise<UnlistenFn> {
  return listen<ToastPayload>("toast:show", ({ payload }) => handler(payload));
}

export function subscribeToastHide(handler: () => void): Promise<UnlistenFn> {
  return listen("toast:hide", handler);
}

export async function setToastInteractive(interactive: boolean): Promise<void> {
  await invoke("set_toast_interactive", { interactive });
}

export async function hideToastWindow(): Promise<void> {
  await invoke("toast_dismissed");
  await getCurrentWindow().hide();
}

export async function runToastAction(
  action: string,
  args?: Record<string, unknown>,
): Promise<void> {
  await invoke(action, args);
}
