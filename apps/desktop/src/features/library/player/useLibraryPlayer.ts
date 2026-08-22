import { useLingui } from "@lingui/react/macro";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { resolveLibraryAudioUrl } from "../../../data/library";
import {
  createLibraryPlayerLoop,
  type LibraryPlayerLoop,
} from "./library-player-loop";
import { startLibraryRateDrag } from "./library-player-rate-drag";
import {
  createLibrarySound,
  readLibrarySoundPosition,
  type LibrarySound,
  type LibrarySoundEvent,
} from "./library-player-sound";
import {
  initialLibraryPlayerState,
  libraryPlayerTimeline,
  reduceLibraryPlayer,
  steppedPlaybackRate,
  timestampSeconds,
} from "./library-player-state";

type UseLibraryPlayerOptions = {
  audioPath: string;
  durationSeconds: number;
};

export type LibraryPlayer = {
  audioDuration: number;
  audioCurrentTime: number;
  isPlaying: boolean;
  audioReady: boolean;
  audioError: string | null;
  playbackRate: number;
  handlePlaybackRateStep: (direction: -1 | 1) => void;
  handleRateScrubStart: (
    event: MouseEvent<HTMLSpanElement> | TouchEvent<HTMLSpanElement>,
  ) => void;
  handleTogglePlayback: () => void;
  handleScrubChange: (nextValue: string) => void;
  handleScrubStart: () => void;
  handleScrubEnd: () => void;
  handleTimestampClick: (startMs: number) => void;
  scrubberMax: number;
  scrubberValue: number;
  scrubberPercent: number;
  canDecreasePlaybackRate: boolean;
  canIncreasePlaybackRate: boolean;
};

