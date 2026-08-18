// @looper/data — the ConvexProvider contract.
//
// Provider seam. The Convex adapter ships a concrete <ConvexProvider> that:
//   - constructs its client from an INJECTED env config (the package never reads
//     process.env or import.meta.env — apps pass the resolved
//     values, keeping the package isomorphic + testable),
//   - wires the Convex auth lib,
//   - gates the tree behind a SetupBanner when the Convex URL is absent,
//   - exposes a one-shot query() escape hatch + the injected read-cache via
//     React context (read with `useConvexBackend()`).
//
// Browser storage and upload transports are injected by the app, keeping this
// contract free of DOM storage implementations.

import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { OneShotClient } from "./hooks";

// Platform-owned storage POST step. The Convex adapter mints the upload URL and
// owns the mutation that consumes the resulting storageId; the app supplies the
// transport for the actual blob/file upload. The input discriminates the
export interface StorageUploadInput {
  uploadUrl: string;
  file: Blob;
  type?: string;
  // Upload progress as an integer percentage (0-100).
  onProgress?: (percent: number) => void;
}

// sizeBytes is the actual byte count POSTed — the adapter is the only place
// that ever holds the Blob, so it reports the size the protocol records.
export interface StorageUploadResult {
  storageId: string;
  sizeBytes: number;
}

export type StorageUploader = (input: StorageUploadInput) => Promise<StorageUploadResult>;

// The raw environment bag the app injects into `configFromEnv(env)`.
export type RawEnv = Record<string, string | undefined>;

// Synchronous browser read-cache backend.
// READ-ONLY display fallback — never writes to the server, no conflict resolution.
export interface CacheBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

// Token store injected by the web application.
export interface AuthTokenStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

// The env/config the app resolves and injects. `convexUrl: null` is the
// not-configured state renders the setup banner.
export interface ConvexEnvConfig {
  convexUrl: string | null;
  storage?: AuthTokenStorage;
  cache?: CacheBackend;
  storageUploader?: StorageUploader;
  setupBanner?: ReactNode;
}

export interface ConvexProviderProps {
  config: ConvexEnvConfig;
  children?: ReactNode;
}

// The non-env extras the app passes to configFromEnv(env, extras):
//   - storage: auth-token store.
//   - cache: injected read-cache.
//   - setupBanner: a custom not-configured banner overriding the adapter default.
export interface ConvexConfigExtras {
  storage?: AuthTokenStorage;
  cache?: CacheBackend;
  storageUploader?: StorageUploader;
  setupBanner?: ReactNode;
}

// What `useConvexBackend()` exposes to the tree. The Convex adapter fills this in.
export interface ConvexContextValue {
  // One-shot imperative query (account-data export, out-of-React reads).
  query: OneShotClient["query"];
  // Raw underlying client for platform-specific operations not covered by the port.
  getClient: () => unknown;
  // The injected read-cache, if any (usePersistedQuery degrades to plain
  // useQuery when absent).
  cache?: CacheBackend;
  // Platform-owned POST transport for attachment uploads.
  storageUploader?: StorageUploader;
}

export const ConvexContext = createContext<ConvexContextValue | null>(null);

export function useConvexBackend(): ConvexContextValue {
  const ctx = useContext(ConvexContext);
  if (!ctx) {
    throw new Error("useConvexBackend must be used within a <ConvexProvider>");
  }
  return ctx;
}

// The provider component type the Convex adapter implements.
export type ConvexProvider = (props: ConvexProviderProps) => ReactNode;
