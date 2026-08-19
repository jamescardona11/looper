import { I18nProvider as LanguageProvider } from "@lingui/react";
import {
  QueryClient,
  QueryClientProvider as CacheProvider,
} from "@tanstack/react-query";
import { getCurrentWindow as currentTauriWindow } from "@tauri-apps/api/window";
import type { ReactNode } from "react";

import { i18n } from "../i18n";
import { CloudSessionBridge } from "./runtime/CloudSessionBridge";
import { LocaleBridge } from "./runtime/LocaleBridge";
import { QueryCacheBridge } from "./runtime/QueryCacheBridge";
import { WindowServicesBridge } from "./runtime/window-services";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const previewMode = import.meta.env.VITE_SIGNAL_PREVIEW === "1";

export function AppProviders({ children }: { children: ReactNode }) {
  const windowLabel = previewMode ? "settings" : currentTauriWindow().label;

  return (
    <LanguageProvider i18n={i18n}>
      <CacheProvider client={client}>
        {previewMode ? null : (
          <>
            <LocaleBridge />
            <CloudSessionBridge />
            <QueryCacheBridge client={client} windowLabel={windowLabel} />
            <WindowServicesBridge windowLabel={windowLabel} />
          </>
        )}
        {children}
      </CacheProvider>
    </LanguageProvider>
  );
}
