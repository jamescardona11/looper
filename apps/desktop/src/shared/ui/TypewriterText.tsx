import {
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ElementType,
} from "react";

const EMPTY_SNAPSHOT = () => "";

type Timeline = {
  listen: (notify: () => void) => () => void;
  read: () => string;
};

function reducedMotionRequested(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
}

function typewriterTimeline(
  value: string,
  interval: number,
  initialWait: number,
): Timeline {
  let position = reducedMotionRequested() ? value.length : 0;
  let visible = value.slice(0, position);

  const read = () => visible;
  const listen = (notify: () => void) => {
    let timer: number | undefined;
    const advance = () => {
      position += 1;
      visible = value.slice(0, position);
      notify();
      if (position < value.length) timer = window.setTimeout(advance, interval);
    };

    if (position < value.length)
      timer = window.setTimeout(advance, initialWait);
    return () => timer !== undefined && window.clearTimeout(timer);
  };

  return { listen, read };
}

export function useTypewriter(text: string, speedMs = 20, delayMs = 0): string {
  const timeline = useMemo(
    () => typewriterTimeline(text, speedMs, delayMs),
    [delayMs, speedMs, text],
  );
  return useSyncExternalStore(timeline.listen, timeline.read, EMPTY_SNAPSHOT);
}

export function estimateTypewriterMs(
  text: string,
  speedMs = 20,
  delayMs = 0,
): number {
  return delayMs + text.length * speedMs;
}

type TypewriterTextProps = {
  text: string;
  speedMs?: number;
  delayMs?: number;
  className?: string;
  style?: CSSProperties;
  as?: ElementType;
};

export function TypewriterText(props: TypewriterTextProps) {
  const {
    text,
    speedMs = 20,
    delayMs = 0,
    className,
    style,
    as: Output = "span",
  } = props;
  const visibleText = useTypewriter(text, speedMs, delayMs);
  return (
    <Output className={className} style={style}>
      {visibleText}
    </Output>
  );
}
