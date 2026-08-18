import {
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ElementType,
} from "react";

type TypewriterStore = {
  subscribe: (notify: () => void) => () => void;
  getSnapshot: () => string;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function createTypewriterStore(
  text: string,
  speedMs: number,
  delayMs: number,
): TypewriterStore {
  let displayed = prefersReducedMotion() ? text : "";
  let cursor = displayed.length;

  return {
    getSnapshot: () => displayed,
    subscribe: (notify) => {
      if (!text || cursor >= text.length) return () => undefined;

      let timeoutId: number | undefined;
      const revealNextCharacter = () => {
        cursor += 1;
        displayed = text.slice(0, cursor);
        notify();
        if (cursor < text.length) {
          timeoutId = window.setTimeout(revealNextCharacter, speedMs);
        }
      };

      timeoutId = window.setTimeout(revealNextCharacter, delayMs);
      return () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      };
    },
  };
}

export function useTypewriter(text: string, speedMs = 20, delayMs = 0): string {
  const store = useMemo(
    () => createTypewriterStore(text, speedMs, delayMs),
    [delayMs, speedMs, text],
  );

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => "");
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

export function TypewriterText({
  text,
  speedMs = 20,
  delayMs = 0,
  className,
  style,
  as: Tag = "span",
}: TypewriterTextProps) {
  const displayed = useTypewriter(text, speedMs, delayMs);

  return (
    <Tag className={className} style={style}>
      {displayed}
    </Tag>
  );
}
