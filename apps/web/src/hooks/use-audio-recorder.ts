import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MAX_DURATION = 120_000;
const LEVEL_SMOOTHING = 0.3;

export interface AudioRecorderResult {
  uri: string;
  mimeType: string;
  durationMs: number;
}

export interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  audioLevel: number;
  error: string | null;
  start: (deviceId?: string) => Promise<void>;
  stop: () => Promise<AudioRecorderResult | null>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

export interface AudioRecorderOptions {
  maxDurationMs?: number;
  onError?: (error: Error) => void;
}

export function useAudioRecorder(options: AudioRecorderOptions = {}): AudioRecorderState {
  const { maxDurationMs = DEFAULT_MAX_DURATION, onError } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((result: AudioRecorderResult | null) => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop();
      });
      streamRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setIsPaused(false);
    setDurationMs(0);
    setAudioLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Visibility recovery: resume AudioContext when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const startLevelMonitor = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const dataArray = new Float32Array(analyser.fftSize);
    let smoothed = 0;

    const tick = () => {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += (dataArray[i] ?? 0) * (dataArray[i] ?? 0);
      const rms = Math.sqrt(sum / dataArray.length);
      const normalized = Math.min(rms * 5, 1); // scale to 0-1 range
      smoothed += (normalized - smoothed) * LEVEL_SMOOTHING;
      setAudioLevel(smoothed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(
    async (deviceId?: string) => {
      try {
        setError(null);
        chunksRef.current = [];

        const constraints: MediaStreamConstraints = {
          audio: {
            channelCount: 1,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          // Permission fallback: retry without exact deviceId
          if (err instanceof DOMException && err.name === "OverconstrainedError" && deviceId) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                channelCount: 1,
                autoGainControl: true,
                echoCancellation: true,
                noiseSuppression: true,
              },
            });
          } else {
            throw err;
          }
        }
        streamRef.current = stream;

        // AudioContext + AnalyserNode for audio level
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/mp4";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const uri = URL.createObjectURL(blob);
          const elapsed = Date.now() - startTimeRef.current;
          if (resolveRef.current) {
            resolveRef.current({ uri, mimeType, durationMs: elapsed });
            resolveRef.current = null;
          }
          cleanup();
        };

        recorder.onerror = () => {
          const err = new Error("Recording failed");
          setError(err.message);
          onError?.(err);
          if (resolveRef.current) {
            resolveRef.current(null);
            resolveRef.current = null;
          }
          cleanup();
        };

        startTimeRef.current = Date.now();
        recorder.start(250);
        setIsRecording(true);
        startLevelMonitor();

        timerRef.current = setInterval(() => {
          const elapsed = Date.now() - startTimeRef.current;
          setDurationMs(elapsed);
          if (elapsed >= maxDurationMs) recorder.stop();
        }, 100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Microphone access denied";
        setError(msg);
        onError?.(err instanceof Error ? err : new Error(msg));
      }
    },
    [maxDurationMs, onError, cleanup, startLevelMonitor],
  );

  const stop = useCallback((): Promise<AudioRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "paused") {
      recorder.resume();
      setIsPaused(false);
    }
  }, []);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
    cleanup();
  }, [cleanup]);

  return {
    isRecording,
    isPaused,
    durationMs,
    audioLevel,
    error,
    start,
    stop,
    pause,
    resume,
    cancel,
  };
}
