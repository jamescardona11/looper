import { useLingui } from "@lingui/react/macro";
import {
  ArrowCircleUp,
  ArrowLeft,
  Books,
  CardsThree,
  ChartBar,
  ClockCounterClockwise,
  Flask,
  GearSix,
  House,
  Info,
  Note,
  Question,
  X,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  lazy,
  Suspense,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react";

import SettingsRoute from "../../features/settings/shell/SettingsRoute";
import type { FeatureDiagnostic } from "../../features/feature-lab/types";
import { HomeMeetingActivity } from "../../features/library/meeting/HomeMeetingActivity";
import LibraryView from "../../features/library/list/LibraryView";
import ImportView from "../../features/library/import/ImportView";
import MemoryView from "../../features/memory/components/MemoryView";
import ScratchpadPanel from "../../features/scratchpad/components/ScratchpadPanel";
import CaptureStatusCard from "../../features/transcriptions/components/CaptureStatusCard";
import HomeAskBar from "../../features/transcriptions/components/HomeAskBar";
import HomeTodayHeader from "../../features/transcriptions/components/HomeTodayHeader";
import InsightsView from "../../features/transcriptions/components/InsightsView";
import TranscriptionList from "../../features/transcriptions/components/TranscriptionList";
import VoiceView from "../../features/voice/components/VoiceView";
import type { HomeAction, HomeState, HomeView } from "./home-state";
import type { WeeklyDictationActivity } from "../../features/transcriptions/todayStats";
import { useClickOutside } from "../../shared/hooks/useClickOutside";
import { formatShortcutForDisplay } from "../../shared/lib/shortcuts";
import FAQModal from "../../shared/ui/FAQModal";
import { LooperLogo } from "../../shared/ui/LooperLogo";
import WindowControls from "../../shared/ui/WindowControls";
import WorkspaceRoute from "../../shared/ui/WorkspaceRoute";
import type { TodayDictationStats, TranscriptionMode } from "../../contracts";

const DevelopmentFeatureLab = import.meta.env.DEV
  ? lazy(() => import("../../features/feature-lab/components/FeatureLabView"))
  : null;

type HomePresentationProps = {
  appVersion: string;
  dispatch: Dispatch<HomeAction>;
  hasHistory: boolean;
  reduceMotion: boolean | null;
  runDiagnostics: () => Promise<FeatureDiagnostic[]>;
  shortcutAvailable?: boolean;
  settingsShortcut?: string;
  showCleanupButtons: boolean;
  state: HomeState;
  todayStats: TodayDictationStats;
  transcriptionMode: TranscriptionMode;
  updateAvailable: boolean;
  weeklyActivity: WeeklyDictationActivity;
};

type RailItemProps = {
  active?: boolean;
  disabled?: boolean;
  icon: PhosphorIcon;
  label: string;
  onClick?: () => void;
};

const railButtonClass = [
  "desktop-workspace-nav-item group",
  "disabled:pointer-events-none disabled:opacity-45",
].join(" ");

function RailItem({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: RailItemProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={railButtonClass}
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="desktop-workspace-nav-active-surface"
          data-nav-active-surface
        />
      ) : null}
      <Icon
        aria-hidden="true"
        className="relative z-[1]"
        size={16}
        weight="regular"
      />
      <span className="relative z-[1]">{label}</span>
    </button>
  );
}

type SidebarProps = {
  appVersion: string;
  dispatch: Dispatch<HomeAction>;
  reduceMotion: boolean | null;
  state: HomeState;
  transcriptionMode: TranscriptionMode;
  updateAvailable: boolean;
};

type NavigationEntry = {
  activeView: HomeView;
  disabled: boolean;
  icon: PhosphorIcon;
  label: string;
  visible: boolean;
};

