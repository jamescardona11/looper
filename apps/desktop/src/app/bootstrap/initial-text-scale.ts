import type { AppPlatformId } from "../../platform/service";
import { parseTextSizeMode, resolveTextScale } from "../../shared/lib/textSize";

type InitialTextScaleOptions = {
  disabled: boolean;
  windowLabel: string;
  storedMode: string | null;
  platform: AppPlatformId;
};

export function initialTextScale({
  disabled,
  windowLabel,
  storedMode,
  platform,
}: InitialTextScaleOptions) {
  if (disabled || windowLabel !== "settings") return null;
  return resolveTextScale(parseTextSizeMode(storedMode), platform);
}
