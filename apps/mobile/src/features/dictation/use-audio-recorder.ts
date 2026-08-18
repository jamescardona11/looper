import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
  useAudioRecorder as useExpoAudioRecorder,
} from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import {
  meteringToAudioLevel,
  smoothAudioLevel,
} from "@/shared/components/pill-listening-signal-logic";

const meteredRecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export interface RecordedAudio {
  uri: string;
  durationMs: number;
}

export function useAudioRecorder() {
  const recorder = useExpoAudioRecorder(meteredRecordingOptions);
  const state = useAudioRecorderState(recorder, 80);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  useEffect(() => {
    const nextLevel = state.isRecording ? meteringToAudioLevel(state.metering) : 0;
    setAudioLevel((current) => smoothAudioLevel(current, nextLevel));
  }, [state.isRecording, state.metering]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("Necesitas conceder acceso al micrófono.");
        return false;
      }
      await setAudioModeAsync({
        allowsBackgroundRecording: true,
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar la grabación.");
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    try {
      await recorder.stop();
      if (!recorder.uri) return null;
      return { uri: recorder.uri, durationMs: state.durationMillis ?? 0 };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo detener la grabación.");
      return null;
    }
  }, [recorder, state.durationMillis]);

  return {
    isRecording: state.isRecording,
    durationMs: state.durationMillis ?? 0,
    audioLevel,
    error,
    start,
    stop,
  };
}
