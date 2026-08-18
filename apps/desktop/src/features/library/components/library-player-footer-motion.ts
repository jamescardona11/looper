const RESTING_RATE_FRAME = { opacity: 1, y: 0, scale: 1 } as const;
const ENTERING_RATE_FRAME = { opacity: 0, y: -2, scale: 0.92 } as const;
const LEAVING_RATE_FRAME = { opacity: 0, y: 2, scale: 0.92 } as const;

export const playbackRateRestingFrame = RESTING_RATE_FRAME;

export function playbackRateMotion(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      initial: false as const,
      exit: undefined,
      transition: { duration: 0 },
    };
  }

  return {
    initial: ENTERING_RATE_FRAME,
    exit: LEAVING_RATE_FRAME,
    transition: { duration: 0.16, ease: "easeOut" as const },
  };
}