function HomeSidebar({
  appVersion,
  dispatch,
  reduceMotion,
  state,
  transcriptionMode,
  updateAvailable,
}: SidebarProps) {
  const { t } = useLingui();
  const supportMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(
    supportMenuRef,
    () => dispatch({ type: "set-support-menu", open: false }),
    state.supportMenuOpen,
  );

  const navigationEntries: NavigationEntry[] = [
    {
      activeView: "home",
      disabled: false,
      icon: House,
      label: t({ id: "home.sidebar.home", message: "Dictation" }),
      visible: true,
    },
    {
      activeView: "library",
      disabled: false,
      icon: Books,
      label: t({ id: "home.sidebar.library", message: "Notes" }),
      visible: true,
    },
    {
      activeView: "memory",
      disabled: false,
      icon: ClockCounterClockwise,
      label: t({ id: "home.sidebar.memory", message: "Memory" }),
      visible: true,
    },
    {
      activeView: "voice",
      disabled: false,
      icon: CardsThree,
      label: t({ id: "home.sidebar.voice", message: "Studio" }),
      visible: true,
    },
    {
      activeView: "insights",
      disabled: false,
      icon: ChartBar,
      label: t({ id: "home.sidebar.insights", message: "Insights" }),
      visible: true,
    },
    {
      activeView: "feature-lab",
      disabled: false,
      icon: Flask,
      label: t({ id: "home.sidebar.feature_lab", message: "Feature Lab" }),
      visible: import.meta.env.DEV,
    },
  ];
  const modeLabel =
    transcriptionMode === "cloud"
      ? t({ id: "home.mode.cloud", message: "Cloud" })
      : t({ id: "home.mode.local", message: "Local" });

  return (
    <aside
      className="desktop-workspace-sidebar relative z-30 flex w-[224px] shrink-0 flex-col bg-[var(--color-bg-primary)] after:absolute after:inset-y-0 after:left-full after:w-px after:bg-[var(--color-border-primary)]"
      data-app-sidebar
    >
      <div className="h-9 w-full shrink-0" data-tauri-drag-region />
      <div className="desktop-workspace-brand">
        <LooperLogo size="md" />
        <span className="desktop-workspace-brand-name">Looper</span>
        <span className="desktop-workspace-edition">Free</span>
      </div>

      <nav
        aria-label={t({
          id: "home.navigation.main",
          message: "Main navigation",
        })}
        className="flex flex-1 flex-col px-[14px] pt-3"
      >
        <div className="flex flex-col gap-[5px]">
          {navigationEntries.map((entry) =>
            entry.visible ? (
              <RailItem
                active={state.activeView === entry.activeView}
                disabled={entry.disabled}
                icon={entry.icon}
                key={entry.activeView}
                label={entry.label}
                onClick={() =>
                  dispatch({ type: "activate-view", view: entry.activeView })
                }
              />
            ) : null,
          )}
        </div>
      </nav>

      <section className="desktop-workspace-trust" aria-label="Local dictation">
        <span>Local dictation</span>
        <strong>Free forever</strong>
        <p>No quota. Original audio stays available on this Mac.</p>
      </section>

      <div className="w-full shrink-0 px-[14px] pb-4">
        <div className="flex flex-col gap-1 border-t border-border-primary pt-3">
          <SupportMenu
            appVersion={appVersion}
            dispatch={dispatch}
            menuRef={supportMenuRef}
            modeLabel={modeLabel}
            open={state.supportMenuOpen}
            reduceMotion={reduceMotion ?? false}
          />
          <RailItem
            icon={Note}
            label="Scratchpad"
            onClick={() =>
              dispatch({ type: "set-scratchpad-open", open: true })
            }
          />
          {updateAvailable ? (
            <button
              aria-label={t({
                id: "home.update_available",
                message: "Update available",
              })}
              className="desktop-workspace-nav-item group"
              onClick={() => dispatch({ type: "open-settings", tab: "about" })}
              style={{ color: "var(--color-accent)" }}
              title={t({
                id: "home.update_available",
                message: "Update available",
              })}
            >
              <ArrowCircleUp aria-hidden="true" size={16} weight="regular" />
              <span>
                {t({
                  id: "home.update_available",
                  message: "Update available",
                })}
              </span>
            </button>
          ) : null}
          <RailItem
            active={state.activeView === "settings"}
            icon={GearSix}
            label={t({ id: "home.sidebar.settings", message: "Setup" })}
            onClick={() =>
              dispatch({ type: "activate-view", view: "settings" })
            }
          />
        </div>
      </div>
    </aside>
  );
}

