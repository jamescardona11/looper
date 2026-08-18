import { useCallback, useEffect, useState } from "react";
import { requestMicPermission } from "@/shared/mic";

const STORAGE_KEY = "preferred-mic-device-id";

interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export function useMicrophoneDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [permissionState, setPermissionState] = useState<
    "granted" | "denied" | "prompt" | "unknown"
  >("unknown");

  const enumerate = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    try {
      const all = await mediaDevices.enumerateDevices();
      const mics = all
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 4)}`,
          isDefault: d.deviceId === "default",
        }));
      setDevices(mics);

      setSelectedId((currentId) =>
        currentId && !mics.some((mic) => mic.deviceId === currentId)
          ? (mics[0]?.deviceId ?? null)
          : currentId,
      );
    } catch {}
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;

    void enumerate();
    mediaDevices.addEventListener?.("devicechange", enumerate);
    return () => mediaDevices.removeEventListener?.("devicechange", enumerate);
  }, [enumerate]);

  useEffect(() => {
    const permissions = navigator.permissions;
    if (!permissions?.query) return;

    let active = true;
    let permissionStatus: PermissionStatus | undefined;
    const syncPermission = () => {
      if (active && permissionStatus) setPermissionState(permissionStatus.state);
    };

    void permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (!active) return;
        permissionStatus = status;
        syncPermission();
        status.addEventListener("change", syncPermission);
      })
      .catch(() => {
        if (active) setPermissionState("unknown");
      });

    return () => {
      active = false;
      permissionStatus?.removeEventListener("change", syncPermission);
    };
  }, []);

  const select = useCallback((deviceId: string) => {
    setSelectedId(deviceId);
    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch {}
  }, []);

  const requestPermission = useCallback(async () => {
    if (await requestMicPermission()) {
      setPermissionState("granted");
      await enumerate();
    } else {
      setPermissionState("denied");
    }
  }, [enumerate]);

  return { devices, selectedId, select, permissionState, requestPermission };
}
