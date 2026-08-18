/**
 * Tauri's event bridge returns an async cleanup function at runtime even
 * though the public type is synchronous. Shutdown can race that bridge, so a
 * rejected cleanup must not become an unhandled renderer rejection.
 */
export function safeUnlisten(unlisten: (() => void) | undefined): void {
  if (!unlisten) return;

  try {
    void Promise.resolve(unlisten()).catch(() => undefined);
  } catch {
    // The native bridge may already be gone during window shutdown.
  }
}