type SupportMenuProps = {
  appVersion: string;
  dispatch: Dispatch<HomeAction>;
  menuRef: RefObject<HTMLDivElement | null>;
  modeLabel: string;
  open: boolean;
  reduceMotion: boolean;
};

const supportActionClass = [
  "flex items-center gap-3 px-3 py-2 rounded-lg",
  "hover:bg-surface-elevated transition-colors group w-full text-left",
].join(" ");

function SupportMenu({
  appVersion,
  dispatch,
  menuRef,
  modeLabel,
  open,
  reduceMotion,
}: SupportMenuProps) {
  const { t } = useLingui();
  const closeMenu = () => dispatch({ type: "set-support-menu", open: false });
  const toggleMenu = () => dispatch({ type: "set-support-menu", open: !open });

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t({
          id: "home.support.menu_aria",
          message: "Support menu",
        })}
        className="desktop-workspace-nav-item group"
        onClick={toggleMenu}
      >
        <Info aria-hidden="true" size={16} weight="regular" />
        <span>{t({ id: "home.support.title", message: "Support" })}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="ui-surface-menu absolute bottom-10 left-0 z-[60] w-56"
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }
            }
            initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: 8 }}
            transition={{
              duration: reduceMotion ? 0 : 0.15,
              ease: "easeOut",
            }}
          >
            <div className="px-3 pt-3 pb-1">
              <div className="flex items-center justify-between">
                <span className="ui-text-body-sm-strong ui-color-primary">
                  {t({ id: "home.support.menu_title", message: "Get Support" })}
                </span>
                <button
                  aria-label={t({
                    id: "home.support.close",
                    message: "Close support menu",
                  })}
                  className="p-1 rounded-md hover:bg-surface-elevated text-content-muted hover:text-content-secondary transition-colors"
                  onClick={closeMenu}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="px-2 pb-2 space-y-1">
              <button
                className={supportActionClass}
                onClick={() => dispatch({ type: "open-faq" })}
              >
                <Question
                  size={16}
                  style={{ color: "var(--color-support-help)" }}
                />
                <div>
                  <div className="ui-text-body-sm-strong ui-color-primary">
                    {t({ id: "home.support.faq.title", message: "FAQ" })}
                  </div>
                  <div className="ui-text-meta ui-color-muted">
                    {t({
                      id: "home.support.faq.subtitle",
                      message: "Common questions",
                    })}
                  </div>
                </div>
              </button>
              <button
                className={supportActionClass}
                onClick={() => {
                  closeMenu();
                  dispatch({ type: "open-settings", tab: "about" });
                }}
              >
                <Info
                  size={16}
                  style={{ color: "var(--color-support-info)" }}
                />
                <div>
                  <div className="ui-text-body-sm-strong ui-color-primary">
                    {t({ id: "home.support.about.title", message: "About" })}
                  </div>
                  <div className="ui-text-meta ui-color-muted">
                    {t({
                      id: "home.support.about.version_mode",
                      message: `v${{ version: appVersion }} • ${{ mode: modeLabel }}`,
                    })}
                  </div>
                </div>
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type WorkspaceProps = Pick<
  HomePresentationProps,
  | "dispatch"
  | "hasHistory"
  | "runDiagnostics"
  | "shortcutAvailable"
  | "settingsShortcut"
  | "showCleanupButtons"
  | "state"
  | "todayStats"
  | "transcriptionMode"
  | "weeklyActivity"
