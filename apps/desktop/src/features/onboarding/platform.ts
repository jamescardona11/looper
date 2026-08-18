import { getPlatformCapabilities } from "../../platform/service";
import type { PlatformCapabilities } from "../../shared/lib/platform";

const ONBOARDING_FLOW = [
  "welcome",
  "mode",
  "model",
  "import",
  "intelligence",
  "permissions",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_FLOW)[number];

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
