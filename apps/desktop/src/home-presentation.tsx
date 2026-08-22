import { useLingui } from "@lingui/react/macro";
import {
  ArrowCircleUp,
  Books,
  CardsThree,
  ClockCounterClockwise,
  Flask,
  GearSix,
  House,
  Info,
  Question,
  X,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useRef, type Dispatch, type RefObject } from "react";

import SettingsRoute from "./features/settings/components/SettingsRoute";
import type { FeatureDiagnostic } from "./features/feature-lab/types";
import { HomeMeetingActivity } from "./features/library/components/HomeMeetingActivity";
import LibraryView from "./features/library/components/LibraryView";
import MemoryView from "./features/memory/components/MemoryView";
import CaptureStatusCard from "./features/transcriptions/components/CaptureStatusCard";
import HomeAskBar from "./features/transcriptions/components/HomeAskBar";
import HomeTodayHeader from "./features/transcriptions/components/HomeTodayHeader";
import TranscriptionList from "./features/transcriptions/components/TranscriptionList";
import VoiceView from "./features/voice/components/VoiceView";
import type { HomeAction, HomeState, HomeView } from "./home-state";
import { useClickOutside } from "./shared/hooks/useClickOutside";
import FAQModal from "./shared/ui/FAQModal";
import { LooperLogo } from "./shared/ui/LooperLogo";
import WindowControls from "./shared/ui/WindowControls";
import WorkspaceRoute from "./shared/ui/WorkspaceRoute";
import type { TodayDictationStats, TranscriptionMode } from "./types";

const DevelopmentFeatureLab = import.meta.env.DEV
  ? lazy(() => import("./features/feature-lab/components/FeatureLabView"))
  : null;

type HomePresentationProps = {
  appVersion: string;
  dispatch: Dispatch<HomeAction>;
  licenseGateActive: boolean;
  reduceMotion: boolean | null;
  runDiagnostics: () => Promise<FeatureDiagnostic[]>;
  settingsShortcut?: string;
  showCleanupButtons: boolean;
  state: HomeState;
  todayStats: TodayDictationStats;
  todayStatsFetched: boolean;
  transcriptionMode: TranscriptionMode;
  updateAvailable: boolean;
};

type RailItemProps = {
  active?: boolean;
  disabled?: boolean;
  icon: PhosphorIcon;
  label: string;
  onClick?: () => void;
};

const railButtonClass = [
  "ui-nav-item group mb-1 h-10 w-full gap-2.5 px-3 ui-text-body-sm after:!hidden",
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
      data-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <div className="flex shrink-0 items-center justify-center">
        <Icon size={18} weight="regular" />
      </div>
      <span className="truncate">{label}</span>
    </button>
  );
}