>;

function HomeDictationContext({
  onOpenHistory,
  onOpenSetup,
  shortcutAvailable,
  shortcut,
  transcriptionMode,
}: {
  onOpenHistory: () => void;
  onOpenSetup: () => void;
  shortcutAvailable?: boolean;
  shortcut?: string;
  transcriptionMode: TranscriptionMode;
}) {
  const { t } = useLingui();
  const isLocal = transcriptionMode === "local";
  const shortcutLabel = formatShortcutForDisplay(shortcut ?? "Fn");
  const shortcutStatus =
    shortcutAvailable === false
      ? t({
          id: "home.context.shortcut_needs_accessibility",
          message: `${shortcutLabel} needs Accessibility`,
        })
      : shortcutAvailable
        ? t({
            id: "home.context.shortcut_ready",
            message: `${shortcutLabel} ready`,
          })
        : t({
            id: "home.context.shortcut_checking",
            message: `${shortcutLabel} checking`,
          });

  return (
    <aside className="hidden min-[1180px]:block" aria-label="Dictation context">
      <section className="mt-[55px] flex h-[253px] flex-col rounded-[20px] bg-[var(--color-text-primary)] p-5 text-[var(--color-bg-primary)]">
        <p className="ui-text-uppercase-micro text-[var(--desktop-highlight)]">
          {t({ id: "home.context.eyebrow", message: "Dictation" })}
        </p>
        <div className="mt-4 flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--desktop-highlight)]"
          />
          <div className="min-w-0">
            <p className="ui-text-body-sm font-semibold text-white">
              {isLocal
                ? t({
                    id: "home.context.local_title",
                    message: "On-device model selected",
                  })
                : t({
                    id: "home.context.cloud_title",
                    message: "Cloud transcription selected",
                  })}
            </p>
            <p className="mt-1 ui-text-micro text-[var(--color-text-disabled)]">
              {isLocal
                ? t({
                    id: "home.context.local_detail",
                    message: `Local processing · This Mac · ${{ shortcut: shortcutStatus }}`,
                  })
                : t({
                    id: "home.context.cloud_detail",
                    message: `Remote processing · ${{ shortcut: shortcutStatus }}`,
                  })}
            </p>
          </div>
        </div>
        <p className="mt-2.5 ui-text-micro text-[var(--color-text-disabled)]">
          {isLocal
            ? t({
                id: "home.context.local_proof",
                message: "Audio and transcript stay on this Mac.",
              })
            : t({
                id: "home.context.cloud_proof",
                message: "Provider settings live in Setup.",
              })}
        </p>
        <button
          className="mt-2.5 -ml-2 flex min-h-10 w-max items-center rounded-lg px-2 ui-text-label font-semibold text-[var(--desktop-highlight)] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={onOpenSetup}
          type="button"
        >
          {t({
            id: "home.context.setup",
            message: "View model details",
          })}
          <span aria-hidden="true"> →</span>
        </button>

        <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 pt-[15px]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--desktop-highlight)] text-[var(--color-text-primary)]">
            <ClockCounterClockwise aria-hidden="true" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate ui-text-body-sm font-semibold text-white">
              {t({
                id: "home.context.history_title",
                message: "Dictation history",
              })}
            </p>
            <p className="mt-0.5 truncate ui-text-micro text-[var(--color-text-disabled)]">
              {t({
                id: "home.context.history_detail",
                message: "Original audio stays available.",
              })}
            </p>
          </div>
          <button
            className="flex min-h-10 shrink-0 items-center rounded-lg px-1.5 ui-text-label font-semibold text-[var(--desktop-highlight)] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
            onClick={onOpenHistory}
            type="button"
          >
            {t({ id: "home.context.history_action", message: "Open" })}
          </button>
        </div>
      </section>
    </aside>
  );
}

