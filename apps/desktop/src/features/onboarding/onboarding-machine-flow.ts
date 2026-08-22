import type { DetectedApp, TranscriptionMode } from "../../contracts";
import type { OnboardingPlatform, OnboardingStep } from "./platform";

export type OnboardingModelPriority = "quality" | "balanced" | "compact";

export type OnboardingContext = {
  platform: OnboardingPlatform;
  selectedMode: TranscriptionMode;
  importableApps: DetectedApp[];
  localModelChoice: string;
  modelPriority: OnboardingModelPriority | null;
  autoLaunch: boolean;
  showLocalConfirm: boolean;
  smartShortcut: string;
  completionError: string | null;
  isCompleting: boolean;
  showFAQModal: boolean;
  transitionDirection: 1 | -1;
  hasStepTransitioned: boolean;
  meetingAiChoice: "local" | "none";
  hasMeetingAiAccess: boolean;
};

type OnboardingEventPayload = {
  NEXT: undefined;
  BACK: undefined;
  SELECT_MODE: { mode: TranscriptionMode };
  SET_IMPORTABLE: { apps: DetectedApp[] };
  SELECT_MODEL: { key: string };
  SELECT_PRIORITY: { priority: OnboardingModelPriority };
  SET_AUTO_LAUNCH: { value: boolean };
  SET_SHORTCUT: { shortcut: string };
  SHOW_LOCAL_CONFIRM: { show: boolean };
  COMPLETING: undefined;
  COMPLETE_SUCCESS: undefined;
  COMPLETE_ERROR: { error: string };
  TOGGLE_FAQ: { show: boolean };
  SELECT_MEETING_AI: { provider: "local" | "none" };
  SET_MEETING_AI_ACCESS: { value: boolean };
};

export type OnboardingEvent = {
  [
    Kind in keyof OnboardingEventPayload
  ]: OnboardingEventPayload[Kind] extends undefined
    ? { type: Kind }
    : { type: Kind } & OnboardingEventPayload[Kind];
}[keyof OnboardingEventPayload];

type FlowTraits = {
  imports: boolean;
  local: boolean;
  intelligence: boolean;
  permissions: boolean;
};

type Candidate = readonly [step: OnboardingStep, enabled: boolean];

const firstAvailable = (
  candidates: readonly Candidate[],
  fallback: OnboardingStep,
) => candidates.find(([, enabled]) => enabled)?.[0] ?? fallback;

const traitsFrom = (context: OnboardingContext): FlowTraits => {
  const local = context.selectedMode === "local";
  return {
    local,
    imports: local && context.importableApps.length !== 0,
    intelligence: context.hasMeetingAiAccess,
    permissions:
      context.platform.requiresMicrophonePermission ||
      context.platform.requiresAccessibilityPermission,
  };
};

const nextFrom: Record<
  OnboardingStep,
  (traits: FlowTraits) => OnboardingStep | null
> = {
  welcome: () => "mode",
  mode: (traits) =>
    firstAvailable(
      [
        ["import", traits.imports],
        ["model", traits.local],
        ["intelligence", traits.intelligence],
        ["permissions", traits.permissions],
      ],
      "done",
    ),
  import: () => "model",
  model: (traits) =>
    firstAvailable(
      [
        ["intelligence", traits.intelligence],
        ["permissions", traits.permissions],
      ],
      "done",
    ),
  intelligence: (traits) =>
    firstAvailable([["permissions", traits.permissions]], "done"),
  permissions: () => "done",
  done: () => null,
};

const previousFrom: Record<
  OnboardingStep,
  (traits: FlowTraits) => OnboardingStep | null
> = {
  welcome: () => null,
  mode: () => "welcome",
  import: () => "mode",
  model: (traits) => firstAvailable([["import", traits.imports]], "mode"),
  intelligence: (traits) => firstAvailable([["model", traits.local]], "mode"),
  permissions: (traits) =>
    firstAvailable(
      [
        ["intelligence", traits.intelligence],
        ["model", traits.local],
      ],
      "mode",
    ),
  done: (traits) =>
    firstAvailable(
      [
        ["permissions", traits.permissions],
        ["intelligence", traits.intelligence],
        ["model", traits.local],
      ],
      "mode",
    ),
};

export const defaultSmartShortcutForPlatform = (
  platform: OnboardingPlatform,
) => (platform.id === "macos" ? "Fn" : "Control+Space");

export function createOnboardingContext(
  platform: OnboardingPlatform,
): OnboardingContext {
  return {
    platform,
    selectedMode: "local",
    importableApps: [],
    localModelChoice: "",
    modelPriority: "balanced",
    autoLaunch: false,
    showLocalConfirm: false,
    smartShortcut: defaultSmartShortcutForPlatform(platform),
    completionError: null,
    isCompleting: false,
    showFAQModal: false,
    transitionDirection: 1,
    hasStepTransitioned: false,
    meetingAiChoice: "none",
    hasMeetingAiAccess: false,
  };
}

export function getSteps(
  platform: OnboardingPlatform,
  hasImport = false,
  selectedMode: TranscriptionMode = "local",
  hasMeetingAiAccess = false,
): OnboardingStep[] {
  const localSteps: OnboardingStep[] =
    selectedMode === "local"
      ? [...(hasImport ? (["import"] as const) : []), "model"]
      : [];
  const permissionSteps: OnboardingStep[] =
    platform.requiresMicrophonePermission ||
    platform.requiresAccessibilityPermission
      ? ["permissions"]
      : [];

  return [
    "mode",
    ...localSteps,
    ...(hasMeetingAiAccess ? (["intelligence"] as const) : []),
    ...permissionSteps,
  ];
}

export function resolveStepDestination(
  current: OnboardingStep,
  direction: 1 | -1,
  context: OnboardingContext,
) {
  const routes = direction === 1 ? nextFrom : previousFrom;
  return routes[current](traitsFrom(context));
}

export function applyOnboardingEvent(
  event: OnboardingEvent,
): Partial<OnboardingContext> {
  switch (event.type) {
    case "SELECT_MODE":
      return { selectedMode: event.mode };
    case "SET_IMPORTABLE":
      return { importableApps: event.apps };
    case "SELECT_MODEL":
      return { localModelChoice: event.key };
    case "SELECT_PRIORITY":
      return { modelPriority: event.priority, localModelChoice: "" };
    case "SET_AUTO_LAUNCH":
      return { autoLaunch: event.value };
    case "SET_SHORTCUT":
      return { smartShortcut: event.shortcut };
    case "SHOW_LOCAL_CONFIRM":
      return { showLocalConfirm: event.show };
    case "COMPLETING":
      return { isCompleting: true, completionError: null };
    case "COMPLETE_SUCCESS":
      return { isCompleting: false };
    case "COMPLETE_ERROR":
      return { isCompleting: false, completionError: event.error };
    case "TOGGLE_FAQ":
      return { showFAQModal: event.show };
    case "SELECT_MEETING_AI":
      return { meetingAiChoice: event.provider };
    case "SET_MEETING_AI_ACCESS":
      return { hasMeetingAiAccess: event.value };
    case "NEXT":
    case "BACK":
      return {};
  }
}
