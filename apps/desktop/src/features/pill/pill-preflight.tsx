import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  CaretDown,
  Check,
  Microphone,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react";
import type { CapturePillDockPosition } from "../../data/capture/dictation";
import type { TranscriptionLanguageOption } from "../../shared/lib/transcriptionLanguages";
import { LooperLogo } from "../../shared/ui/LooperLogo";
import {
  languageMenuPlacement,
  resolveDockLayout,
} from "./pill-preflight-layout";
import { useOverlayDrag } from "./use-overlay-drag";
import { usePillPreflight } from "./use-pill-preflight";
import { useShortcutStatus } from "./use-shortcut-status";
import { openShortcutPermissionHelp } from "../../data/capture/shortcuts";

const tenPixelTextClass = "ui-text-meta";
const elevenPixelTextClass = "ui-text-label";

export type CapturePreflightProps = {
  sticky?: boolean;
  isHovered?: boolean;
};

type DragHandleProps = Pick<
  ReturnType<typeof useOverlayDrag>,
  "onPointerDown"
> & {
  compact?: boolean;
};

function DragHandle({ onPointerDown, compact = false }: DragHandleProps) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      data-overlay-drag-handle
      onPointerDown={onPointerDown}
      aria-label={t({
        id: "pill.preflight.drag_floating",
        message: "Move Capture pill",
      })}
      className={`flex shrink-0 cursor-grab items-center text-[var(--color-pill-preview-text)] active:cursor-grabbing ${
        compact
          ? "h-full w-[50px] gap-2 pl-3 pr-1"
          : "h-10 justify-center gap-1 px-2"
      }`}
    >
      <span
        data-pill-drag-dots
        aria-hidden="true"
        className="grid grid-cols-2 gap-0.5"
      >
        {Array.from({ length: 6 }, (_, dot) => (
          <span
            key={dot}
            data-pill-drag-dot
            className="h-0.5 w-0.5 rounded-full bg-[var(--ui-capture-muted)]"
          />
        ))}
      </span>
      {compact ? (
        <span data-pill-drag-logo aria-hidden="true">
          <LooperLogo size="sm" />
        </span>
      ) : null}
    </button>
  );
}

function ShortcutControl({
  status,
  onReadyClick,
}: {
  status: ReturnType<typeof useShortcutStatus>;
  onReadyClick: () => void;
}) {
  const { t } = useLingui();
  const ready = status === "ready";
  const checking = status === "checking" || status === "capturing";
  const label =
    status === "accessibility_required"
      ? t({
          id: "pill.shortcut.permission",
          message:
            "Enable Accessibility to use Fn. You can still click Dictate.",
        })
      : t({
          id: "pill.shortcut.unavailable",
          message:
            "Keyboard shortcut unavailable. Open settings to fix it, or click Dictate.",
        });
  return (
    <button
      type="button"
      data-overlay-expand-zone
      disabled={checking}
      aria-label={
        ready ? t({ id: "pill.preflight.dictate", message: "Dictate" }) : label
      }
      title={ready ? "Fn" : label}
      onClick={
        ready
          ? onReadyClick
          : () => {
              void openShortcutPermissionHelp();
            }
      }
      className="flex h-full w-[46px] shrink-0 items-center justify-center gap-1 border-l border-white/10 ui-text-meta font-semibold text-[var(--color-pill-preview-text)]"
    >
      {checking ? "…" : "Fn"}
      {!ready && !checking && (
        <WarningCircle size={10} weight="fill" aria-hidden="true" />
      )}
    </button>
  );
}

type DockControlsProps = {
  shortcutStatus: ReturnType<typeof useShortcutStatus>;
  onPointerDown: ReturnType<typeof useOverlayDrag>["onPointerDown"];
  language: string;
  menuOpen: boolean;
  starting: boolean;
  currentLanguage: string;
  beginDictation: () => void;
  beginNote: () => void;
  setMenuOpen: (open: boolean) => void;
};

function DockControls({
  shortcutStatus,
  onPointerDown,
  language,
  menuOpen,
  starting,
  currentLanguage,
  beginDictation,
  beginNote,
  setMenuOpen,
}: DockControlsProps) {
  const { t } = useLingui();
  return (
    <>
      <DragHandle onPointerDown={onPointerDown} />
      <button
        type="button"
        onClick={beginDictation}
        disabled={starting}
        className={`ui-text-body-sm inline-flex h-10 ${shortcutStatus === "ready" ? "w-[149px]" : "w-[103px]"} shrink-0 cursor-pointer items-center gap-2 rounded-full px-2 font-semibold text-[var(--ui-capture-fg-strong)] transition-colors duration-150 hover:bg-[var(--surface-pill-control-muted)] active:bg-[var(--surface-pill-control-active)] disabled:opacity-60`}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] ui-color-on-solid [box-shadow:var(--ui-pill-signal-shadow)]">
          <Microphone size={13} weight="fill" />
        </span>
        {starting
          ? t({ id: "pill.preflight.starting", message: "Starting…" })
          : t({ id: "pill.preflight.dictate", message: "Dictate" })}
        {shortcutStatus === "ready" ? (
          <kbd
            className={`ml-auto rounded-md border border-[var(--ui-pill-shell-border)] bg-[var(--ui-capture-key-bg)] px-1.5 py-0.5 ${tenPixelTextClass} font-medium text-[var(--ui-capture-fg)] [box-shadow:var(--ui-pill-key-shadow)]`}
          >
            Fn
          </kbd>
        ) : null}
      </button>
      {shortcutStatus !== "ready" ? (
        <ShortcutControl
          status={shortcutStatus}
          onReadyClick={beginDictation}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="h-5 w-px shrink-0 bg-[var(--color-pill-control-border)]"
      />
      <button
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t({
          id: "pill.preflight.language",
          message: "Dictation language",
        })}
        onClick={() => setMenuOpen(!menuOpen)}
        className={`inline-flex h-8 min-w-9 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-xl px-1 ${tenPixelTextClass} font-semibold text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-[var(--surface-pill-control-muted)] active:bg-[var(--surface-pill-control-active)]`}
      >
        {language ? language.toUpperCase() : "AUTO"}
        <CaretDown
          size={10}
          weight="bold"
          className="text-[var(--ui-capture-muted)]"
        />
      </button>
      <button
        type="button"
        aria-label={t({ id: "pill.preflight.new_note", message: "New note" })}
        title={t({ id: "pill.preflight.new_note", message: "New note" })}
        onClick={beginNote}
        className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-[var(--surface-pill-control-muted)] hover:text-[var(--ui-capture-fg-strong)] active:bg-[var(--surface-pill-control-active)]"
      >
        <Plus size={17} weight="bold" />
      </button>
      <span className="sr-only">{currentLanguage}</span>
    </>
  );
}

