import type { MemorySearchResult } from "../../data/memory";
import type { SignalStage } from "../../features/transcriptions/components/CaptureStatusCard";

export type HomeView =
  | "home"
  | "history"
  | "import"
  | "voice"
  | "library"
  | "memory"
  | "insights"
  | "feature-lab"
  | "settings";

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
  scratchpadOpen: boolean;
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
  | { type: "set-scratchpad-open"; open: boolean }
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
    scratchpadOpen: false,
    settingsTab: "general",
    signalStage: "ready",
    supportMenuOpen: false,
  };
}

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
      return { ...state, activeView: action.view };
    case "ask-memory":
      return {
        ...state,
        activeView: "memory",
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
      return { ...state, licensed: action.licensed };
    }
    case "open-faq":
      return { ...state, faqOpen: true, supportMenuOpen: false };
    case "open-import":
      return {
        ...state,
        activeView: "import",
        pendingImportPaths: [...new Set(action.paths)],
      };
    case "set-scratchpad-open":
      return { ...state, scratchpadOpen: action.open };
    case "open-memory-result":
      return action.result.open_target === "history"
        ? {
            ...state,
            activeView: "history",
            historyFocusId: action.result.id,
          }
        : {
            ...state,
            activeView: "library",
            libraryFocus: {
              id: action.result.id,
              query: action.result.title,
            },
          };
    case "open-memory-shortcut":
      return { ...state, activeView: "memory", memoryPrefill: null };
    case "open-meeting":
      return {
        ...state,
        activeView: "library",
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
      return { ...state, dragActive: action.active };
    case "set-import-paths":
      return { ...state, pendingImportPaths: action.paths };
    case "set-signal-stage":
      return { ...state, signalStage: action.stage };
    case "set-support-menu":
      return { ...state, supportMenuOpen: action.open };
  }
}
