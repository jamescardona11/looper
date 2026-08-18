import {
  librarySoundIsPlaying,
  readLibrarySoundPosition,
  type LibrarySound,
} from "./library-player-sound";

export type LibraryPlayerFrame = {
  playing: boolean;
  position?: number;
};

export type LibraryPlayerLoop = {
  start: (
    sound: LibrarySound,
    onFrame: (frame: LibraryPlayerFrame) => void,
  ) => void;
  stop: () => void;
};

export function createLibraryPlayerLoop(): LibraryPlayerLoop {
  let pendingFrame: number | null = null;

  const stop = () => {
    if (pendingFrame === null) return;
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  };

  const start: LibraryPlayerLoop["start"] = (sound, onFrame) => {
    stop();
    const tick = () => {
      const playing = librarySoundIsPlaying(sound);
      onFrame({
        playing,
        position: playing ? readLibrarySoundPosition(sound) : undefined,
      });
      pendingFrame = requestAnimationFrame(tick);
    };
    pendingFrame = requestAnimationFrame(tick);
  };

  return { start, stop };
}
