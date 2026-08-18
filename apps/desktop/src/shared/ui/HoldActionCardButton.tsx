import {
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  resolveActionCardAccent,
  type ActionCardAccentPreset,
} from "./actionCardButtonAccents";

const HOLD_DURATION_MS = 2000;
const HOLD_RING_RADIUS = 10;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_RADIUS;

type HoldActionCardButtonProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  accentPreset?: ActionCardAccentPreset;
  ariaLabel?: string;
};

type HoldSnapshot = {
  progress: number;
  holding: boolean;
  ready: boolean;
};

const IDLE_HOLD: HoldSnapshot = {
  progress: 0,
  holding: false,
  ready: false,
};

function createHoldController(durationMs: number) {
  let snapshot = IDLE_HOLD;
  let startedAt = 0;
  let frameId: number | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: HoldSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const stopFrame = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
  const reset = () => {
    stopFrame();
    publish(IDLE_HOLD);
  };
  const advance = (timestamp: number) => {
    frameId = null;
    if (!snapshot.holding) return;

    const progress = Math.min(1, (timestamp - startedAt) / durationMs);
    publish({ progress, holding: true, ready: progress >= 1 });
    if (progress < 1) frameId = requestAnimationFrame(advance);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopFrame();
      };
    },
    start: (timestamp: number) => {
      if (snapshot.holding) return;
      startedAt = timestamp;
      publish({ progress: 0, holding: true, ready: false });
      frameId = requestAnimationFrame(advance);
    },
    finish: () => {
      const confirmed = snapshot.ready;
      reset();
      return confirmed;
    },
    cancel: reset,
  };
}

export default function HoldActionCardButton({
  title,
  description,
  icon,
  onConfirm,
  disabled = false,
  accentPreset = "accent",
  ariaLabel,
}: HoldActionCardButtonProps) {
  const controller = useMemo(() => createHoldController(HOLD_DURATION_MS), []);
  const hold = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => IDLE_HOLD,
  );
  const accent = resolveActionCardAccent(accentPreset);
  const style = {
    "--action-card-border": accent.borderColor,
    "--action-card-background": accent.backgroundColor,
    "--action-card-hover-shadow": "var(--ui-action-card-hover-shadow)",
    "--action-card-rest-shadow": "var(--ui-action-card-rest-shadow)",
  } as CSSProperties;

  const beginPointerHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    controller.start(performance.now());
  };
  const beginKeyboardHold = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    controller.start(performance.now());
  };
  const finishHold = () => {
    if (controller.finish()) onConfirm();
  };
  const finishKeyboardHold = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    finishHold();
  };
  const cancelWhenLeaving = (event: PointerEvent<HTMLButtonElement>) => {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related))
      return;
    controller.cancel();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      data-holding={hold.holding || undefined}
      data-ready={hold.ready || undefined}
      onPointerDown={beginPointerHold}
      onPointerUp={finishHold}
      onPointerLeave={cancelWhenLeaving}
      onPointerCancel={controller.cancel}
      onKeyDown={beginKeyboardHold}
      onKeyUp={finishKeyboardHold}
      onBlur={controller.cancel}
      style={style}
      className="group relative w-full overflow-hidden rounded-lg border border-border-primary bg-surface-surface px-3 py-2.5 text-left outline-hidden select-none touch-none [box-shadow:var(--action-card-rest-shadow)] transition-[scale,box-shadow,border-color,background-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-border-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-border-primary disabled:hover:bg-surface-surface disabled:hover:[box-shadow:var(--action-card-rest-shadow)] hover:border-[var(--action-card-border)] hover:bg-[var(--action-card-background)] hover:[box-shadow:var(--action-card-hover-shadow)] data-[holding=true]:scale-[0.99] data-[holding=true]:border-[var(--action-card-border)] data-[holding=true]:bg-[var(--action-card-background)] data-[holding=true]:[box-shadow:none] data-[ready=true]:border-[var(--color-accent-50)] data-[ready=true]:bg-[var(--action-card-background)] data-[ready=true]:[box-shadow:0_0_0_1px_var(--color-accent-20)]"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-0 origin-left rounded-lg bg-[var(--action-card-background)] opacity-0 transition-opacity duration-200 group-data-[holding=true]:opacity-100 ${icon ? "hidden" : "block"}`}
        style={{ transform: `scaleX(${hold.progress})` }}
      />
      <span className="relative z-[1] flex items-center gap-2.5">
        {icon ? (
          <span
            aria-hidden="true"
            className="relative grid size-7 shrink-0 place-items-center leading-none ui-color-primary [&_svg]:block [&_svg]:shrink-0"
          >
            <svg
              className="pointer-events-none absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-data-[holding=true]:opacity-100"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="14"
                cy="14"
                r={HOLD_RING_RADIUS}
                stroke="var(--color-accent-20)"
                strokeWidth="1.5"
              />
              <circle
                cx="14"
                cy="14"
                r={HOLD_RING_RADIUS}
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={HOLD_RING_CIRCUMFERENCE}
                strokeDashoffset={HOLD_RING_CIRCUMFERENCE * (1 - hold.progress)}
                transform="rotate(-90 14 14)"
              />
            </svg>
            {icon}
          </span>
        ) : null}
        <span className="flex min-w-0 flex-col justify-center">
          <span className="ui-text-label-strong ui-color-primary block leading-tight">
            {title}
          </span>
          {description ? (
            <span className="ui-text-micro ui-color-disabled block leading-tight">
              {description}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
