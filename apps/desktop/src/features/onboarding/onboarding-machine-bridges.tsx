import { useMountEffect } from "../../shared/hooks/useMountEffect";
import { listenLocalLlmDownloads } from "../../data/local-llm";
import { trackOnboardingStepViewed } from "../../data/settings";
import type { Dispatch as ReactDispatch, SetStateAction } from "react";
import type { DetectedApp } from "../../types";
import type { OnboardingEvent } from "./machine";

type MachineDispatch = (event: OnboardingEvent) => void;
type LocalLlmDownloadState = { downloading: boolean; percent: number };

const identityIds = new WeakMap<object, number>();
let nextIdentityId = 1;

const identityKey = (value: object | undefined) => {
  if (!value) return "pending";
  const known = identityIds.get(value);
  if (known) return String(known);
  const assigned = nextIdentityId++;
  identityIds.set(value, assigned);
  return String(assigned);
};

function ImportableAppsBridge({
  apps,
  dispatch,
}: {
  apps: DetectedApp[] | undefined;
  dispatch: MachineDispatch;
}) {
  useMountEffect(() => {
    if (apps) dispatch({ type: "SET_IMPORTABLE", apps });
  });
  return null;
}

function LicenseAccessBridge({
  enabled,
  dispatch,
}: {
  enabled: boolean;
  dispatch: MachineDispatch;
}) {
  useMountEffect(() => {
    dispatch({ type: "SET_MEETING_AI_ACCESS", value: enabled });
  });
  return null;
}

function LocalModeAvailabilityBridge({
  unavailable,
  localSelected,
  dispatch,
}: {
  unavailable: boolean;
  localSelected: boolean;
  dispatch: MachineDispatch;
}) {
  useMountEffect(() => {
    if (unavailable && localSelected) {
      dispatch({ type: "SELECT_MODE", mode: "cloud" });
    }
  });
  return null;
}

function StepViewedBridge({ step }: { step: string }) {
  useMountEffect(() => {
    void trackOnboardingStepViewed(step).catch(() => {});
  });
  return null;
}

function LocalLlmDownloadBridge({
  onChange,
}: {
  onChange: ReactDispatch<SetStateAction<LocalLlmDownloadState>>;
}) {
  useMountEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listenLocalLlmDownloads({
      progress: ({ percent }) => onChange({ downloading: true, percent }),
      complete: () => onChange({ downloading: false, percent: 100 }),
      error: () => onChange((current) => ({ ...current, downloading: false })),
      cancelled: () =>
        onChange((current) => ({ ...current, downloading: false })),
    }).then((cleanup) => {
      if (disposed) cleanup();
      else stopListening = cleanup;
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  });
  return null;
}

export function OnboardingMachineBridges(props: {
  importableApps: DetectedApp[] | undefined;
  meetingAiAccess: boolean;
  localModelUnavailable: boolean;
  localModeSelected: boolean;
  currentStep: string;
  dispatch: MachineDispatch;
  onLocalLlmChange: ReactDispatch<SetStateAction<LocalLlmDownloadState>>;
}) {
  return (
    <>
      <ImportableAppsBridge
        key={identityKey(props.importableApps)}
        apps={props.importableApps}
        dispatch={props.dispatch}
      />
      <LicenseAccessBridge
        key={String(props.meetingAiAccess)}
        enabled={props.meetingAiAccess}
        dispatch={props.dispatch}
      />
      <LocalModeAvailabilityBridge
        key={`${props.localModelUnavailable}:${props.localModeSelected}`}
        unavailable={props.localModelUnavailable}
        localSelected={props.localModeSelected}
        dispatch={props.dispatch}
      />
      <StepViewedBridge key={props.currentStep} step={props.currentStep} />
      <LocalLlmDownloadBridge onChange={props.onLocalLlmChange} />
    </>
  );
}
