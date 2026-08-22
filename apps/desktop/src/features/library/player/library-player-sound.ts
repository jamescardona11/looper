import { Howl } from "howler";

export type LibrarySoundEvent =
  | { type: "ready"; duration: number }
  | { type: "load-failed"; error: unknown }
  | { type: "play-failed"; error: unknown }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "stopped" }
  | { type: "ended"; duration?: number }
  | { type: "seeked" };

export type LibrarySound = Howl;

type SoundListener = (sound: LibrarySound, event: LibrarySoundEvent) => void;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function readLibrarySoundPosition(
  sound: LibrarySound,
): number | undefined {
  const position = sound.seek();
  return typeof position === "number" ? position : undefined;
}

export function librarySoundIsPlaying(sound: LibrarySound): boolean {
  const mediaNode = (
    sound as unknown as {
      _sounds?: Array<{ _node?: HTMLAudioElement }>;
    }
  )._sounds?.[0]?._node;
  return mediaNode ? !mediaNode.paused && !mediaNode.ended : sound.playing();
}

export function createLibrarySound(
  source: string,
  initialRate: number,
  notify: SoundListener,
): LibrarySound {
  const emit = (sound: LibrarySound, event: LibrarySoundEvent) =>
    notify(sound, event);
  const sound = new Howl({
    src: [source],
    html5: true,
    preload: true,
    onload: () =>
      emit(sound, {
        type: "ready",
        duration: finiteNumber(sound.duration()) ?? 0,
      }),
    onloaderror: (_id, error) => emit(sound, { type: "load-failed", error }),
    onplayerror: (_id, error) => emit(sound, { type: "play-failed", error }),
    onplay: () => emit(sound, { type: "playing" }),
    onpause: () => emit(sound, { type: "paused" }),
    onstop: () => emit(sound, { type: "stopped" }),
    onend: () =>
      emit(sound, {
        type: "ended",
        duration: finiteNumber(sound.duration()),
      }),
    onseek: () => emit(sound, { type: "seeked" }),
  });
  sound.rate(initialRate);
  return sound;
}
