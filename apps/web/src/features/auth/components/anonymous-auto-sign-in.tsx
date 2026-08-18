import { useAuth } from "@looper/data";
import { useEffect } from "react";

// Behavior:
//   1. Wait for Convex Auth to resolve the persisted token (localStorage).
//   2. If unauthenticated, call signIn("anonymous") in the background.
//   3. On network/transient error, retry with exponential backoff
//      (3s → 9s → 27s → 60s cap). Convex's client transparently reconnects
//      when the network returns, so the retry is conservative.
//   4. Renders nothing — pure side effect. Drop next to the root once,
//      inside <ConvexAuthProvider>.
//
export function AnonymousAutoSignIn() {
  const { isLoading, isAuthenticated, signIn } = useAuth();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delayMs = 0;

    const attempt = async () => {
      if (cancelled) return;
      try {
        await signIn("anonymous");
      } catch {
        delayMs = delayMs === 0 ? 3_000 : Math.min(delayMs * 3, 60_000);
        timer = setTimeout(attempt, delayMs);
      }
    };

    void attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, isAuthenticated, signIn]);

  return null;
}
