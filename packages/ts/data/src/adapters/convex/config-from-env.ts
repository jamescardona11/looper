// Convex adapter — configFromEnv (the mount seam).
//
// The app mounts `<ConvexProvider config={configFromEnv(env, extras)}>`. Both
// `ConvexProvider` and `configFromEnv` come from the Convex adapter, so their
// types match by construction. `extras` is the ConvexConfigExtras shape.
//
// The package never reads import.meta.env itself: the web app injects its
// environment bag.

import type { ConvexConfigExtras, ConvexEnvConfig, RawEnv } from "../../port/provider";

export function configFromEnv(env: RawEnv, extras: ConvexConfigExtras = {}): ConvexEnvConfig {
  const convexUrl = env.VITE_CONVEX_URL ?? env.EXPO_PUBLIC_CONVEX_URL ?? null;
  return {
    convexUrl,
    ...(extras.storage !== undefined && { storage: extras.storage }),
    ...(extras.cache !== undefined && { cache: extras.cache }),
    ...(extras.storageUploader !== undefined && { storageUploader: extras.storageUploader }),
    ...(extras.setupBanner !== undefined && { setupBanner: extras.setupBanner }),
  };
}
