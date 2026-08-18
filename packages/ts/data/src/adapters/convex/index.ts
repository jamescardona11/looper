// Convex adapter — public surface.
//
// Assembles the Convex implementation of the active data surface.
//
// The provider + auth seam + persisted-query wrapper, plus the
// assembled domain-hook surface, are all in place. apps/* only ever import from
// packages/ts/data's root barrel (../../index.ts), never from convex/react or
// _generated.

// Convex chat streams tokens, so apps can render a stop affordance.
export const convexCapabilities = { streamingChat: true } as const;
// The mount seam: <ConvexProvider config={configFromEnv(env)}>.
export { configFromEnv } from "./config-from-env";
// Domain hooks assembled by the selected capabilities.
export * from "./hooks";
export { SKIP, type Skip } from "./query-control";
export { queryCacheKey, usePersistedQuery } from "./persisted-query";
// Provider + auth seam. The contract names ConvexProvider / useConvexBackend /
// useAuth; the Convex implementations are surfaced under those names here.
export {
  ConvexProvider,
  useAuth,
  useAuthActions,
  useConvexAuth,
  useConvexBackend,
} from "./provider";
