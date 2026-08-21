import { getCurrentWindow } from "@tauri-apps/api/window";
import { useState } from "react";

import { useSettings } from "../features/settings/queries";
import { OverlayWindows } from "./windows/app-window-components";
import { SettingsWindow } from "./windows/SettingsWindow";
import { useDocumentAppearance } from "./useDocumentAppearance";
import {
  resolveDesktopWindowRoute,
  resolvePreviewRoute,
} from "./windows/window-route";
import "./App.css";

const previewMode = import.meta.env.VITE_SIGNAL_PREVIEW === "1";

function App() {
  const [nativeWindowLabel] = useState(() =>
    previewMode ? "settings" : getCurrentWindow().label,
  );
  const route = resolveDesktopWindowRoute(nativeWindowLabel, previewMode);
  const settingsWindow = route === "settings";
  const settingsQuery = useSettings(undefined, settingsWindow && !previewMode);
  const settingsLoading = previewMode ? false : settingsQuery.isLoading;
  const onboardingVisible =
    settingsWindow &&
    settingsQuery.data != null &&
    !settingsQuery.data.onboarding_completed &&
    !previewMode;
  const previewRoute = previewMode
    ? resolvePreviewRoute(window.location.search)
    : null;

  useDocumentAppearance({
    windowLabel: settingsWindow ? "settings" : nativeWindowLabel,
    previewMode,
    previewTheme: previewRoute === "pill" ? "dark" : "light",
    settingsLoading,
    onboardingVisible,
    storedTheme: settingsQuery.data?.theme_mode,
  });

  if (settingsWindow) {
    return (
      <SettingsWindow
        loading={settingsLoading}
        onboardingVisible={onboardingVisible}
        previewRoute={previewRoute}
      />
    );
  }
  return <OverlayWindows route={route} />;
}

export default App;
