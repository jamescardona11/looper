import { useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { getPlatformCapabilities } from "../../../platform/service";
import {
  checkMacAccessibilityPermission,
  checkMacInputMonitoringPermission,
} from "../../../shared/lib/macosPermissions";
import {
  checkMicrophonePermission,
  openMicrophoneSettings,
  requestMicrophonePermission,
} from "../../../data/settings";
import type { PlatformCapabilities } from "../../../platform/service";

type PermissionValue = boolean | null;

type PermissionSnapshot = Readonly<{
  microphone: PermissionValue;
  accessibility: PermissionValue;
  inputMonitoring: PermissionValue;
}>;

const EMPTY_PERMISSIONS: PermissionSnapshot = Object.freeze({
  microphone: null,
  accessibility: null,
  inputMonitoring: null,
});

export function useSettingsPermissions(enabled: boolean) {
  const platformCapabilities = useMemo(() => getPlatformCapabilities(), []);
  const permissionQuery = useQuery({
    queryKey: ["settings", "permissions", platformCapabilities.id],
    queryFn: () => readPermissionSnapshot(platformCapabilities),
    enabled,
    refetchOnWindowFocus: "always",
  });

  useNativeFocusRefresh(enabled, permissionQuery.refetch);

  const microphoneRequest = useMutation({
    mutationFn: requestMicrophoneAccess,
    onSettled: () => {
      void permissionQuery.refetch();
    },
  });
  const snapshot = permissionQuery.data ?? EMPTY_PERMISSIONS;

  return {
    platformCapabilities,
    ...snapshot,
    requestMicrophone: microphoneRequest.mutateAsync,
    refresh: permissionQuery.refetch,
  };
}

async function readPermissionSnapshot(
  capabilities: PlatformCapabilities,
): Promise<PermissionSnapshot> {
  const checks = await Promise.allSettled([
    capabilities.requiresNativeMicrophonePermission
      ? checkMicrophonePermission()
      : Promise.resolve<PermissionValue>(null),
    capabilities.requiresAccessibilityPermission
      ? checkMacAccessibilityPermission()
      : Promise.resolve<PermissionValue>(null),
    capabilities.requiresInputMonitoringPermission
      ? checkMacInputMonitoringPermission()
      : Promise.resolve<PermissionValue>(null),
  ]);

  return {
    microphone: permissionResult(checks[0]),
    accessibility: permissionResult(checks[1]),
    inputMonitoring: permissionResult(checks[2]),
  };
}

async function requestMicrophoneAccess() {
  try {
    await requestMicrophonePermission();
  } catch {
    // The system-settings fallback can still succeed.
  }

  try {
    if (!(await checkMicrophonePermission())) {
      await openMicrophoneSettings();
    }
  } catch {
    try {
      await openMicrophoneSettings();
    } catch {
      // A later focus refresh remains the source of truth.
    }
  }
}

function useNativeFocusRefresh(
  enabled: boolean,
  refresh: () => Promise<unknown>,
) {
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let release: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused && !disposed) void refresh();
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else release = unlisten;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      release?.();
    };
  }, [enabled, refresh]);
}

function permissionResult(
  result: PromiseSettledResult<PermissionValue>,
): PermissionValue {
  return result.status === "fulfilled" ? result.value : false;
}
