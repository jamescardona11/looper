import { convertFileSrc as toAssetUrl } from "@tauri-apps/api/core";
import {
  useLayoutEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { useMountEffect } from "../../../shared/hooks/useMountEffect";

type PlaybackRef = MutableRefObject<HTMLAudioElement | null>;
type PlayingSetter = Dispatch<SetStateAction<boolean>>;

export function TranscriptionAudioLifetime(props: {
  playbackRef: PlaybackRef;
  onPlayingChange: PlayingSetter;
}) {
  useMountEffect(() => {
    props.onPlayingChange(false);
    return () => {
      const audio = props.playbackRef.current;
      if (!audio) return;
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
      props.playbackRef.current = null;
    };
  });
  return null;
}

export function TranscriptOverflowSensor(props: {
  contentKey: string;
  expanded: boolean;
  textRef: RefObject<HTMLDivElement | null>;
  onOverflowChange: PlayingSetter;
}) {
  useLayoutEffect(() => {
    if (props.expanded) {
      props.onOverflowChange(true);
      return;
    }
    const element = props.textRef.current;
    if (!element) return;
    const measure = () => {
      props.onOverflowChange(element.scrollHeight > element.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.contentKey, props.expanded, props.onOverflowChange, props.textRef]);
  return null;
}

export function toggleTranscriptionPlayback(input: {
  available: boolean;
  path: string;
  playbackRef: PlaybackRef;
  onPlayingChange: PlayingSetter;
}): void {
  if (!input.available || !input.path) return;
  let audio = input.playbackRef.current;
  if (!audio) {
    audio = new Audio(toAssetUrl(input.path));
    audio.onplay = () => input.onPlayingChange(true);
    audio.onpause = () => input.onPlayingChange(false);
    audio.onended = () => input.onPlayingChange(false);
    audio.onerror = () => input.onPlayingChange(false);
    input.playbackRef.current = audio;
  }
  if (audio.paused) {
    void audio.play().catch((error: unknown) => {
      input.onPlayingChange(false);
      console.error("Failed to play transcription audio:", error);
    });
  } else {
    audio.pause();
  }
}
