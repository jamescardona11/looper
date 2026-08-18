export const LOCAL_STT_MODEL_ID = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
export const LOCAL_STT_MODEL_NAME = "NVIDIA Parakeet TDT 0.6B v3 INT8";
export const LOCAL_STT_MODEL_DOWNLOAD_BYTES = 487_170_055;

const minimumMemoryBytes = 4 * 1024 ** 3;
const recommendedMemoryBytes = 6 * 1024 ** 3;

export type LocalSttMemoryTier = "unknown" | "unsupported" | "caution" | "ready";

export function getLocalSttMemoryTier(
  totalMemoryBytes: number | null | undefined,
): LocalSttMemoryTier {
  if (!totalMemoryBytes || totalMemoryBytes <= 0) return "unknown";
  if (totalMemoryBytes < minimumMemoryBytes) return "unsupported";
  if (totalMemoryBytes < recommendedMemoryBytes) return "caution";
  return "ready";
}

export function toNativeFilePath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  const path = uri.slice("file://".length);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function normalizeLocalSttProgress(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}
