import { getPlatformCapabilities } from "../../platform/service";
import type { PlatformCapabilities } from "../../shared/lib/platform";

export type OnboardingStep =
  | "welcome"
  | "mode"
  | "model"
  | "import"
  | "intelligence"
  | "permissions"
  | "done";

function onboardingPermissions({
  id,
  requiresNativeMicrophonePermission: requiresMicrophonePermission,
  requiresAccessibilityPermission,
}: PlatformCapabilities) {
  return {
    id,
    requiresMicrophonePermission,
    requiresAccessibilityPermission,
  };
}

export type OnboardingPlatform = ReturnType<typeof onboardingPermissions>;

function resolveOnboardingPlatform() {
  return onboardingPermissions(getPlatformCapabilities());
}

export { resolveOnboardingPlatform as getOnboardingPlatform };
