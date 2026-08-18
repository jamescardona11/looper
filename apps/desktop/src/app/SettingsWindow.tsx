import { lazy, Suspense, type ReactNode } from "react";

import AneCompileOverlay from "../features/settings/components/AneCompileOverlay";
import ModelDownloadActivityBar from "../features/settings/components/ModelDownloadActivityBar";
import { ModelDownloadActivityProvider } from "../features/settings/modelDownloadActivity";
import type { PreviewRoute } from "./window-route";

const Home = lazy(() => import("../Home"));
const Onboarding = lazy(
  () => import("../features/onboarding/OnboardingScreen"),
);
const PreviewDashboard = lazy(
  () => import("../features/preview/SignalPreviewDashboard"),
);
const PreviewFloating = lazy(
  () => import("../features/preview/SignalPreviewFloating"),
);
const PreviewMotion = lazy(
  () => import("../features/preview/SignalPreviewMotionLab"),
);
const PreviewPill = lazy(() => import("../features/preview/SignalPreviewPill"));

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

  return (
    <ModelDownloadActivityProvider>
      <Suspense fallback={loadingFrame}>
        <div className={frameClass}>
          {settingsContent(previewRoute, onboardingVisible)}
          <AneCompileOverlay />
        </div>
      </Suspense>
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
  }
}
