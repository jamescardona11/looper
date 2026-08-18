import type { DeviceInfo } from "../../../../types";

export type MicrophoneTestStatus = "idle" | "starting" | "listening" | "error";
export type MicrophoneTestError =
  "unsupported" | "permission-denied" | "not-found" | "busy" | "start-failed";
export type MicrophoneTestLevels = { left: number; right: number };

type MicrophoneTestSnapshot = {
  status: MicrophoneTestStatus;
  levels: MicrophoneTestLevels;
  error: MicrophoneTestError | null;
  activeDeviceLabel: string | null;
};

type MicrophoneEnvironment = {
  mediaDevices?: MediaDevices;
  AudioContext?: typeof AudioContext;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
};

const EMPTY_LEVELS: MicrophoneTestLevels = { left: 0, right: 0 };
const LEVEL_UPDATE_INTERVAL_MS = 24;

export function createMicrophoneTestStore(
  inputDevices: DeviceInfo[],
  microphoneDevice: string | null,
  environment: MicrophoneEnvironment = browserMicrophoneEnvironment(),
) {
  let snapshot: MicrophoneTestSnapshot = {
    status: "idle",
    levels: EMPTY_LEVELS,
    error: null,
    activeDeviceLabel: null,
  };
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let animationFrame: number | null = null;
  let smoothedLevels = EMPTY_LEVELS;
  let runId = 0;
  const listeners = new Set<() => void>();

  const publish = (next: MicrophoneTestSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const releaseResources = () => {
    if (animationFrame !== null) {
      environment.cancelFrame(animationFrame);
      animationFrame = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void audioContext?.close();
    audioContext = null;
  };

  const reset = () => {
    runId += 1;
    releaseResources();
    smoothedLevels = EMPTY_LEVELS;
    publish({
      status: "idle",
      levels: EMPTY_LEVELS,
      error: null,
      activeDeviceLabel: null,
    });
  };

  const fail = (error: MicrophoneTestError) => {
    releaseResources();
    smoothedLevels = EMPTY_LEVELS;
    publish({
      status: "error",
      levels: EMPTY_LEVELS,
      error,
      activeDeviceLabel: null,
    });
  };

  const start = async () => {
    const mediaDevices = environment.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      fail("unsupported");
      return;
    }

    runId += 1;
    const currentRun = runId;
    releaseResources();
    smoothedLevels = EMPTY_LEVELS;
    publish({
      status: "starting",
      levels: EMPTY_LEVELS,
      error: null,
      activeDeviceLabel: null,
    });

    let acquiredStream: MediaStream | null = null;
    try {
      const selectedName = getSelectedMicrophoneName(
        inputDevices,
        microphoneDevice,
      );
      acquiredStream = await mediaDevices.getUserMedia({ audio: true });
      if (currentRun !== runId) {
        stopStream(acquiredStream);
        return;
      }

      const browserDeviceId = await findBrowserMicrophoneDeviceId(
        mediaDevices,
        selectedName,
      );
      if (currentRun !== runId) {
        stopStream(acquiredStream);
        return;
      }
      if (browserDeviceId) {
        const selectedStream = await mediaDevices.getUserMedia({
          audio: { deviceId: { exact: browserDeviceId } },
        });
        if (currentRun !== runId) {
          stopStream(selectedStream);
          stopStream(acquiredStream);
          return;
        }
        stopStream(acquiredStream);
        acquiredStream = selectedStream;
      }

      if (!environment.AudioContext) {
        throw new Error("AudioContext is not available");
      }

      const context = new environment.AudioContext();
      const source = context.createMediaStreamSource(acquiredStream);
      const leftAnalyser = context.createAnalyser();
      const rightAnalyser = context.createAnalyser();
      const splitter = context.createChannelSplitter(2);
      const audioTrack = acquiredStream.getAudioTracks()[0];
      const channelCount = audioTrack?.getSettings().channelCount ?? 1;
      for (const analyser of [leftAnalyser, rightAnalyser]) {
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.12;
      }
      source.connect(splitter);
      splitter.connect(leftAnalyser, 0);
      splitter.connect(rightAnalyser, channelCount > 1 ? 1 : 0);

      stream = acquiredStream;
      audioContext = context;
      publish({
        status: "listening",
        levels: EMPTY_LEVELS,
        error: null,
        activeDeviceLabel: audioTrack?.label || selectedName,
      });

      const leftData = new Uint8Array(leftAnalyser.fftSize);
      const rightData = new Uint8Array(rightAnalyser.fftSize);
      let lastUpdate = 0;
      const sample = (now: number) => {
        leftAnalyser.getByteTimeDomainData(leftData);
        rightAnalyser.getByteTimeDomainData(rightData);
        if (now - lastUpdate > LEVEL_UPDATE_INTERVAL_MS) {
          smoothedLevels = smoothMicrophoneLevels(smoothedLevels, {
            left: calculateMicrophoneLevel(leftData),
            right: calculateMicrophoneLevel(rightData),
          });
          publish({ ...snapshot, levels: smoothedLevels });
          lastUpdate = now;
        }
        animationFrame = environment.requestFrame(sample);
      };
      animationFrame = environment.requestFrame(sample);
    } catch (error) {
      stopStream(acquiredStream);
      if (currentRun === runId) fail(microphoneError(error));
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) reset();
      };
    },
    reset,
    start,
  };
}

