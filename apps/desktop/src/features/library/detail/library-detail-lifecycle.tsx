import { useRef, type RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { useMountEffect } from "../../../shared/hooks/useMountEffect";

type KeyboardState = {
  close: () => void;
  togglePlayback: () => void;
  timestampStep: (direction: number) => void;
  deleteOpen: boolean;
  closeDelete: () => void;
  segmentView: boolean;
  lastNavigation: RefObject<number>;
};

export function LibraryDetailKeyboardBridge(props: KeyboardState) {
  const latest = useRef(props);
  latest.current = props;
  useMountEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = latest.current;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const textEntry =
        tag === "input" || tag === "textarea" || target?.isContentEditable;
      const interactive =
        textEntry ||
        tag === "button" ||
        tag === "a" ||
        tag === "select" ||
        target?.getAttribute("role") === "button" ||
        target?.getAttribute("role") === "link" ||
        target?.getAttribute("role") === "menuitem";

      if (event.key === "Escape") {
        event.preventDefault();
        if (state.deleteOpen) state.closeDelete();
        else state.close();
      } else if (event.key === " " && !interactive) {
        event.preventDefault();
        state.togglePlayback();
      } else if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        state.segmentView &&
        !textEntry
      ) {
        const now = performance.now();
        if (now - state.lastNavigation.current < 140) return;
        state.lastNavigation.current = now;
        event.preventDefault();
        state.timestampStep(event.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  return null;
}

type SearchSyncProps = {
  query: string;
  segmentView: boolean;
  streaming: boolean;
  segmentMatches: number[];
  streamMatches: number[];
  activeSearch: number;
  textMatch: number;
  segments: RefObject<VirtuosoHandle | null>;
  stream: RefObject<VirtuosoHandle | null>;
  textarea: RefObject<HTMLTextAreaElement | null>;
};

export function LibraryDetailSearchSync(props: SearchSyncProps) {
  const signature = [
    props.query,
    props.segmentView,
    props.streaming,
    props.activeSearch,
    props.textMatch,
    props.segmentMatches.join(","),
    props.streamMatches.join(","),
  ].join(":");
  return props.query ? <SearchSyncSession key={signature} {...props} /> : null;
}

function SearchSyncSession(props: SearchSyncProps) {
  useMountEffect(() => {
    const active = (matches: number[]) =>
      matches[Math.min(props.activeSearch, matches.length - 1)];
    if (props.segmentView && props.segmentMatches.length) {
      props.segments.current?.scrollToIndex({
        index: active(props.segmentMatches),
        align: "center",
        behavior: "smooth",
      });
    } else if (props.streaming && props.streamMatches.length) {
      props.stream.current?.scrollToIndex({
        index: active(props.streamMatches),
        align: "center",
        behavior: "smooth",
      });
    } else if (props.textMatch >= 0 && props.textarea.current) {
      props.textarea.current.focus();
      props.textarea.current.setSelectionRange(
        props.textMatch,
        props.textMatch + props.query.length,
      );
    }
  });
  return null;
}

type FollowSyncProps = {
  enabled: boolean;
  activeSegment: number;
  visiblePosition: number;
  scroller: RefObject<HTMLElement | null>;
  virtuoso: RefObject<VirtuosoHandle | null>;
  scrollTo: (target: number) => void;
};

export function LibraryDetailFollowSync(props: FollowSyncProps) {
  const signature = `${props.enabled}:${props.activeSegment}:${props.visiblePosition}`;
  return props.enabled && props.visiblePosition >= 0 ? (
    <FollowSyncSession key={signature} {...props} />
  ) : null;
}

function FollowSyncSession(props: FollowSyncProps) {
  useMountEffect(() => {
    const scroller = props.scroller.current;
    const row = scroller?.querySelector<HTMLElement>(
      `[data-index="${props.visiblePosition}"]`,
    );
    if (!scroller || !row) {
      props.virtuoso.current?.scrollToIndex({
        index: props.visiblePosition,
        align: "center",
        behavior: "smooth",
      });
      return;
    }
    const viewport = scroller.getBoundingClientRect();
    const item = row.getBoundingClientRect();
    const centered =
      scroller.scrollTop +
      item.top -
      viewport.top -
      (scroller.clientHeight - item.height) / 2;
    props.scrollTo(
      Math.min(
        scroller.scrollHeight - scroller.clientHeight,
        Math.max(0, centered),
      ),
    );
  });
  return null;
}

export function LibraryDetailScrollInterruption({
  scroller,
  stop,
}: {
  scroller: RefObject<HTMLElement | null>;
  stop: () => void;
}) {
  useMountEffect(() => {
    const element = scroller.current;
    if (!element) return;
    element.addEventListener("wheel", stop, { passive: true });
    element.addEventListener("touchmove", stop, { passive: true });
    return () => {
      element.removeEventListener("wheel", stop);
      element.removeEventListener("touchmove", stop);
      stop();
    };
  });
  return null;
}