function HistoryView({
  focusRecordId,
  isActive,
  onReturn,
  showCleanupButtons,
}: {
  focusRecordId: string | null;
  isActive: boolean;
  onReturn: () => void;
  showCleanupButtons: boolean;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border-primary pb-6">
        <button
          className="-ml-2 flex h-8 items-center gap-1 rounded-lg px-2 ui-text-body-sm ui-color-muted transition-colors hover:bg-surface-elevated hover:ui-color-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          onClick={onReturn}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={14} />
          Dictation
        </button>
        <p className="mt-5 ui-text-uppercase-micro ui-color-accent">History</p>
        <h1 className="mt-2 ui-text-display ui-color-primary">
          Everything you have said.
        </h1>
      </div>
      <TranscriptionList
        focusRecordId={focusRecordId}
        isActive={isActive}
        showLlmButtons={showCleanupButtons}
        historyRoute
      />
      <p className="shrink-0 border-t border-border-primary pt-4 ui-text-body-sm ui-color-muted">
        <span
          aria-hidden="true"
          className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
        />
        <strong className="ui-color-secondary">
          All of this is on this Mac.
        </strong>{" "}
        Deleting a dictation removes its transcript and original audio.
      </p>
    </>
  );
}

function HomeWorkspace({
  dispatch,
  hasHistory,
  runDiagnostics,
  shortcutAvailable,
  settingsShortcut,
  showCleanupButtons,
  state,
  todayStats,
  transcriptionMode,
  weeklyActivity,
}: WorkspaceProps) {
  const { t } = useLingui();
  const [libraryDetailVisible, setLibraryDetailVisible] = useState(false);
  const homeActive = state.activeView === "home";
  const protectedRouteActive = (route: HomeView) => state.activeView === route;
  const showGlobalAskMemory = !(
    state.activeView === "library" && libraryDetailVisible
  );

  return (
    <main className="ui-canvas flex flex-1 flex-col min-w-0 overflow-hidden relative will-change-contents">
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[84px] w-full shrink-0 items-center justify-between px-7"
        data-tauri-drag-region
      >
        <span aria-hidden="true" />
        {showGlobalAskMemory ? (
          <button
            className="pointer-events-auto flex h-10 w-[112px] items-center justify-center gap-2 rounded-xl bg-[var(--color-text-primary)] px-0 ui-text-label font-semibold text-[var(--color-bg-primary)] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)] disabled:pointer-events-none disabled:opacity-45"
            onClick={() => dispatch({ type: "ask-memory", query: null })}
            type="button"
          >
            {t({ id: "home.ask_memory", message: "Ask Memory" })}
            <kbd className="ui-text-micro text-white/60">⌘K</kbd>
          </button>
        ) : null}
      </header>

      <div
        className={`flex min-h-0 flex-1 flex-col px-10 ${
          state.activeView === "settings" ? "pt-0" : "pt-[38px]"
        } ${homeActive ? "pb-3" : "pb-6"}`}
      >
        <WorkspaceRoute active={homeActive} paddedTop={false}>
          <div className="grid min-h-0 w-full gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_264px]">
            <div className="flex min-h-0 flex-col">
              <HomeTodayHeader active={homeActive} stats={todayStats} />
              <CaptureStatusCard
                shortcut={settingsShortcut}
                stage={state.signalStage}
                weeklyActivity={weeklyActivity}
              />
              <HomeMeetingActivity
                isActive={homeActive}
                onOpen={(item) =>
                  dispatch({
                    type: "open-meeting",
                    item: { id: item.id, query: item.name },
                  })
                }
              />
              <TranscriptionList
                focusRecordId={state.historyFocusId}
                isActive={homeActive}
                onOpenShortcutSettings={() =>
                  dispatch({ type: "activate-view", view: "settings" })
                }
                showLlmButtons={showCleanupButtons}
                todayOnly
              />
              {hasHistory ? (
                <div className="mt-6 shrink-0">
                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-secondary py-3 ui-text-body-sm ui-color-muted transition-colors hover:border-border-hover hover:text-content-secondary"
                    onClick={() =>
                      dispatch({ type: "activate-view", view: "history" })
                    }
                    type="button"
                  >
                    All history <span aria-hidden="true">→</span>
                  </button>
                  <HomeAskBar
                    onAsk={(query) => dispatch({ type: "ask-memory", query })}
                  />
                </div>
              ) : null}
            </div>
            <HomeDictationContext
              onOpenHistory={() =>
                dispatch({ type: "activate-view", view: "history" })
              }
              onOpenSetup={() =>
                dispatch({ type: "activate-view", view: "settings" })
              }
              shortcutAvailable={shortcutAvailable}
              shortcut={settingsShortcut}
              transcriptionMode={transcriptionMode}
            />
          </div>
        </WorkspaceRoute>

        <WorkspaceRoute
          active={state.activeView === "history"}
          paddedTop={false}
        >
          <HistoryView
            focusRecordId={state.historyFocusId}
            isActive={protectedRouteActive("history")}
            onReturn={() => dispatch({ type: "activate-view", view: "home" })}
            showCleanupButtons={showCleanupButtons}
          />
        </WorkspaceRoute>

        <WorkspaceRoute
          active={state.activeView === "import"}
          paddedTop={false}
        >
          <ImportView
            selectedPaths={state.pendingImportPaths}
            onBack={() => {
              dispatch({ type: "set-import-paths", paths: null });
              dispatch({ type: "activate-view", view: "library" });
            }}
            onUpdatePaths={(paths) =>
              dispatch({ type: "set-import-paths", paths })
            }
            onReviewImport={() =>
              dispatch({ type: "activate-view", view: "library" })
            }
          />
        </WorkspaceRoute>

        <WorkspaceRoute active={state.activeView === "voice"} paddedTop={false}>
          <VoiceView isActive={protectedRouteActive("voice")} />
        </WorkspaceRoute>
        <WorkspaceRoute
          active={state.activeView === "library"}
          paddedTop={false}
          width="full"
        >
          <LibraryView
            focusItem={state.libraryFocus}
            isActive={protectedRouteActive("library")}
            onDetailVisibilityChange={setLibraryDetailVisible}
            onOpenImportRoute={() =>
              dispatch({ type: "activate-view", view: "import" })
            }
            onSetImportPaths={(paths) =>
              dispatch({ type: "set-import-paths", paths })
            }
            pendingImportPaths={state.pendingImportPaths}
          />
        </WorkspaceRoute>
        <WorkspaceRoute
          active={state.activeView === "memory"}
          paddedTop={false}
        >
          <MemoryView
            isActive={protectedRouteActive("memory")}
            onOpenResult={(result) =>
              dispatch({ type: "open-memory-result", result })
            }
            onPrefillConsumed={() => dispatch({ type: "clear-memory-prefill" })}
            prefillQuery={state.memoryPrefill}
          />
        </WorkspaceRoute>
        <WorkspaceRoute
          active={state.activeView === "insights"}
          paddedTop={false}
        >
          <InsightsView
            transcriptionMode={transcriptionMode}
            isActive={protectedRouteActive("insights")}
            onOpenStudio={() =>
              dispatch({ type: "activate-view", view: "voice" })
            }
          />
        </WorkspaceRoute>
        <WorkspaceRoute active={state.activeView === "settings"} width="full">
          <SettingsRoute
            key={`${state.activeView}:${state.settingsTab}`}
            initialTab={state.settingsTab}
            isOpen={state.activeView === "settings"}
            onClose={() => dispatch({ type: "activate-view", view: "home" })}
            transcriptionMode={transcriptionMode}
          />
        </WorkspaceRoute>
        {DevelopmentFeatureLab ? (
          <WorkspaceRoute active={state.activeView === "feature-lab"}>
            <Suspense fallback={null}>
              <DevelopmentFeatureLab
                onOpenAppSettings={() =>
                  dispatch({ type: "open-settings", tab: "app" })
                }
                onOpenDictionary={() =>
                  dispatch({ type: "activate-view", view: "voice" })
                }
                onOpenLibrary={() =>
                  dispatch({ type: "activate-view", view: "library" })
                }
                onOpenMemory={() =>
                  dispatch({ type: "activate-view", view: "memory" })
                }
                onOpenWorkflows={() =>
                  dispatch({ type: "activate-view", view: "voice" })
                }
                runDiagnostics={runDiagnostics}
              />
            </Suspense>
          </WorkspaceRoute>
        ) : null}
      </div>
    </main>
  );
}

