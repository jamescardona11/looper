import type { AuthTokenStorage } from "@looper/data";
import * as SecureStore from "expo-secure-store";

export const secureStorage: AuthTokenStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const refreshTokenKey = "__convexAuthRefreshToken";

/** Mirrors @convex-dev/auth's namespaced storage key without exposing it to UI. */
export function convexAuthStorageKey(key: string, convexUrl: string): string {
  return `${key}_${convexUrl.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function getConvexRefreshToken(convexUrl: string): Promise<string | null> {
  return secureStorage.getItem(convexAuthStorageKey(refreshTokenKey, convexUrl));
}
