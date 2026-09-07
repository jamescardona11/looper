import { useLingui } from "@lingui/react/macro";
import { CaretDown, Check, Microphone, Plus } from "@phosphor-icons/react";
import type { CapturePillDockPosition } from "../../data/capture/dictation";
import type { TranscriptionLanguageOption } from "../../shared/lib/transcriptionLanguages";
import { LooperLogo } from "../../shared/ui/LooperLogo";
import {
  languageMenuPlacement,
  resolveDockLayout,
} from "./pill-preflight-layout";
import { useOverlayDrag } from "./use-overlay-drag";
import { usePillPreflight } from "./use-pill-preflight";

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

function FloatingLauncher({
  onPointerDown,
  placement,
}: Pick<ReturnType<typeof useOverlayDrag>, "onPointerDown"> & {
  placement?: string;
}) {
  return (
    <div
      className={`ui-sticky-launcher absolute flex h-9 w-24 overflow-hidden rounded-full ${
        placement ?? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      }`}
    >
      <DragHandle onPointerDown={onPointerDown} compact />
      <span
        data-overlay-expand-zone
        aria-hidden="true"
        className="flex h-full w-[46px] shrink-0 items-center justify-center gap-1.5 border-l border-white/10 px-2 ui-text-meta font-semibold text-[var(--color-pill-preview-text)]"
      >
        <span>Fn</span>
        <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
      </span>
    </div>
  );
}

type DockControlsProps = {
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
        className="ui-text-body-sm inline-flex h-10 w-[149px] shrink-0 cursor-pointer items-center gap-2 rounded-full px-2 font-semibold text-[var(--ui-capture-fg-strong)] transition-colors duration-150 hover:bg-[var(--surface-pill-control-muted)] active:bg-[var(--surface-pill-control-active)] disabled:opacity-60"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] ui-color-on-solid [box-shadow:var(--ui-pill-signal-shadow)]">
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
        {sticky && !expanded ? (
          <FloatingLauncher
            onPointerDown={drag.onPointerDown}
            placement={
              preflight.presentation === "dock"
                ? layout.launcherPlacement
                : undefined
            }
          />
        ) : null}
        {expanded ? (
          <section
            onClickCapture={drag.onClickCapture}
            className={`ui-pill-shell relative flex h-12 w-[264px] items-center overflow-hidden rounded-full border border-[var(--ui-pill-shell-border)] px-1 text-[var(--ui-capture-fg)] ${sticky ? `ui-capture-dock absolute z-20 ${layout.shellPlacement}` : ""}`}
            role="group"
            aria-label={t({
              id: "pill.preflight.label",
              message: "Dictation controls",
            })}
          >
            <DockControls
              onPointerDown={drag.onPointerDown}
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
