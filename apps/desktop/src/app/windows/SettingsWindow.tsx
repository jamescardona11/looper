import { lazy, Suspense, type ReactNode } from "react";

import AneCompileOverlay from "../../features/settings/models/AneCompileOverlay";
import ModelDownloadActivityBar from "../../features/settings/models/ModelDownloadActivityBar";
import { ModelDownloadActivityProvider } from "../../features/settings/models/modelDownloadActivity";
import type { PreviewRoute } from "./window-route";

const Home = lazy(() => import("../home/Home"));
const Onboarding = lazy(
  () => import("../../features/onboarding/OnboardingScreen"),
);
const PreviewDashboard = lazy(
  () => import("../../features/preview/SignalPreviewDashboard"),
);
const PreviewFloating = lazy(
  () => import("../../features/preview/SignalPreviewFloating"),
);
const PreviewMotion = lazy(
  () => import("../../features/preview/SignalPreviewMotionLab"),
);
const PreviewPill = lazy(
  () => import("../../features/preview/SignalPreviewPill"),
);
const PreviewOnboarding = lazy(
  () => import("../../features/preview/SignalPreviewOnboarding"),
);
const previewMode = import.meta.env.VITE_SIGNAL_PREVIEW === "1";

type SettingsWindowProps = {
  loading: boolean;
  onboardingVisible: boolean;
  previewRoute: PreviewRoute | null;
};

const frameClass = "settings-view h-screen w-screen overflow-hidden";
const loadingFrame = <div className={`${frameClass} bg-surface-secondary`} />;

export function SettingsWindow({
  loading,
  onboardingVisible,
  previewRoute,
}: SettingsWindowProps) {
  if (loading) return loadingFrame;

  const content = (
    <Suspense fallback={loadingFrame}>
      <div className={frameClass}>
        {settingsContent(previewRoute, onboardingVisible)}
        {previewMode ? null : <AneCompileOverlay />}
      </div>
    </Suspense>
  );

  if (previewMode) return content;

  return (
    <ModelDownloadActivityProvider>
      {content}
      <ModelDownloadActivityBar />
    </ModelDownloadActivityProvider>
  );
}

function settingsContent(
  previewRoute: PreviewRoute | null,
  onboardingVisible: boolean,
): ReactNode {
  if (!previewRoute) {
    return onboardingVisible ? (
      <Onboarding onComplete={() => undefined} />
    ) : (
      <Home />
    );
  }
  switch (previewRoute) {
    case "floating":
      return <PreviewFloating />;
    case "motion":
      return <PreviewMotion />;
    case "pill":
      return <PreviewPill />;
    case "dashboard":
      return <PreviewDashboard />;
    case "onboarding":
      return <PreviewOnboarding />;
  }
}
