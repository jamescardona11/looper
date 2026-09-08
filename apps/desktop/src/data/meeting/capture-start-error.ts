import { invoke } from "@tauri-apps/api/core";

export type CaptureRecovery = "models" | "microphone" | "system_audio";

export const captureRecoveryActions = {
  models: { command: "open_llm_cleanup_settings", label: "Get model" },
  microphone: { command: "open_microphone_settings", label: "Allow mic" },
  system_audio: { command: "open_system_audio_settings", label: "Allow audio" },
} as const;

export class CaptureStartError extends Error {
  constructor(
    message: string,
    readonly recovery: CaptureRecovery | null = null,
  ) {
    super(message);
    this.name = "CaptureStartError";
  }
}

export function captureStartError(cause: unknown): CaptureStartError {
  if (cause instanceof CaptureStartError) return cause;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    const recovery =
      "recovery" in cause &&
      (cause.recovery === "models" ||
        cause.recovery === "microphone" ||
        cause.recovery === "system_audio")
        ? cause.recovery
        : null;
    return new CaptureStartError(cause.message, recovery);
  }
  return new CaptureStartError(String(cause));
}

export function rejectCaptureStart(cause: unknown): never {
  throw captureStartError(cause);
}

export async function showCaptureStartError(cause: unknown): Promise<void> {
  const error = captureStartError(cause);
  const action = error.recovery ? captureRecoveryActions[error.recovery] : null;
  await invoke("debug_show_toast", {
    toastType: "error",
    message: error.message,
    ...(action ? { action: action.command, actionLabel: action.label } : {}),
  });
}