function DragImportOverlay({
  active,
  reduceMotion,
}: {
  active: boolean;
  reduceMotion: boolean | null;
}) {
  const { t } = useLingui();
  const motionReduced = reduceMotion ?? false;
  const scrimInitial = motionReduced ? false : { opacity: 0 };
  const cardInitial = motionReduced ? false : { scale: 0.96, y: 12 };
  const cardExit = motionReduced ? { opacity: 0 } : { scale: 0.96, y: 12 };

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs"
          exit={{ opacity: 0 }}
          initial={scrimInitial}
          transition={{ duration: motionReduced ? 0 : 0.15 }}
        >
          <motion.div
            animate={{ scale: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-border-secondary bg-surface-overlay px-8 py-6 shadow-2xl"
            exit={cardExit}
            initial={cardInitial}
            transition={{
              duration: motionReduced ? 0 : 0.2,
              ease: "easeOut",
            }}
          >
            <div className="ui-text-section-label ui-color-muted">
              {t({
                id: "home.drag_import.eyebrow",
                message: "Transcribe Recording",
              })}
            </div>
            <div className="mt-2 ui-text-title font-medium ui-color-primary">
              {t({
                id: "home.drag_import.title",
                message: "Drop audio or video files",
              })}
            </div>
            <div className="mt-1 ui-text-body-sm ui-color-disabled">
              {t({
                id: "home.drag_import.subtitle",
                message: "MP3, WAV, M4A, MP4, MOV, and more",
              })}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function HomePresentation({
  appVersion,
  dispatch,
  hasHistory,
  reduceMotion,
  runDiagnostics,
  shortcutAvailable,
  settingsShortcut,
  showCleanupButtons,
  state,
  todayStats,
  transcriptionMode,
  updateAvailable,
  weeklyActivity,
}: HomePresentationProps) {
  return (
    <div className="desktop-workspace-shell flex overflow-hidden bg-transparent font-sans text-content-primary select-none">
      <WindowControls />
      <HomeSidebar
        appVersion={appVersion}
        dispatch={dispatch}
        reduceMotion={reduceMotion}
        state={state}
        transcriptionMode={transcriptionMode}
        updateAvailable={updateAvailable}
      />
      <HomeWorkspace
        dispatch={dispatch}
        hasHistory={hasHistory}
        runDiagnostics={runDiagnostics}
        shortcutAvailable={shortcutAvailable}
        settingsShortcut={settingsShortcut}
        showCleanupButtons={showCleanupButtons}
        state={state}
        todayStats={todayStats}
        transcriptionMode={transcriptionMode}
        weeklyActivity={weeklyActivity}
      />
      <DragImportOverlay
        active={state.dragActive}
        reduceMotion={reduceMotion}
      />
      <FAQModal
        isOpen={state.faqOpen}
        onClose={() => dispatch({ type: "close-faq" })}
      />
      <ScratchpadPanel
        open={state.scratchpadOpen}
        onClose={() => dispatch({ type: "set-scratchpad-open", open: false })}
      />
    </div>
  );
}
