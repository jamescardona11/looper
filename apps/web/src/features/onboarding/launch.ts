export type OnboardingIntent = "chat" | "voice";
export type OnboardingAccess = "free" | "byok";
export type LaunchTarget = "/agent" | "/transcribe" | "/settings";

const LAUNCH_TARGETS = new Set<LaunchTarget>(["/agent", "/transcribe", "/settings"]);

export type OnboardingDestination =
  | { to: "/agent" | "/transcribe" }
  | { to: "/settings"; search: { tab: "keys" } };

export function isLaunchTarget(value: unknown): value is LaunchTarget {
  return typeof value === "string" && LAUNCH_TARGETS.has(value as LaunchTarget);
}

export function onboardingDestination(
  intent: OnboardingIntent,
  access: OnboardingAccess,
): OnboardingDestination {
  if (access === "byok") {
    return { to: "/settings", search: { tab: "keys" } };
  }

  const routes: Record<OnboardingIntent, OnboardingDestination> = {
    chat: { to: "/agent" },
    voice: { to: "/transcribe" },
  };
  return routes[intent];
}
