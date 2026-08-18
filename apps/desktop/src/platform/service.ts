type NavigatorWithPlatformData = Navigator & {
  userAgentData?: { platform?: string };
};

export type AppPlatformId = "macos" | "windows" | "unsupported";

type PlatformPolicy = Readonly<{
  requiresNativeMicrophonePermission: boolean;
  requiresAccessibilityPermission: boolean;
  requiresInputMonitoringPermission: boolean;
  supportsAutoPauseMedia: boolean;
  usesCustomWindowControls: boolean;
}>;

export type PlatformCapabilities = PlatformPolicy & { id: AppPlatformId };

const CAPABILITIES: Record<AppPlatformId, PlatformPolicy> = {
  macos: {
    requiresNativeMicrophonePermission: true,
    requiresAccessibilityPermission: true,
    requiresInputMonitoringPermission: true,
    supportsAutoPauseMedia: true,
    usesCustomWindowControls: false,
  },
  windows: {
    requiresNativeMicrophonePermission: false,
    requiresAccessibilityPermission: false,
    requiresInputMonitoringPermission: false,
    supportsAutoPauseMedia: true,
    usesCustomWindowControls: true,
  },
  unsupported: {
    requiresNativeMicrophonePermission: false,
    requiresAccessibilityPermission: false,
    requiresInputMonitoringPermission: false,
    supportsAutoPauseMedia: false,
    usesCustomWindowControls: false,
  },
};

export function detectAppPlatform(): AppPlatformId {
  if (typeof navigator === "undefined") return "unsupported";

  const browser = navigator as NavigatorWithPlatformData;
  const platformHints = [
    browser.userAgentData?.platform,
    browser.platform,
    browser.userAgent,
  ].filter((hint): hint is string => Boolean(hint));

  if (platformHints.some((hint) => /mac/i.test(hint))) return "macos";
  if (platformHints.some((hint) => /win/i.test(hint))) return "windows";
  return "unsupported";
}

export function getPlatformCapabilities(): PlatformCapabilities {
  const id = detectAppPlatform();
  return { id, ...CAPABILITIES[id] };
}
