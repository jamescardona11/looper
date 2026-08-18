import { NativeModules } from "react-native";
import type { KeyboardSyncPayload } from "./keyboard-config";

interface LooperKeyboardModule {
  sync(payload: KeyboardSyncPayload): Promise<void>;
  openSettings(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

const nativeModule = NativeModules.LooperKeyboard as LooperKeyboardModule | undefined;

export function isNativeKeyboardAvailable(): boolean {
  return nativeModule !== undefined;
}

export async function syncNativeKeyboard(payload: KeyboardSyncPayload): Promise<void> {
  if (!nativeModule) {
    throw new Error("El teclado requiere un development build de Looper.");
  }
  await nativeModule.sync(payload);
}

export async function openNativeKeyboardSettings(): Promise<void> {
  if (!nativeModule) {
    throw new Error("El teclado requiere un development build de Looper.");
  }
  await nativeModule.openSettings();
}

export async function isNativeKeyboardEnabled(): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.isEnabled();
}