export function useLibraryPlayer({
  audioPath,
  durationSeconds,
}: UseLibraryPlayerOptions): LibraryPlayer {
  const { t } = useLingui();
  const [state, dispatch] = useReducer(
    reduceLibraryPlayer,
    durationSeconds,
    initialLibraryPlayerState,
  );
  const soundRef = useRef<LibrarySound | null>(null);
  const rateRef = useRef(1);
  const playingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const pendingScrubRef = useRef<number | null>(null);
  const rateDragCleanupRef = useRef<(() => void) | null>(null);
  const loopRef = useRef<LibraryPlayerLoop | null>(null);
  if (loopRef.current === null) loopRef.current = createLibraryPlayerLoop();
  const loop = loopRef.current;

  const unavailableText = t({
    id: "library.modal.audio_unavailable",
    message: "Audio unavailable",
  });

  const recordPlaying = useCallback((playing: boolean) => {
    playingRef.current = playing;
    dispatch({ type: "playback-changed", playing });
  }, []);

  const recordScrubbing = useCallback((scrubbing: boolean) => {
    scrubbingRef.current = scrubbing;
    dispatch({ type: "scrubbing-changed", scrubbing });
  }, []);

  const receiveSoundEvent = useCallback(
    (sound: LibrarySound, event: LibrarySoundEvent) => {
      switch (event.type) {
        case "ready":
          dispatch({ type: "source-ready", duration: event.duration });
          return;
        case "load-failed":
          console.error("Audio load error:", event.error);
          dispatch({
            type: "source-failed",
            disableSource: true,
            stopPlayback: false,
          });
          return;
        case "play-failed":
          console.error("Audio play error:", event.error);
          dispatch({
            type: "source-failed",
            disableSource: true,
            stopPlayback: true,
          });
          playingRef.current = false;
          loop.stop();
          return;
        case "playing":
          recordPlaying(true);
          loop.start(sound, (frame) => {
            if (frame.playing !== playingRef.current) {
              recordPlaying(frame.playing);
            }
            if (
              frame.playing &&
              !scrubbingRef.current &&
              typeof frame.position === "number"
            ) {
              dispatch({ type: "position-changed", seconds: frame.position });
            }
          });
          return;
        case "paused":
        case "stopped":
          recordPlaying(false);
          loop.stop();
          return;
        case "ended":
          playingRef.current = false;
          loop.stop();
          dispatch({ type: "playback-ended", duration: event.duration });
          return;
        case "seeked":
          if (!scrubbingRef.current) {
            const position = readLibrarySoundPosition(sound);
            if (typeof position === "number") {
              dispatch({ type: "position-changed", seconds: position });
            }
          }
      }
    },
    [loop, recordPlaying],
  );

  const audioUrl = useMemo(
    () => resolveLibraryAudioUrl(audioPath),
    [audioPath],
  );

  useEffect(() => {
    loop.stop();
    rateDragCleanupRef.current?.();
    rateDragCleanupRef.current = null;
    playingRef.current = false;
    scrubbingRef.current = false;
    resumeAfterScrubRef.current = false;
    pendingScrubRef.current = null;
    dispatch({ type: "source-changed", fallbackDuration: durationSeconds });

    const sound = createLibrarySound(
      audioUrl,
      rateRef.current,
      receiveSoundEvent,
    );
    soundRef.current = sound;

    return () => {
      loop.stop();
      rateDragCleanupRef.current?.();
      rateDragCleanupRef.current = null;
      if (soundRef.current === sound) soundRef.current = null;
      sound.unload();
    };
  }, [audioUrl, durationSeconds, loop, receiveSoundEvent]);

  const updateRate = useCallback((rate: number) => {
    rateRef.current = rate;
    dispatch({ type: "rate-changed", rate });
    soundRef.current?.rate(rate);
  }, []);

  const handlePlaybackRateStep = useCallback(
    (direction: -1 | 1) => {
      updateRate(steppedPlaybackRate(rateRef.current, direction));
    },
    [updateRate],
  );

  const handleRateScrubStart = useCallback(
    (event: MouseEvent<HTMLSpanElement> | TouchEvent<HTMLSpanElement>) => {
      rateDragCleanupRef.current?.();
      rateDragCleanupRef.current = startLibraryRateDrag(
        event,
        rateRef.current,
        (nextRate) => {
          if (nextRate !== rateRef.current) updateRate(nextRate);
        },
      );
    },
    [updateRate],
  );

  const handleTogglePlayback = useCallback(() => {
    const sound = soundRef.current;
    if (!sound || state.failed || !state.ready) return;
    if (sound.playing()) sound.pause();
    else sound.play();
  }, [state.failed, state.ready]);

  const handleScrubChange = useCallback((nextValue: string) => {
    const sound = soundRef.current;
    if (!sound) return;
    const nextTime = Number(nextValue);
    if (!Number.isFinite(nextTime)) return;
    pendingScrubRef.current = nextTime;
    sound.seek(nextTime);
    dispatch({ type: "position-changed", seconds: nextTime });
  }, []);

  const handleScrubStart = useCallback(() => {
    const sound = soundRef.current;
    if (!sound || state.failed || !state.ready) return;
    resumeAfterScrubRef.current = sound.playing();
    recordScrubbing(true);
    sound.pause();
  }, [recordScrubbing, state.failed, state.ready]);

  const reportSynchronousPlayFailure = useCallback(
    (prefix: string, error: unknown) => {
      console.error(prefix, error);
      dispatch({
        type: "source-failed",
        disableSource: false,
        stopPlayback: false,
      });
    },
    [],
  );

  const handleScrubEnd = useCallback(() => {
    const sound = soundRef.current;
    if (!sound || state.failed || !state.ready) return;
    recordScrubbing(false);
    const pendingTime = pendingScrubRef.current;
    if (typeof pendingTime === "number" && Number.isFinite(pendingTime)) {
      sound.seek(pendingTime);
      dispatch({ type: "position-changed", seconds: pendingTime });
    }
    pendingScrubRef.current = null;
    if (resumeAfterScrubRef.current) {
      try {
        sound.play();
      } catch (error) {
        reportSynchronousPlayFailure("Failed to resume audio:", error);
      }
    }
    resumeAfterScrubRef.current = false;
  }, [
    recordScrubbing,
    reportSynchronousPlayFailure,
    state.failed,
    state.ready,
  ]);

  const handleTimestampClick = useCallback(
    (startMs: number) => {
      const sound = soundRef.current;
      if (!sound || state.failed || !state.ready) return;
      const nextTime = timestampSeconds(startMs);
      sound.seek(nextTime);
      dispatch({ type: "position-changed", seconds: nextTime });
      if (sound.playing()) return;
      try {
        sound.play();
      } catch (error) {
        reportSynchronousPlayFailure("Failed to play audio:", error);
      }
    },
    [reportSynchronousPlayFailure, state.failed, state.ready],
  );

  const timeline = libraryPlayerTimeline(state);
  return {
    audioDuration: state.duration,
    audioCurrentTime: state.currentTime,
    isPlaying: state.playing,
    audioReady: state.ready,
    audioError: state.failed ? unavailableText : null,
    playbackRate: state.rate,
    handlePlaybackRateStep,
    handleRateScrubStart,
    handleTogglePlayback,
    handleScrubChange: (value) => {
      if (!state.failed && state.ready) handleScrubChange(value);
    },
    handleScrubStart,
    handleScrubEnd,
    handleTimestampClick,
    scrubberMax: timeline.max,
    scrubberValue: timeline.value,
    scrubberPercent: timeline.percent,
    canDecreasePlaybackRate: timeline.canDecreaseRate,
    canIncreasePlaybackRate: timeline.canIncreaseRate,
  };
}
