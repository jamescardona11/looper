import { useLingui } from "@lingui/react/macro";
import { CaretDown, Check, Microphone, Plus } from "@phosphor-icons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CapturePillDockPosition } from "../../data/dictation";
import type { TranscriptionLanguageOption } from "../../shared/lib/transcriptionLanguages";
import { LooperLogo } from "../../shared/ui/LooperLogo";
import {
  languageMenuPlacement,
  resolveDockLayout,
} from "./pill-preflight-layout";
import { usePillPreflight } from "./use-pill-preflight";

const tenPixelTextClass = `text-[${10}px]`;
const elevenPixelTextClass = `text-[${11}px]`;

export type CapturePreflightProps = {
  sticky?: boolean;
  isHovered?: boolean;
};

function dragDock(event: ReactPointerEvent<HTMLButtonElement>) {
  if (event.button !== 0) return;
  event.preventDefault();
  void getCurrentWindow()
    .startDragging()
    .catch((error) => console.error("Failed to drag Dictation dock:", error));
}

function FloatingLauncher() {
  const { t } = useLingui();
  return (
    <button
      type="button"
      data-overlay-drag-handle
      aria-label={t({
        id: "pill.preflight.drag_floating",
        message: "Move Capture pill",
      })}
      onPointerDown={dragDock}
      className="ui-sticky-launcher absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-full text-[var(--color-local-light)] active:cursor-grabbing"
    >
      <span aria-hidden="true">
        <LooperLogo size="sm" />
      </span>
    </button>
  );
}

function FloatingGrip() {
  const { t } = useLingui();
  const dragLabel = t({
    id: "pill.preflight.drag",
    message: "Move Dictation dock",
  });
  return (
    <button
      type="button"
      data-overlay-drag-handle
      aria-label={dragLabel}
      title={dragLabel}
      onPointerDown={dragDock}
      className="flex h-10 w-2.5 shrink-0 cursor-grab flex-col items-center justify-center gap-[2px] rounded-full active:cursor-grabbing"
    >
      {[0, 1, 2, 3].map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className="h-0.5 w-0.5 rounded-full bg-[var(--ui-capture-muted)]"
        />
      ))}
    </button>
  );
}

type DockControlsProps = {
  floating: boolean;
  language: string;
  menuOpen: boolean;
  starting: boolean;
  currentLanguage: string;
  beginDictation: () => void;
  beginNote: () => void;
  setMenuOpen: (open: boolean) => void;
};

function DockControls({
  floating,
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
      {floating ? <FloatingGrip /> : <span className="w-2.5 shrink-0" />}
      <button
        type="button"
        onClick={beginDictation}
        disabled={starting}
        className="ui-text-body-sm inline-flex h-10 w-[149px] shrink-0 items-center gap-2 rounded-full px-2 font-semibold text-[var(--ui-capture-fg-strong)] transition-colors duration-150 hover:bg-white/6 active:bg-white/10 disabled:opacity-60"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-local-light)] text-[var(--color-bg-primary)] [box-shadow:var(--ui-pill-signal-shadow)]">
          <Microphone size={13} weight="fill" />
        </span>
        {starting
          ? t({ id: "pill.preflight.starting", message: "Starting…" })
          : t({ id: "pill.preflight.dictate", message: "Dictate" })}
        <kbd
          className={`ml-auto rounded-md border border-[var(--ui-pill-shell-border)] bg-[var(--ui-capture-key-bg)] px-1.5 py-0.5 ${tenPixelTextClass} font-medium text-[var(--ui-capture-fg)] [box-shadow:var(--ui-pill-key-shadow)]`}
        >
          Fn
        </kbd>
      </button>
      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-white/10" />
      <button
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t({
          id: "pill.preflight.language",
          message: "Dictation language",
        })}
        onClick={() => setMenuOpen(!menuOpen)}
        className={`inline-flex h-8 min-w-9 shrink-0 items-center justify-center gap-0.5 rounded-xl px-1 ${tenPixelTextClass} font-semibold text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-white/6 active:bg-white/10`}
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
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-white/6 hover:text-[var(--ui-capture-fg-strong)] active:bg-white/10"
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
            className={`relative z-30 flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left ${elevenPixelTextClass} text-[var(--ui-capture-fg)] transition-colors duration-150 hover:bg-white/6 active:bg-white/10`}
          >
            <span>{option.name}</span>
            {option.code === language ? (
              <Check
                size={12}
                weight="bold"
                className="text-[var(--color-local-light)]"
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
        className={`relative ${sticky ? "h-full w-full" : "h-12 w-[260px]"}`}
        onPointerLeave={() => {
          if (preflight.menuOpen) preflight.setMenuOpen(false);
        }}
      >
        {sticky && !expanded && preflight.presentation === "dock" ? (
          <div
            aria-hidden="true"
            className={`absolute bg-white/45 ${layout.edgeHandle}`}
          />
        ) : null}
        {sticky && !expanded && preflight.presentation === "floating" ? (
          <FloatingLauncher />
        ) : null}
        {expanded ? (
          <section
            className={`ui-pill-shell relative flex h-12 w-[260px] items-center overflow-hidden rounded-full border border-[var(--ui-pill-shell-border)] px-1 text-white ${sticky ? `ui-capture-dock absolute z-20 ${layout.shellPlacement}` : ""}`}
            role="group"
            aria-label={t({
              id: "pill.preflight.label",
              message: "Dictation controls",
            })}
          >
            <DockControls
              floating={preflight.presentation === "floating"}
              language={preflight.language}
              menuOpen={preflight.menuOpen}
              starting={preflight.starting}
              currentLanguage={preflight.currentLanguage}
              beginDictation={preflight.beginDictation}
              beginNote={preflight.beginNote}
              setMenuOpen={preflight.setMenuOpen}
            />
          </section>
        ) : null}
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
