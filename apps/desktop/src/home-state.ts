import type { MemorySearchResult } from "./data/memory";
import type { SignalStage } from "./features/transcriptions/components/CaptureStatusCard";

export type HomeView =
  "home" | "voice" | "library" | "memory" | "feature-lab" | "settings";

export type HomeSettingsTab =
  "general" | "account" | "models" | "providers" | "about" | "app";

export type LibraryFocus = { id: string; query: string };

export type HomeState = {
  activeView: HomeView;
  dragActive: boolean;
  faqOpen: boolean;
  historyFocusId: string | null;
  licensed: boolean;
  libraryFocus: LibraryFocus | null;
  memoryPrefill: string | null;
  pendingImportPaths: string[] | null;
  settingsTab: HomeSettingsTab;
  signalStage: SignalStage;
  supportMenuOpen: boolean;
};

export type HomeAction =
  | { type: "activate-view"; view: HomeView }
  | { type: "ask-memory"; query: string | null }
  | { type: "clear-memory-prefill" }
  | { type: "close-faq" }
  | { type: "dismiss-drag" }
  | { type: "license-changed"; licensed: boolean }
  | { type: "open-faq" }
  | { type: "open-import"; paths: string[] }
  | { type: "open-memory-result"; result: MemorySearchResult }
  | { type: "open-memory-shortcut" }
  | { type: "open-meeting"; item: LibraryFocus }
  | { type: "open-settings"; tab: HomeSettingsTab }
  | { type: "return-home" }
  | { type: "show-feature-lab" }
  | { type: "set-drag-active"; active: boolean }
  | { type: "set-import-paths"; paths: string[] | null }
  | { type: "set-signal-stage"; stage: SignalStage }
  | { type: "set-support-menu"; open: boolean };

export function createHomeState(licensed: boolean): HomeState {
  return {
    activeView: "home",
    dragActive: false,
    faqOpen: false,
    historyFocusId: null,
    licensed,
    libraryFocus: null,
    memoryPrefill: null,
    pendingImportPaths: null,
    settingsTab: "general",
    signalStage: "ready",
    supportMenuOpen: false,
  };
}

const protectedViews = new Set<HomeView>(["voice", "library", "memory"]);

function leaveTransientRouteState(state: HomeState): HomeState {
  return {
    ...state,
    activeView: "home",
    dragActive: false,
    pendingImportPaths: null,
  };
}

export function reduceHomeState(
  state: HomeState,
  action: HomeAction,
): HomeState {
  switch (action.type) {
    case "activate-view":
      return protectedViews.has(action.view) && !state.licensed
        ? state
        : { ...state, activeView: action.view };
    case "ask-memory":
      return {
        ...state,
        activeView: state.licensed ? "memory" : "home",
        memoryPrefill: action.query,
      };
    case "clear-memory-prefill":
      return { ...state, memoryPrefill: null };
    case "close-faq":
      return { ...state, faqOpen: false };
    case "dismiss-drag":
      return { ...state, dragActive: false };
    case "license-changed": {
      if (action.licensed === state.licensed) return state;
      const licensedState = { ...state, licensed: action.licensed };
      if (action.licensed || !protectedViews.has(state.activeView)) {
        return licensedState;
      }
      return {
        ...licensedState,
        activeView: "home",
        dragActive: false,
        pendingImportPaths: null,
      };
    }
    case "open-faq":
      return { ...state, faqOpen: true, supportMenuOpen: false };
    case "open-import":
      if (!state.licensed) return state;
      return {
        ...state,
        activeView: "library",
        pendingImportPaths: [...new Set(action.paths)],
      };
    case "open-memory-result":
      return action.result.open_target === "history"
        ? {
            ...state,
            activeView: "home",
            historyFocusId: action.result.id,
          }
        : {
            ...state,
            activeView: state.licensed ? "library" : "home",
            libraryFocus: {
              id: action.result.id,
              query: action.result.title,
            },
          };
    case "open-memory-shortcut":
      return state.licensed
        ? { ...state, activeView: "memory", memoryPrefill: null }
        : state;
    case "open-meeting":
      return {
        ...state,
        activeView: state.licensed ? "library" : "home",
        libraryFocus: action.item,
      };
    case "open-settings":
      return {
        ...state,
        activeView: "settings",
        settingsTab: action.tab,
      };
    case "return-home":
      return leaveTransientRouteState(state);
    case "show-feature-lab":
      return {
        ...state,
        activeView: "feature-lab",
        dragActive: false,
        pendingImportPaths: null,
      };
    case "set-drag-active":
      return action.active && !state.licensed
        ? state
        : { ...state, dragActive: action.active };
    case "set-import-paths":
      return { ...state, pendingImportPaths: action.paths };
    case "set-signal-stage":
      return { ...state, signalStage: action.stage };
    case "set-support-menu":
      return { ...state, supportMenuOpen: action.open };
  }
}
