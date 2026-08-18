// Convex adapter — usePersistedQuery (platform-agnostic read-cache wrapper).
//
// A drop-in for Convex's useQuery plus a stable `cacheName`: returns the live
// reactive value when available, else the
// last-known cached value (read synchronously) during cold-start / offline,
// writing fresh values back on every delivery.
//
//   const messages = usePersistedQuery("agent.messages.list", api.agent.messages.list, args);
//
// This file does not choose a storage implementation. The synchronous cache
// backend is injected through ConvexProvider (`useConvexBackend().cache`).
// When no cache backend is injected, it degrades to a plain useQuery — so it
// works even before the app wires a cache. Read-only: never writes to the
// server, no conflict resolution.

import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useEffect, useMemo } from "react";
import { useConvexBackend } from "../../port/provider";

const PREFIX = "qc:";

// Stable cache key from a caller-supplied name + the query args. Different args
// cache independently; identical args reuse the entry.
export function queryCacheKey(name: string, args: unknown): string {
  let argsPart = "";
  try {
    argsPart = JSON.stringify(args ?? {});
  } catch {
    argsPart = "";
  }
  return `${name}|${argsPart}`;
}

export function usePersistedQuery<Query extends FunctionReference<"query">>(
  cacheName: string,
  query: Query,
  args: FunctionArgs<Query> | "skip",
): FunctionReturnType<Query> | undefined {
  const { cache } = useConvexBackend();
  const live = useQuery(query, args);
  const key = args === "skip" ? null : queryCacheKey(cacheName, args);

  // Read once per cache/key pair. This stays synchronous for first-paint data
  // without reading or mutating refs during render, so React Compiler can
  // optimize consumers safely.
  const fallback = useMemo(
    () => (key && cache ? readCache<FunctionReturnType<Query>>(cache, key) : undefined),
    [cache, key],
  );

  useEffect(() => {
    if (key && cache && live !== undefined) {
      writeCache(cache, key, live);
    }
  }, [key, cache, live]);

  return live !== undefined ? live : fallback;
}

function readCache<T>(cache: { read(key: string): string | null }, key: string): T | undefined {
  try {
    const raw = cache.read(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    // Corrupt/legacy entry — treat as a miss; it'll be overwritten on next write.
    return undefined;
  }
}

function writeCache(
  cache: { write(key: string, value: string): void },
  key: string,
  value: unknown,
): void {
  try {
    cache.write(PREFIX + key, JSON.stringify(value));
  } catch {
    // Best-effort: a failed cache write must never break the live UI.
  }
}
