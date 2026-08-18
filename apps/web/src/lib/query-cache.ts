// Synchronous browser cache injected into @looper/data.
//
// The data adapter owns serialization and key namespacing. This platform layer
// only exposes localStorage through the CacheBackend contract so cached query
// data is available on the first render while Convex reconnects.
//
// Note: cached values are the signed-in user's own data, stored origin-local and
// unencrypted (same trust level as the rendered screen). Do NOT cache secrets
// here — auth tokens are handled by the Convex auth client, not this cache.

import type { AuthTokenStorage, CacheBackend } from "@looper/data";

const authMemory = new Map<string, string>();

export const browserQueryCache: CacheBackend = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Query caching is optional in restricted desktop webviews.
    }
  },
};

export const browserAuthStorage: AuthTokenStorage = {
  async getItem(key) {
    try {
      return window.localStorage.getItem(key) ?? authMemory.get(key) ?? null;
    } catch {
      return authMemory.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    authMemory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The in-memory copy keeps this webview authenticated for its lifetime.
    }
  },
  async removeItem(key) {
    authMemory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // The restricted webview had no persistent copy to remove.
    }
  },
};
