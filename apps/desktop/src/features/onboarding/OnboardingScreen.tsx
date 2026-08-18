import { useLingui as useOnboardingTranslations } from "@lingui/react/macro";
import { useMachine as useOnboardingMachine } from "@xstate/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl as openExternalUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useMemo, useState } from "react";
import { requestMacAccessibilityPermission } from "../../shared/lib/macosPermissions";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
  completeOnboarding,
  getSettings,
  openAccessibilitySettings,
  openMicrophoneSettings,
  requestMicrophonePermission as requestNativeMicrophonePermission,
  trackOnboardingStepViewed,
  updateSettings,
} from "../../data/settings";
import {
  downloadLocalLlmModel,
  LOCAL_LLM_MODEL_ID,
} from "../../data/local-llm";
import { checkoutUrlFor, type PurchaseTier } from "../license/purchaseConfig";
import {
  useActivateLicense as useLicenseActivation,
  useLicenseState as useCurrentLicense,
} from "../license/queries";
import { useImportableApps as useDetectedImportApps } from "../import/queries";
import { useModelCatalog, useModelStatuses } from "../settings/models-queries";
import { useModelDownloadActivity } from "../settings/modelDownloadActivity";
import { useSettings as useStoredOnboardingSettings } from "../settings/queries";
import { onboardingMachine, getSteps } from "./machine";
import { OnboardingMachineBridges } from "./onboarding-machine-bridges";
import {
  buildCompletedOnboardingSettings,
  buildModelDisplayStates,
  licenseActivationError,
  missingCheckoutMessage,
  modelDownloadRequest,
  permissionPresentation,
  permissionQueryOptions,
  resolveOnboardingModels,
  selectedModelIsReady,
} from "./onboarding-screen-policy";
import { OnboardingScreenShell } from "./onboarding-screen-shell";
import {
  renderOnboardingStep,
  type OnboardingStepViews,
} from "./onboarding-step-content";
import { LicenseModal } from "./steps/LicenseModal";

const permissionKeys = {
  microphone: ["onboarding", "permissions", "microphone"] as const,
  accessibility: ["onboarding", "permissions", "accessibility"] as const,
};

