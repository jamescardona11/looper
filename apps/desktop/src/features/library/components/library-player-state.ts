import { PLAYBACK_RATES } from "./library-utils";

export type LibraryPlayerState = {
  duration: number;
  currentTime: number;
  playing: boolean;
  ready: boolean;
  failed: boolean;
  rate: number;
  scrubbing: boolean;
};

export type LibraryPlayerAction =
  | { type: "source-changed"; fallbackDuration: number }
  | { type: "source-ready"; duration: number }
  | {
      type: "source-failed";
      disableSource: boolean;
      stopPlayback: boolean;
    }
  | { type: "playback-changed"; playing: boolean }
  | { type: "position-changed"; seconds: number }
  | { type: "playback-ended"; duration?: number }
  | { type: "rate-changed"; rate: number }
  | { type: "scrubbing-changed"; scrubbing: boolean };

export type LibraryPlayerTimeline = {
  max: number;
  value: number;
  percent: number;
  canDecreaseRate: boolean;
  canIncreaseRate: boolean;
};

export function initialLibraryPlayerState(
  fallbackDuration: number,
): LibraryPlayerState {
  return {
    duration: fallbackDuration || 0,
    currentTime: 0,
    playing: false,
    ready: false,
    failed: false,
    rate: 1,
    scrubbing: false,
  };
}

export function reduceLibraryPlayer(
  state: LibraryPlayerState,
  action: LibraryPlayerAction,
): LibraryPlayerState {
  switch (action.type) {
    case "source-changed":
      return {
        ...initialLibraryPlayerState(action.fallbackDuration),
        rate: state.rate,
      };
    case "source-ready":
      return { ...state, duration: action.duration, ready: true };
    case "source-failed":
      return {
        ...state,
        failed: true,
        ready: action.disableSource ? false : state.ready,
        playing: action.stopPlayback ? false : state.playing,
      };
    case "playback-changed":
      return { ...state, playing: action.playing };
    case "position-changed":
      return { ...state, currentTime: action.seconds };
    case "playback-ended":
      return {
        ...state,
        playing: false,
        currentTime: action.duration ?? state.currentTime,
      };
    case "rate-changed":
      return { ...state, rate: action.rate };
    case "scrubbing-changed":
      return { ...state, scrubbing: action.scrubbing };
  }
}

export function libraryPlayerTimeline(
  state: Pick<LibraryPlayerState, "duration" | "currentTime" | "rate">,
): LibraryPlayerTimeline {
  const max = state.duration > 0 ? state.duration : 1;
  const value = Math.min(state.currentTime, max);
  return {
    max,
    value,
    percent: max > 0 ? (value / max) * 100 : 0,
    canDecreaseRate: state.rate > PLAYBACK_RATES[0],
    canIncreaseRate: state.rate < PLAYBACK_RATES[PLAYBACK_RATES.length - 1],
  };
}

export function steppedPlaybackRate(
  current: number,
  direction: -1 | 1,
): number {
  const fallbackIndex = PLAYBACK_RATES.indexOf(1);
  const currentIndex = PLAYBACK_RATES.indexOf(current);
  const origin = currentIndex < 0 ? fallbackIndex : currentIndex;
  const destination = Math.max(
    0,
    Math.min(PLAYBACK_RATES.length - 1, origin + direction),
  );
  return PLAYBACK_RATES[destination];
}

export function draggedPlaybackRate(
  initialRate: number,
  horizontalDelta: number,
): number {
  const fallbackIndex = PLAYBACK_RATES.indexOf(1);
  const currentIndex = PLAYBACK_RATES.indexOf(initialRate);
  const origin = currentIndex < 0 ? fallbackIndex : currentIndex;
  const offset = Math.round(horizontalDelta / 15);
  const destination = Math.max(
    0,
    Math.min(PLAYBACK_RATES.length - 1, origin + offset),
  );
  return PLAYBACK_RATES[destination];
}

export function timestampSeconds(startMilliseconds: number): number {
  return Math.max(0, startMilliseconds / 1000);
}