type SidebarProps = {
  appVersion: string;
  dispatch: Dispatch<HomeAction>;
  licenseGateActive: boolean;
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
  licenseGateActive,
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
      label: t({ id: "home.sidebar.home", message: "Home" }),
      visible: true,
    },
    {
      activeView: "library",
      disabled: !licenseGateActive,
      icon: Books,
      label: t({ id: "home.sidebar.notes", message: "Notes" }),
      visible: true,
    },
    {
      activeView: "memory",
      disabled: !licenseGateActive,
      icon: ClockCounterClockwise,
      label: t({ id: "home.sidebar.memory", message: "Memory" }),
      visible: true,
    },
    {
      activeView: "voice",
      disabled: !licenseGateActive,
      icon: CardsThree,
      label: t({ id: "home.sidebar.studio", message: "Studio" }),
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
      className="relative z-30 flex w-[196px] shrink-0 flex-col bg-[var(--color-bg-primary)]/85 px-3 backdrop-blur-2xl after:absolute after:inset-y-0 after:left-full after:top-12 after:w-px after:bg-[var(--color-border-primary)]"
      data-app-sidebar
    >
      <div className="h-12 w-full shrink-0" data-tauri-drag-region />
      <div className="px-2 pb-7 pt-1">
        <div className="flex h-6 items-center gap-2.5 ui-text-title-strong ui-color-primary">
          <LooperLogo size="sm" />
          <span>Looper</span>
        </div>
      </div>

      <nav
        aria-label={t({
          id: "home.navigation.main",
          message: "Main navigation",
        })}
        className="flex flex-1 flex-col"
      >
        <div>
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

      <div className="w-full shrink-0">
        <div className="flex flex-col gap-1 border-t border-border-primary py-3">
          <SupportMenu
            appVersion={appVersion}
            dispatch={dispatch}
            menuRef={supportMenuRef}
            modeLabel={modeLabel}
            open={state.supportMenuOpen}
            reduceMotion={reduceMotion ?? false}
          />
          {updateAvailable ? (
            <button
              aria-label={t({
                id: "home.update_available",
                message: "Update available",
              })}
              className="group flex h-10 w-full items-center gap-2.5 rounded-lg px-3 ui-text-body-sm transition-colors hover:bg-surface-elevated"
              onClick={() => dispatch({ type: "open-settings", tab: "about" })}
              style={{ color: "var(--color-accent)" }}
              title={t({
                id: "home.update_available",
                message: "Update available",
              })}
            >
              <div className="flex shrink-0 items-center justify-center">
                <ArrowCircleUp size={16} weight="regular" />
              </div>
              <span className="truncate">
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
            label={t({ id: "home.sidebar.settings", message: "Settings" })}
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
        className="group flex h-10 w-10 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-secondary"
        onClick={toggleMenu}
      >
        <div className="flex items-center justify-center group-hover:text-content-secondary">
          <Info size={16} weight="regular" />
        </div>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="ui-surface-menu absolute bottom-0 left-12 z-[60] w-56"
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
                  {t({ id: "home.support.title", message: "Get Support" })}
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
  | "licenseGateActive"
  | "runDiagnostics"
  | "settingsShortcut"
  | "showCleanupButtons"
  | "state"
  | "todayStats"
  | "todayStatsFetched"
  | "transcriptionMode"
>;

function HomeWorkspace({
  dispatch,
  licenseGateActive,
  runDiagnostics,
  settingsShortcut,
  showCleanupButtons,
  state,
  todayStats,
  todayStatsFetched,
  transcriptionMode,
}: WorkspaceProps) {
  const { t } = useLingui();
  const homeActive = state.activeView === "home";
  const protectedRouteActive = (route: HomeView) =>
    state.activeView === route && licenseGateActive;

  return (
    <main className="ui-canvas flex flex-1 flex-col min-w-0 overflow-hidden relative will-change-contents">
      <header
        className="flex h-12 w-full shrink-0 items-center justify-between border-b border-border-primary px-5"
        data-tauri-drag-region
      >
        {state.activeView === "settings" ? (
          <div className="flex items-center gap-2 ui-text-body-sm">
            <button
              aria-label={t({
                id: "settings.route.return_home",
                message: "Return to Home",
              })}
              className="flex h-8 items-center gap-2 rounded-lg px-2 ui-color-muted transition-[background-color,color] hover:bg-surface-elevated hover:ui-color-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
              onClick={() => dispatch({ type: "return-home" })}
              type="button"
            >
              <House aria-hidden="true" size={15} />
              {t({ id: "home.sidebar.home", message: "Home" })}
            </button>
            <span aria-hidden="true" className="ui-color-disabled">
              /
            </span>
            <span className="ui-color-primary">
              {t({ id: "settings.route.title", message: "Settings" })}
            </span>
          </div>
        ) : (
          <span className="font-satoshi ui-text-nav-brand ui-color-primary">
            Looper
          </span>
        )}
        {state.activeView === "settings" ? (
          <span
            aria-live="polite"
            className="flex items-center gap-2 ui-text-micro ui-color-muted"
            role="status"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]"
            />
            {t({
              id: "settings.route.saved_automatically",
              message: "Saved automatically",
            })}
          </span>
        ) : (
          <button
            className="flex h-8 items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-3 ui-text-body-sm ui-color-secondary transition-[background-color,border-color,color] hover:border-border-hover hover:bg-surface-elevated hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)] disabled:pointer-events-none disabled:opacity-45"
            disabled={!licenseGateActive}
            onClick={() => dispatch({ type: "ask-memory", query: null })}
            type="button"
          >
            {t({ id: "home.ask_memory", message: "Ask Memory" })}
            <kbd className="ui-text-micro ui-color-muted">⌘K</kbd>
          </button>
        )}
      </header>

      <div
        className={`flex-1 flex flex-col px-10 min-h-0 ${homeActive ? "pb-3" : "pb-6"}`}
      >
        <WorkspaceRoute active={homeActive}>
          <HomeTodayHeader
            active={homeActive}
            stats={todayStats}
            transcriptionsFetched={todayStatsFetched}
          />
          <CaptureStatusCard
            shortcut={settingsShortcut}
            stage={state.signalStage}
          />
          <HomeMeetingActivity
            isActive={homeActive && licenseGateActive}
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
            showLlmButtons={showCleanupButtons}
            todayOnly
          />
          <button
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-secondary py-3 ui-text-body-sm ui-color-muted transition-colors hover:border-border-hover hover:text-content-secondary"
            onClick={() => dispatch({ type: "activate-view", view: "memory" })}
            type="button"
          >
            {t({
              id: "home.archive_handoff",
              message: "Everything before today lives in Memory",
            })}
            <span aria-hidden="true">→</span>
          </button>
          <HomeAskBar
            onAsk={(query) => dispatch({ type: "ask-memory", query })}
          />
        </WorkspaceRoute>

        <WorkspaceRoute active={state.activeView === "voice"}>
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
            onSetImportPaths={(paths) =>
              dispatch({ type: "set-import-paths", paths })
            }
            pendingImportPaths={state.pendingImportPaths}
          />
        </WorkspaceRoute>
        <WorkspaceRoute active={state.activeView === "memory"}>
          <MemoryView
            isActive={protectedRouteActive("memory")}
            onOpenResult={(result) =>
              dispatch({ type: "open-memory-result", result })
            }
            onPrefillConsumed={() => dispatch({ type: "clear-memory-prefill" })}
            prefillQuery={state.memoryPrefill}
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
  licenseGateActive,
  reduceMotion,
  runDiagnostics,
  settingsShortcut,
  showCleanupButtons,
  state,
  todayStats,
  todayStatsFetched,
  transcriptionMode,
  updateAvailable,
}: HomePresentationProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-transparent font-sans ui-color-on-solid select-none">
      <WindowControls />
      <HomeSidebar
        appVersion={appVersion}
        dispatch={dispatch}
        licenseGateActive={licenseGateActive}
        reduceMotion={reduceMotion}
        state={state}
        transcriptionMode={transcriptionMode}
        updateAvailable={updateAvailable}
      />
      <HomeWorkspace
        dispatch={dispatch}
        licenseGateActive={licenseGateActive}
        runDiagnostics={runDiagnostics}
        settingsShortcut={settingsShortcut}
        showCleanupButtons={showCleanupButtons}
        state={state}
        todayStats={todayStats}
        todayStatsFetched={todayStatsFetched}
        transcriptionMode={transcriptionMode}
      />
      <DragImportOverlay
        active={state.dragActive}
        reduceMotion={reduceMotion}
      />
      <FAQModal
        isOpen={state.faqOpen}
        onClose={() => dispatch({ type: "close-faq" })}
      />
    </div>
  );
}