const stepTransitionVariants = {
  enter: (direction: 1 | -1) => ({ opacity: 0, x: direction > 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: 1 | -1) => ({ opacity: 0, x: direction > 0 ? -28 : 28 }),
};

type OnboardingScreenProps = { onComplete: () => void };

export default function OnboardingScreen({
  onComplete,
}: OnboardingScreenProps) {
  const { t } = useOnboardingTranslations();
  const [snapshot, dispatch] = useOnboardingMachine(onboardingMachine);
  const [openingLicenseTarget, setOpeningLicenseTarget] =
    useState<PurchaseTier | null>(null);
  const [licenseOpenError, setLicenseOpenError] = useState<string | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [localLlmDownload, setLocalLlmDownload] = useState({
    downloading: false,
    percent: 0,
  });
  const queryClient = useQueryClient();
  const { activities: downloadActivities, startDownload } =
    useModelDownloadActivity();
  const setup = snapshot.context;

  const importableAppsQuery = useDetectedImportApps();
  const licenseQuery = useCurrentLicense();
  const settingsQuery = useStoredOnboardingSettings();
  const modelCatalogQuery = useModelCatalog();
  const activateLicense = useLicenseActivation();

  const hasImportStep =
    setup.selectedMode === "local" && setup.importableApps.length > 0;
  const steps = useMemo(
    () =>
      getSteps(
        setup.platform,
        hasImportStep,
        setup.selectedMode,
        setup.hasMeetingAiAccess,
      ),
    [
      setup.platform,
      hasImportStep,
      setup.selectedMode,
      setup.hasMeetingAiAccess,
    ],
  );
  const currentStep = snapshot.value as string;
  const currentStepIndex = Math.max(
    0,
    steps.indexOf(currentStep as (typeof steps)[number]),
  );

  const modelProjection = useMemo(
    () =>
      resolveOnboardingModels(
        modelCatalogQuery.data,
        setup.localModelChoice,
        settingsQuery.data?.local_model ?? "",
      ),
    [
      modelCatalogQuery.data,
      setup.localModelChoice,
      settingsQuery.data?.local_model,
    ],
  );
  const localModelUnavailable =
    !modelCatalogQuery.isLoading &&
    !modelCatalogQuery.isError &&
    modelProjection.onboardingModels.length === 0;
  const { statusByModel: modelStatus } = useModelStatuses(
    modelProjection.statusKeys,
    modelProjection.statusKeys.length > 0,
  );
  const displayStateByModel = useMemo(
    () =>
      buildModelDisplayStates(
        modelCatalogQuery.data,
        modelStatus,
        downloadActivities,
      ),
    [downloadActivities, modelStatus, modelCatalogQuery.data],
  );
  const selectedModelReady = selectedModelIsReady(
    modelProjection.selectedKey,
    modelStatus,
    displayStateByModel,
  );

  const permissionsVisible = currentStep === "permissions";
  const microphoneRequired = setup.platform.requiresMicrophonePermission;
  const accessibilityRequired = setup.platform.requiresAccessibilityPermission;
  const microphonePermissionQuery = useQuery(
    permissionQueryOptions(
      permissionKeys.microphone,
      checkMicrophonePermission,
      microphoneRequired,
      permissionsVisible,
    ),
  );
  const accessibilityPermissionQuery = useQuery(
    permissionQueryOptions(
      permissionKeys.accessibility,
      checkAccessibilityPermission,
      accessibilityRequired,
      permissionsVisible,
    ),
  );

  const microphoneRequest = useMutation({
    mutationFn: async () => {
      await requestNativeMicrophonePermission().catch(() => {});
      const granted = await checkMicrophonePermission().catch(() => false);
      if (!granted) await openMicrophoneSettings().catch(() => {});
      return granted;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: permissionKeys.microphone,
      });
    },
  });
  const accessibilityRequest = useMutation({
    mutationFn: async () => {
      if (setup.platform.id === "macos") {
        await requestMacAccessibilityPermission().catch(() => {});
      }
      const granted = await checkAccessibilityPermission().catch(() => false);
      if (!granted) await openAccessibilitySettings().catch(() => {});
      return granted;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: permissionKeys.accessibility,
      });
    },
  });
  const microphoneState = permissionPresentation(
    microphoneRequired,
    microphonePermissionQuery.data,
    microphonePermissionQuery.isPending,
    microphoneRequest.isPending,
  );
  const accessibilityState = permissionPresentation(
    accessibilityRequired,
    accessibilityPermissionQuery.data,
    accessibilityPermissionQuery.isPending,
    accessibilityRequest.isPending,
  );

  const handleDownload = useCallback(
    (modelKey: string, includeAne?: boolean) => {
      void trackOnboardingStepViewed("model_downloading").catch(() => {});
      void startDownload(
        modelDownloadRequest(modelCatalogQuery.data, modelKey, includeAne),
      );
    },
    [modelCatalogQuery.data, startDownload],
  );
  const openLicenseCheckout = useCallback(async (tier: PurchaseTier) => {
    setLicenseOpenError(null);
    setOpeningLicenseTarget(tier);
    try {
      const checkoutUrl = checkoutUrlFor(tier, "onboarding");
      if (!checkoutUrl) throw new Error(missingCheckoutMessage(tier));
      await openExternalUrl(checkoutUrl);
    } catch (error) {
      setLicenseOpenError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setOpeningLicenseTarget(null);
    }
  }, []);

  const handleComplete = useCallback(async () => {
    if (
      settingsQuery.isLoading ||
      settingsQuery.isError ||
      !settingsQuery.data
    ) {
      dispatch({
        type: "COMPLETE_ERROR",
        error: t({
          id: "onboarding.complete.failed",
          message: "Could not finish setup. Check your settings and try again.",
        }),
      });
      return;
    }
    const resolvedLocalModel =
      modelProjection.selectedKey || "parakeet_tdt_int8";
    dispatch({ type: "COMPLETING" });
    if (setup.selectedMode === "local" && !modelProjection.selectedKey) {
      dispatch({
        type: "COMPLETE_ERROR",
        error: t({
          id: "onboarding.complete.no_model",
          message:
            "Could not load a local model selection. Try reopening onboarding.",
        }),
      });
      return;
    }
    try {
      const latest = await getSettings();
      await updateSettings(
        buildCompletedOnboardingSettings({
          latest,
          smartShortcut: setup.smartShortcut,
          transcriptionMode: setup.selectedMode,
          localModel: resolvedLocalModel,
          localModelInfo: modelProjection.selectedInfo,
          autoLaunchEnabled: setup.autoLaunch,
          systemLanguage: navigator.language,
          meetingAiProvider: setup.meetingAiChoice,
        }),
      );
      await completeOnboarding();
      dispatch({ type: "COMPLETE_SUCCESS" });
      onComplete();
    } catch (error) {
      console.error("Failed to finish onboarding", error);
      const message = typeof error === "string" ? error : String(error);
      dispatch({
        type: "COMPLETE_ERROR",
        error:
          message ||
          t({
            id: "onboarding.complete.failed",
            message:
              "Could not finish setup. Check your settings and try again.",
          }),
      });
    }
  }, [
    setup.autoLaunch,
    setup.meetingAiChoice,
    setup.selectedMode,
    setup.smartShortcut,
    modelProjection.selectedInfo,
    modelProjection.selectedKey,
    onComplete,
    dispatch,
    settingsQuery.data,
    settingsQuery.isError,
    settingsQuery.isLoading,
    t,
  ]);

  const applySmartShortcut = useCallback(
    async (shortcut: string) => {
      dispatch({ type: "SET_SHORTCUT", shortcut });
      try {
        const latest = await getSettings();
        await updateSettings(
          buildCompletedOnboardingSettings({
            latest,
            smartShortcut: shortcut,
            transcriptionMode: setup.selectedMode,
            localModel: modelProjection.selectedKey,
            localModelInfo: modelProjection.selectedInfo,
            autoLaunchEnabled: setup.autoLaunch,
            systemLanguage: navigator.language,
            meetingAiProvider: setup.meetingAiChoice,
          }),
        );
      } catch {
        return;
      }
    },
    [
      setup.autoLaunch,
      setup.meetingAiChoice,
      setup.selectedMode,
      modelProjection.selectedInfo,
      modelProjection.selectedKey,
      dispatch,
    ],
  );
  const goNext = useCallback(() => dispatch({ type: "NEXT" }), [dispatch]);
  const goBack = useCallback(() => dispatch({ type: "BACK" }), [dispatch]);
  const stepMotionProps = {
    custom: setup.transitionDirection,
    variants: stepTransitionVariants,
    animate: "center" as const,
    exit: "exit" as const,
    transition: { duration: 0.22, ease: "easeOut" as const },
  };

  const stepViews: OnboardingStepViews = {
    welcome: {
      stepMotionProps,
      hasStepTransitioned: setup.hasStepTransitioned,
      onStart: goNext,
      startDisabled: false,
    },
    mode: {
      stepMotionProps,
      selectedMode: setup.selectedMode,
      localUnavailable: localModelUnavailable,
      onSelect: (mode) => dispatch({ type: "SELECT_MODE", mode }),
      onNext: goNext,
    },
    model: {
      stepMotionProps,
      models: modelProjection.onboardingModels,
      selectedModelKey: modelProjection.selectedKey,
      modelStatus,
      isLoading: modelCatalogQuery.isLoading || settingsQuery.isLoading,
      unavailable: modelCatalogQuery.isError,
      displayStateByModel,
      selectedModelReady,
      showLocalConfirm: setup.showLocalConfirm,
      onShowConfirm: (show) => dispatch({ type: "SHOW_LOCAL_CONFIRM", show }),
      onSelectModel: (key) => dispatch({ type: "SELECT_MODEL", key }),
      onDownload: handleDownload,
      onNext: goNext,
    },
    import: {
      stepMotionProps,
      apps: setup.importableApps,
      onApplied: (result) => {
        if (result.modelKey) {
          dispatch({ type: "SELECT_MODEL", key: result.modelKey });
          if (!modelStatus[result.modelKey]?.installed) {
            void handleDownload(result.modelKey);
          }
        }
        if (result.shortcut) {
          dispatch({ type: "SET_SHORTCUT", shortcut: result.shortcut });
        }
        if (result.autoLaunch !== null) {
          dispatch({ type: "SET_AUTO_LAUNCH", value: result.autoLaunch });
        }
        goNext();
      },
      onNext: goNext,
    },
    intelligence: {
      stepMotionProps,
      downloading: localLlmDownload.downloading,
      percent: localLlmDownload.percent,
      onDownload: () => {
        dispatch({ type: "SELECT_MEETING_AI", provider: "local" });
        setLocalLlmDownload((current) => ({ ...current, downloading: true }));
        void downloadLocalLlmModel(LOCAL_LLM_MODEL_ID).catch(() =>
          setLocalLlmDownload((current) => ({
            ...current,
            downloading: false,
          })),
        );
        goNext();
      },
      onNotNow: () => {
        dispatch({ type: "SELECT_MEETING_AI", provider: "none" });
        goNext();
      },
    },
    permissions: {
      stepMotionProps,
      requiresMicrophone: microphoneRequired,
      requiresAccessibility: accessibilityRequired,
      micPermission: microphoneState.granted,
      accessibilityPermission: accessibilityState.granted,
      isCheckingMic: microphoneState.checking,
      isCheckingAccessibility: accessibilityState.checking,
      onRequestMic: () => microphoneRequest.mutate(),
      onRequestAccessibility: () => accessibilityRequest.mutate(),
      onNext: goNext,
    },
    done: {
      stepMotionProps,
      smartShortcut: setup.smartShortcut,
      onSetShortcut: applySmartShortcut,
      modelLabel:
        setup.selectedMode === "cloud"
          ? "Looper Cloud"
          : (modelProjection.selectedInfo?.label ?? null),
      meetingIntelligenceLabel:
        setup.meetingAiChoice === "local"
          ? "Local (Qwen 3.5 4B)"
          : "Not configured",
      autoLaunch: setup.autoLaunch,
      onSetAutoLaunch: (value) => dispatch({ type: "SET_AUTO_LAUNCH", value }),
      licenseActive: licenseQuery.data?.status === "active",
      onOpenLicense: () => setShowLicenseModal(true),
      isCompleting: setup.isCompleting,
      completionError: setup.completionError,
      onComplete: handleComplete,
    },
  };

  const bridges = (
    <OnboardingMachineBridges
      importableApps={importableAppsQuery.data}
      meetingAiAccess={licenseQuery.data?.licenseGateActive ?? false}
      localModelUnavailable={localModelUnavailable}
      localModeSelected={setup.selectedMode === "local"}
      currentStep={currentStep}
      dispatch={dispatch}
      onLocalLlmChange={setLocalLlmDownload}
    />
  );
  const licenseModal = showLicenseModal ? (
    <LicenseModal
      licenseState={licenseQuery.data ?? null}
      licenseLoading={licenseQuery.isLoading && !licenseQuery.data}
      activating={activateLicense.isPending}
      openingTarget={openingLicenseTarget}
      openError={licenseOpenError}
      activationError={licenseActivationError(activateLicense.error)}
      onOpenCheckout={openLicenseCheckout}
      onActivateLicense={(key) => activateLicense.mutate(key)}
      onClose={() => setShowLicenseModal(false)}
    />
  ) : null;

  return (
    <OnboardingScreenShell
      currentStep={currentStep}
      currentStepIndex={currentStepIndex}
      totalSteps={steps.length}
      direction={setup.transitionDirection}
      stepContent={renderOnboardingStep(currentStep, stepViews)}
      bridges={bridges}
      onBack={goBack}
      faqOpen={setup.showFAQModal}
      onCloseFaq={() => dispatch({ type: "TOGGLE_FAQ", show: false })}
      licenseModal={licenseModal}
    />
  );
}
