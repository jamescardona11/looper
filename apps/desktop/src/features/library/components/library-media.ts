export const SUPPORTED_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "flac",
  "mp4",
  "mov",
  "webm",
  "mkv",
];

export const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 2.5, 3, 4];

export function clampProgress(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

export function shouldShowImportProgress(value: number) {
  const progress = clampProgress(value);
  return progress >= 0.02 && progress < 0.98;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const minuteLabel = minutes.toString().padStart(2, "0");
  const secondLabel = remainder.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${minuteLabel}:${secondLabel}`
    : `${minutes}:${secondLabel}`;
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";

  const unitSize = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(unitSize)),
    units.length - 1,
  );
  const amount = Number((bytes / unitSize ** unitIndex).toFixed(1));
  return `${amount} ${units[unitIndex]}`;
}

export function formatPlaybackRate(rate: number) {
  return rate.toFixed(2).replace(/\.?0+$/, "");
}

export function getFileExtension(path: string) {
  const separator = path.lastIndexOf(".");
  return separator === -1 ? "" : path.slice(separator + 1).toLowerCase();
}

export function uniquePaths(paths: string[]) {
  return [...new Set(paths)];
}

export function formatLibraryName(name: string) {
  return name.replace(/[_.]/g, " ");
}

export function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
}
