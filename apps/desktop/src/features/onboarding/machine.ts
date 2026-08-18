import { assign, setup } from "xstate";
import { getOnboardingPlatform, type OnboardingStep } from "./platform";
import {
  applyOnboardingEvent,
  createOnboardingContext,
  getSteps as buildStepList,
  resolveStepDestination,
  type OnboardingContext,
  type OnboardingEvent,
} from "./onboarding-machine-flow";

const DATA_EVENTS = [
  "SELECT_MODE",
  "SET_IMPORTABLE",
  "SELECT_MODEL",
  "SELECT_PRIORITY",
  "SET_AUTO_LAUNCH",
  "SET_SHORTCUT",
  "SHOW_LOCAL_CONFIRM",
  "COMPLETING",
  "COMPLETE_SUCCESS",
  "COMPLETE_ERROR",
  "TOGGLE_FAQ",
  "SELECT_MEETING_AI",
  "SET_MEETING_AI_ACCESS",
] as const;

const STEP_NAMES = [
  "welcome",
  "mode",
  "import",
  "model",
  "intelligence",
  "permissions",
  "done",
] as const satisfies readonly OnboardingStep[];

const machineSetup = setup({
  types: {
    context: {} as OnboardingContext,
    events: {} as OnboardingEvent,
  },
  actions: {
    applyDataEvent: assign(({ event }) => applyOnboardingEvent(event)),
    markForward: assign(() => navigationContext(1)),
    markBackward: assign(() => navigationContext(-1)),
  },
});

const navigationContext = (direction: 1 | -1) => ({
  transitionDirection: direction,
  hasStepTransitioned: true,
  showLocalConfirm: false,
  completionError: null,
});

const dataEventHandlers = Object.fromEntries(
  DATA_EVENTS.map((eventName) => [eventName, { actions: "applyDataEvent" }]),
);

const destinationsFor = (step: OnboardingStep, direction: 1 | -1) => {
  const navigationAction =
    direction === 1 ? ("markForward" as const) : ("markBackward" as const);
  return STEP_NAMES.map((destination) => ({
    target: destination,
    guard: ({ context }: { context: OnboardingContext }) =>
      resolveStepDestination(step, direction, context) === destination,
    actions: navigationAction,
  }));
};

const stateNodeFor = (step: OnboardingStep) => ({
  on: {
    NEXT: destinationsFor(step, 1),
    BACK: destinationsFor(step, -1),
  },
});

export function createOnboardingMachine(platform = getOnboardingPlatform()) {
  return machineSetup.createMachine({
    id: "onboarding",
    initial: "welcome",
    context: createOnboardingContext(platform),
    on: dataEventHandlers,
    states: Object.fromEntries(
      STEP_NAMES.map((step) => [step, stateNodeFor(step)]),
    ),
  });
}

export const onboardingMachine = createOnboardingMachine();

const getSteps = (
  platform = getOnboardingPlatform(),
  hasImport = false,
  selectedMode: OnboardingContext["selectedMode"] = "local",
  hasMeetingAiAccess = false,
) => buildStepList(platform, hasImport, selectedMode, hasMeetingAiAccess);

export {
  defaultSmartShortcutForPlatform,
  type OnboardingContext,
  type OnboardingEvent,
  type OnboardingModelPriority,
} from "./onboarding-machine-flow";

export { getSteps };