export function getSelectedMicrophoneName(
  inputDevices: DeviceInfo[],
  microphoneDevice: string | null,
) {
  if (!microphoneDevice) return null;
  return (
    inputDevices.find((device) => device.id === microphoneDevice)?.name ?? null
  );
}

export function smoothMicrophoneLevels(
  previous: MicrophoneTestLevels,
  target: MicrophoneTestLevels,
): MicrophoneTestLevels {
  return {
    left: smoothLevel(previous.left, target.left),
    right: smoothLevel(previous.right, target.right),
  };
}

export function calculateMicrophoneLevel(data: Uint8Array) {
  let energy = 0;
  for (const sample of data) {
    const centered = (sample - 128) / 128;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / data.length);
  const normalized = Math.max(0, rms - 0.012) / (0.18 - 0.012);
  return Math.min(1, Math.pow(normalized, 0.72));
}

export function microphoneError(error: unknown): MicrophoneTestError {
  if (error instanceof DOMException) {
    if (["NotAllowedError", "PermissionDeniedError"].includes(error.name)) {
      return "permission-denied";
    }
    if (["NotFoundError", "DevicesNotFoundError"].includes(error.name)) {
      return "not-found";
    }
    if (["NotReadableError", "TrackStartError"].includes(error.name)) {
      return "busy";
    }
  }
  return "start-failed";
}

async function findBrowserMicrophoneDeviceId(
  mediaDevices: MediaDevices,
  selectedDeviceName: string | null,
) {
  if (!selectedDeviceName || !mediaDevices.enumerateDevices) return null;
  const selectedName = normalizeMicrophoneLabel(selectedDeviceName);
  if (!selectedName) return null;

  const devices = await mediaDevices.enumerateDevices();
  const match = devices.find((device) => {
    if (device.kind !== "audioinput" || !device.deviceId || !device.label) {
      return false;
    }
    const browserName = normalizeMicrophoneLabel(device.label);
    return (
      browserName.includes(selectedName) || selectedName.includes(browserName)
    );
  });
  return match?.deviceId ?? null;
}

function smoothLevel(previous: number, target: number) {
  const factor = target > previous ? 0.78 : 0.32;
  const next = previous + (target - previous) * factor;
  return next < 0.02 ? 0 : next;
}

function normalizeMicrophoneLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/^default\s*[-:]\s*/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function browserMicrophoneEnvironment(): MicrophoneEnvironment {
  const browserWindow = typeof window === "undefined" ? undefined : window;
  const AudioContext =
    browserWindow?.AudioContext ??
    (
      browserWindow as
        | (Window & { webkitAudioContext?: typeof globalThis.AudioContext })
        | undefined
    )?.webkitAudioContext;
  return {
    mediaDevices:
      typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    AudioContext,
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
  };
}
