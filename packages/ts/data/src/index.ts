// @looper/data — public data barrel.
//
// apps/* and shared packages import domain hooks and types from here instead of
// touching convex/react or generated API types directly. This package has ONE
// backend (Convex); the Convex runtime surface is re-exported below.
// biome-ignore-all assist/source/organizeImports: module markers keep optional exports removable.
export * from "./adapters/convex";
// The remaining real seams around the Convex adapter.
export type { ConvexAuth, OneShotClient } from "./port/hooks";

// The provider seam: <ConvexProvider> contract + useConvexBackend context accessor +
// injectable config shapes (env, cache, secureStorage).
export {
  type AuthTokenStorage,
  type CacheBackend,
  type ConvexConfigExtras,
  ConvexContext,
  type ConvexContextValue,
  type ConvexEnvConfig,
  // The provider *component type* the contract uses. Aliased to avoid colliding
  // with the runtime `ConvexProvider` (the Convex adapter's component) above.
  type ConvexProvider as ConvexProviderType,
  type ConvexProviderProps,
  type RawEnv,
  type StorageUploader,
  type StorageUploadInput,
  type StorageUploadResult,
  useConvexBackend,
} from "./port/provider";
// Domain types (pure TS, no Id<>, no convex).
export * from "./types";
