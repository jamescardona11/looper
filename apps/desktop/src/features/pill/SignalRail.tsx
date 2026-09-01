import type { ReactNode } from "react";

export const SIGNAL_RAIL_COLLAPSED_WIDTH = 176;
export const SIGNAL_RAIL_EXPANDED_WIDTH = 260;
export const SIGNAL_RAIL_HEIGHT = 48;
export const SIGNAL_RAIL_COMPACT_HEIGHT = 36;
export const SIGNAL_RAIL_ONE_LINE_WIDTH = 128;
export const SIGNAL_RAIL_RADIUS = 999;

export const SIGNAL_RAIL_SHELL_CLASS =
  "ui-pill-shell group/signal relative flex overflow-hidden border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] text-white [box-shadow:var(--ui-pill-shell-shadow)]";

interface SignalRailContentProps {
  signal: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  actionsVisible?: boolean;
  progress?: number;
  /** Compacto una-línea (spec pill v3): junto a la señal solo se ve esto;
   * título/meta aparecen en hover. */
  compactExtra?: ReactNode;
  /** Fuerza título/meta visibles aunque exista compactExtra (error, etc.). */
  infoVisible?: boolean;
  /** Solo para shells cuyo ancho también responde directamente a CSS hover.
   * En Dictation el ancho lo controla el estado nativo, así que revelar antes
   * las acciones las recortaría dentro del rail compacto. */
  revealOnGroupInteraction?: boolean;
  /** Desactiva las regiones declarativas cuando el consumidor entrega el
   * arrastre nativo desde una superficie que también contiene controles. */
  nativeDragRegions?: boolean;
}

export function SignalRailContent({
  signal,
  title,
  meta,
  actions,
  actionsVisible = false,
  progress,
  compactExtra,
  infoVisible = false,
  revealOnGroupInteraction = true,
  nativeDragRegions = true,
}: SignalRailContentProps) {
  const revealActions = actionsVisible
    ? "pointer-events-auto max-w-[148px] opacity-100"
    : revealOnGroupInteraction
      ? "pointer-events-none max-w-0 opacity-0 group-hover/signal:pointer-events-auto group-hover/signal:max-w-[148px] group-hover/signal:opacity-100 group-focus-within/signal:pointer-events-auto group-focus-within/signal:max-w-[148px] group-focus-within/signal:opacity-100"
      : "pointer-events-none max-w-0 opacity-0";

  const collapseInfo = compactExtra != null && !infoVisible;
  const revealInfo = collapseInfo
    ? revealOnGroupInteraction
      ? "max-w-0 opacity-0 group-hover/signal:max-w-[160px] group-hover/signal:opacity-100 group-focus-within/signal:max-w-[160px] group-focus-within/signal:opacity-100"
      : "max-w-0 opacity-0"
    : "max-w-[160px] opacity-100";
  const compactExtraInteraction = revealOnGroupInteraction
    ? "group-hover/signal:max-w-0 group-hover/signal:opacity-0 group-focus-within/signal:max-w-0 group-focus-within/signal:opacity-0"
    : "";
  const renderActions =
    actions != null && (actionsVisible || revealOnGroupInteraction);

  return (
    <>
      <div className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3">
        <div className="flex h-[18px] w-6 shrink-0 items-center justify-center">
          {signal}
        </div>
        {compactExtra != null ? (
          // Es el sustituto de `meta` mientras la píldora está encogida: en
          // cuanto `meta` se muestra, repetiría el mismo cronómetro, así que
          // se retira con la misma transición con la que entra la info.
          <span
            data-tauri-drag-region={nativeDragRegions ? true : undefined}
            className={`shrink-0 overflow-hidden text-[12px] font-medium tabular-nums text-white/90 transition-[max-width,opacity] duration-200 ease-out ${compactExtraInteraction} ${
              infoVisible ? "max-w-0 opacity-0" : "max-w-[64px] opacity-100"
            }`}
          >
            {compactExtra}
          </span>
        ) : null}
        <div
          data-tauri-drag-region={nativeDragRegions ? true : undefined}
          className={`min-w-0 flex-1 cursor-grab overflow-hidden transition-[max-width,opacity] duration-200 ease-out active:cursor-grabbing ${meta == null ? "flex h-full items-center" : ""} ${revealInfo}`}
        >
          <p
            data-tauri-drag-region={nativeDragRegions ? true : undefined}
            className="truncate text-[12px] font-semibold leading-[14px] tracking-[-0.01em]"
          >
            {title}
          </p>
          {meta != null ? (
            <p
              data-tauri-drag-region={nativeDragRegions ? true : undefined}
              className="truncate text-[10px] leading-[13px] text-white/60 tabular-nums"
            >
              {meta}
            </p>
          ) : null}
        </div>
        {renderActions ? (
          <div
            data-signal-actions
            className={`flex shrink-0 items-center gap-1.5 overflow-hidden transition-[max-width,opacity] duration-150 ease-out ${revealActions}`}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {progress != null ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-3 bottom-0 h-px overflow-hidden bg-white/10"
        >
          <div
            className="h-full bg-[var(--color-accent)] transition-[width] duration-100 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </>
  );
}

interface SignalRailProps extends SignalRailContentProps {
  ariaLabel: string;
  dragTitle: string;
  className?: string;
  shadow?: boolean;
}

export function SignalRail({
  ariaLabel,
  dragTitle,
  className = "",
  shadow = true,
  nativeDragRegions = true,
  ...content
}: SignalRailProps) {
  return (
    <section
      aria-label={ariaLabel}
      title={dragTitle}
      style={shadow ? undefined : { boxShadow: "none" }}
      className={`${SIGNAL_RAIL_SHELL_CLASS} h-[48px] w-[176px] rounded-full transition-[width,border-color] duration-200 ease-out hover:w-[260px] focus-within:w-[260px] ${className}`}
    >
      <SignalRailContent {...content} nativeDragRegions={nativeDragRegions} />
    </section>
  );
}
