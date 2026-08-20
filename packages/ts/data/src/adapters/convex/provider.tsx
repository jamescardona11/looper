// Convex adapter — ConvexProvider (the app-facing provider component).
//
// NOTE: convex/react also exports a component named `ConvexProvider`. This
// adapter does not import that library component (it builds the client from
// `ConvexReactClient` and mounts `ConvexAuthProvider` directly), so our
// app-facing `ConvexProvider` owns the name with no collision. If you ever
// import the library's `ConvexProvider` here, alias it
// (e.g. `import { ConvexProvider as ConvexReactProvider } from "convex/react"`).
//
// Centralizes the React clients' auth and Convex provider setup. It:
//   - builds a ConvexReactClient from the injected environment config,
//   - renders @convex-dev/auth's <ConvexAuthProvider>,
//   - gates the tree behind a SetupBanner when convexUrl is null,
//   - exposes via React context a one-shot authenticated query() escape hatch,
//     getClient(), and the injected read-cache.
//
// No platform-only imports belong here. Storage and cache implementations are
// injected by the app through the config.

import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ConvexAuth } from "../../port/hooks";
import {
  ConvexContext,
  type ConvexContextValue,
  type ConvexProviderProps,
  useConvexBackend,
} from "../../port/provider";

// Re-export the auth-lib seam so apps import it from the data port, never from
// @convex-dev/auth directly. SplashHider/__root gate on useConvexAuth;
// useUpgradeFromAnonymous composes signIn() from useAuthActions.
// Re-export the generic context accessor so the adapter barrel can surface
// `useConvexBackend` from a single module (./provider) per the contract.
export { useAuthActions, useConvexAuth, useConvexBackend };

// The ConvexAuth seam. Wraps @convex-dev/auth's useConvexAuth
// (isLoading/isAuthenticated) + useAuthActions (signIn/signOut).
export function useAuth(): ConvexAuth {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  return {
    isLoading,
    isAuthenticated,
    signIn,
    signOut,
  };
}

// Default setup banner for clients without a configured backend URL. Apps may
// override it through `config.setupBanner`.
function DefaultSetupBanner(): ReactNode {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "10px 16px",
        background: "oklch(0.95 0.05 264)",
        borderBottom: "1px solid oklch(0.6 0.15 264)",
        fontSize: 13,
        color: "oklch(0.2 0.05 264)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <strong>Setup needed:</strong> the backend URL is not set. Run{" "}
      <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4 }}>
        pnpm --dir backend dev
      </code>
      , then add the URL to your app env and reload.
    </div>
  );
}

export function ConvexProvider({ config, children }: ConvexProviderProps): ReactNode {
  const { convexUrl, storage, cache, storageUploader, setupBanner } = config;

  // Keep one client per URL so imperative reads share the authenticated session
  // managed by ConvexAuthProvider.
  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });
  }, [convexUrl]);

  const contextValue = useMemo<ConvexContextValue | null>(() => {
    if (!client) return null;
    return {
      query: (ref, args) => client.query(ref as any, args as any),
      getClient: () => client,
      ...(cache !== undefined && { cache }),
      ...(storageUploader !== undefined && { storageUploader }),
    };
  }, [client, cache, storageUploader]);

  // Null-client gate: when the URL is unset we render ONLY the banner and never
  // mount children — mounting the app outside <ConvexAuthProvider> would crash
  // every route on its first Convex hook ("Could not find Convex client").
  if (!client || !contextValue) {
    return setupBanner ?? <DefaultSetupBanner />;
  }

  return (
    <ConvexContext.Provider value={contextValue}>
      <ConvexAuthProvider client={client} {...(storage ? { storage } : {})}>
        {children}
      </ConvexAuthProvider>
    </ConvexContext.Provider>
  );
}

// Hooks in this adapter use this to reach the one-shot query() + raw client +
// cache.
