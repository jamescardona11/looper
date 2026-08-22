import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./app/App";
import { AppProviders } from "./app/providers";
import { RootCrashBoundary } from "./app/bootstrap/RootCrashBoundary";
import {
  createFrontendCrashReporter,
  monitorGlobalCrashes,
} from "./app/bootstrap/frontend-crash";
import { initialTextScale } from "./app/bootstrap/initial-text-scale";
import { reportFrontendCrashEvent } from "./data/system/telemetry";
import { installPillPreviewBridge } from "./features/preview/pillPreviewBridge";
import { detectAppPlatform } from "./platform/service";
import { TEXT_SIZE_MODE_STORAGE_KEY } from "./shared/lib/textSize";

const signalPreview = import.meta.env.VITE_SIGNAL_PREVIEW === "1";

if (signalPreview && window.location.search.includes("surface=pill")) {
  installPillPreviewBridge();
}

const currentWindowLabel = signalPreview
  ? "settings"
  : getCurrentWindow().label;

const reportCrash = createFrontendCrashReporter({
  disabled: signalPreview,
  getWindowLabel: () => currentWindowLabel,
  send: reportFrontendCrashEvent,
});
monitorGlobalCrashes(window, reportCrash);

const textScale = initialTextScale({
  disabled: signalPreview,
  windowLabel: currentWindowLabel,
  storedMode: localStorage.getItem(TEXT_SIZE_MODE_STORAGE_KEY),
  platform: detectAppPlatform(),
});
if (textScale !== null) {
  document.documentElement.style.setProperty("--ui-text-scale", textScale);
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing desktop root element");

createRoot(rootElement).render(
  <StrictMode>
    <RootCrashBoundary report={reportCrash}>
      <AppProviders>
        <App />
      </AppProviders>
    </RootCrashBoundary>
  </StrictMode>,
);