type LanguageMenuProps = {
  dockPosition: CapturePillDockPosition;
  sticky: boolean;
  language: string;
  languages: TranscriptionLanguageOption[];
  selectLanguage: (language: string) => void;
};

function LanguageMenu({
  dockPosition,
  sticky,
  language,
  languages,
  selectLanguage,
}: LanguageMenuProps) {
  const { t } = useLingui();
  return (
    <div
      role="menu"
      className={`ui-pill-shell absolute z-30 max-h-[188px] w-52 overflow-y-auto rounded-2xl border border-[var(--ui-pill-shell-border)] p-1.5 ${languageMenuPlacement(sticky, dockPosition)}`}
    >
      <p
        className={`px-2 py-1 ${tenPixelTextClass} font-medium text-[var(--ui-capture-muted)]`}
      >
        {t({
          id: "pill.preflight.language.current",
          message: "Dictation language",
        })}
      </p>
      {languages
        .filter(({ locked, isHeader }) => !locked && !isHeader)
        .map((option) => (
          <button
            key={option.code || "auto"}
            type="button"
            role="menuitemradio"
            aria-checked={option.code === language}
            onClick={() => selectLanguage(option.code)}
            className={`relative z-30 flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left ${elevenPixelTextClass} text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-[var(--surface-pill-control-muted)] active:bg-[var(--surface-pill-control-active)]`}
          >
            <span>{option.name}</span>
            {option.code === language ? (
              <Check
                size={12}
                weight="bold"
                className="text-[var(--color-accent)]"
              />
            ) : null}
          </button>
        ))}
    </div>
  );
}

export function CapturePreflight({
  sticky = false,
  isHovered = false,
}: CapturePreflightProps) {
  const { t } = useLingui();
  const preflight = usePillPreflight();
  const shortcutStatus = useShortcutStatus();
  const drag = useOverlayDrag();
  const expanded = !sticky || isHovered || preflight.menuOpen;
  const layout = resolveDockLayout(
    preflight.dockPosition,
    preflight.presentation,
    preflight.menuOpen,
  );

  return (
    <div
      className={`flex h-full w-full select-none ${sticky ? layout.alignment : "items-start justify-center"}`}
    >
      <div
        className={`relative ${sticky ? "h-full w-full" : "h-12 w-[264px]"}`}
        onPointerLeave={() => {
          if (preflight.menuOpen) preflight.setMenuOpen(false);
        }}
      >
        <section
          onClickCapture={drag.onClickCapture}
          className={`relative flex items-center overflow-hidden rounded-full text-[var(--ui-capture-fg)] ${expanded ? "pill-preflight-reveal ui-pill-shell ui-capture-dock h-12 w-[264px]" : "ui-sticky-launcher h-9 w-24"} ${sticky ? `absolute z-20 ${expanded ? layout.shellPlacement : layout.launcherPlacement}` : ""}`}
          style={
            {
              "--pill-reveal-from": `inset(${layout.compactTop}px ${168 - layout.compactLeft}px ${12 - layout.compactTop}px ${layout.compactLeft}px round 18px)`,
            } as CSSProperties
          }
          role={expanded ? "group" : undefined}
          aria-label={
            expanded
              ? t({ id: "pill.preflight.label", message: "Dictation controls" })
              : undefined
          }
        >
          {expanded ? (
            <div
              key="expanded"
              className="pill-controls-reveal ml-1 flex h-12 w-[254px] shrink-0 items-center"
            >
              <DockControls
                shortcutStatus={shortcutStatus}
                onPointerDown={drag.onPointerDown}
                language={preflight.language}
                menuOpen={preflight.menuOpen}
                starting={preflight.starting}
                currentLanguage={preflight.currentLanguage}
                beginDictation={preflight.beginDictation}
                beginNote={preflight.beginNote}
                setMenuOpen={preflight.setMenuOpen}
              />
            </div>
          ) : (
            <div
              key="compact"
              className="flex h-9 w-[94px] shrink-0 items-center"
            >
              <DragHandle onPointerDown={drag.onPointerDown} compact />
              <ShortcutControl
                status={shortcutStatus}
                onReadyClick={preflight.beginDictation}
              />
            </div>
          )}
        </section>
        {preflight.menuOpen ? (
          <LanguageMenu
            dockPosition={preflight.dockPosition}
            sticky={sticky}
            language={preflight.language}
            languages={preflight.languages}
            selectLanguage={preflight.selectLanguage}
          />
        ) : null}
      </div>
    </div>
  );
}
