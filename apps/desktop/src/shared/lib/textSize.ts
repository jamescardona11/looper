import type { AppPlatformId } from "./platform";

type TextSizeMode = "small" | "default" | "large";

export const TEXT_SIZE_MODE_STORAGE_KEY = "looper_text_size_mode";

const TEXT_SIZE_MODES: readonly TextSizeMode[] = ["small", "default", "large"];

const TEXT_SCALE = {
  windows: {
    small: "1",
    default: "1.0625",
    large: "1.125",
  },
  standard: {
    small: "0.94",
    default: "1",
    large: "1.08",
  },
} as const;

export function parseTextSizeMode(value: string | null): TextSizeMode {
  return TEXT_SIZE_MODES.includes(value as TextSizeMode)
    ? (value as TextSizeMode)
    : "default";
}

export function resolveTextScale(
  mode: TextSizeMode,
  platform: AppPlatformId = "unsupported",
): string {
  const scale = platform === "windows" ? TEXT_SCALE.windows : TEXT_SCALE.standard;
  return scale[mode];
}
