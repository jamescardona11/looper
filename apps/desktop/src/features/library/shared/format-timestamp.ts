const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

export function formatTimestamp(milliseconds: number): string {
  const elapsedSeconds = Math.floor(milliseconds / 1_000);
  const time = {
    hours: Math.floor(elapsedSeconds / SECONDS_PER_HOUR),
    minutes: Math.floor(
      (elapsedSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
    ),
    seconds: elapsedSeconds % SECONDS_PER_MINUTE,
  };

  const seconds = paddedClockField(time.seconds);
  if (time.hours > 0) {
    return `${time.hours}:${paddedClockField(time.minutes)}:${seconds}`;
  }

  return `${time.minutes}:${seconds}`;
}

function paddedClockField(value: number): string {
  return String(value).padStart(2, "0");
}
