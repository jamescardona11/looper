import { type SttProvider, useApiKeys, useTranscribe } from "@looper/data";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

const RUN_FLAG = "__looperWebCaptureFixtureSmokeStarted";
const DEFAULT_PROVIDER = "openai";

type WebCaptureFixtureSmokeReport = {
  ok: boolean;
  status: "recording" | "transcribing" | "success" | "error";
  text: string;
  blobBytes: number;
  mimeType: string;
  sourceMatched: boolean;
  error?: string;
};

const HARVARD_TRANSCRIPT_PATTERN = /stale|smell|beer|heat|odor|pickle|ham/i;

export function shouldRunWebCaptureFixtureSmoke(): boolean {
  if (import.meta.env.VITE_E2E_WEB_CAPTURE_FIXTURE_SMOKE === "1") return true;
  return new URLSearchParams(window.location.search).get("webCaptureFixtureSmoke") === "1";
}

function webCaptureRecordMs(): number {
  const params = new URLSearchParams(window.location.search);
  const raw =
    params.get("webCaptureRecordMs") ?? import.meta.env.VITE_E2E_WEB_CAPTURE_RECORD_MS ?? "1500";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1500;
}

export function WebCaptureFixtureSmoke(): ReactNode {
  const apiKeys = useApiKeys();
  const stt = useTranscribe();
  const startedRef = useRef(false);
  const [report, setReport] = useState<WebCaptureFixtureSmokeReport | null>(null);

  const publishReport = useCallback((nextReport: WebCaptureFixtureSmokeReport) => {
    setReport(nextReport);
    window.dispatchEvent(new CustomEvent("looper:web-capture-fixture", { detail: nextReport }));
    console.info(`[VERIFY] web capture fixture: ${JSON.stringify(nextReport)}`);
  }, []);

  useEffect(() => {
    if (!shouldRunWebCaptureFixtureSmoke()) return;
    if (startedRef.current) return;
    const globalState = window as unknown as Record<string, boolean>;
    if (globalState[RUN_FLAG]) return;
    startedRef.current = true;
    globalState[RUN_FLAG] = true;

    const provider = (import.meta.env.VITE_E2E_TRANSCRIBE_PROVIDER ??
      DEFAULT_PROVIDER) as SttProvider;

    async function run() {
      let blobBytes = 0;
      let mimeType = "";
      try {
        if (!stt.isAvailable) {
          throw new Error("STT backend is not available in this build.");
        }
        publishReport({
          ok: false,
          status: "recording",
          text: "",
          blobBytes,
          mimeType,
          sourceMatched: false,
        });
        const blob = await recordBrowserAudio(webCaptureRecordMs());
        blobBytes = blob.size;
        mimeType = blob.type || "audio/webm";
        publishReport({
          ok: false,
          status: "transcribing",
          text: "",
          blobBytes,
          mimeType,
          sourceMatched: false,
        });
        if (provider === "openai" && import.meta.env.VITE_E2E_OPENAI_API_KEY) {
          await apiKeys.save("openai", import.meta.env.VITE_E2E_OPENAI_API_KEY);
        }
        const result = await stt.transcribe({ blob, type: mimeType, provider });
        const text = result.text.trim();
        const sourceMatched = HARVARD_TRANSCRIPT_PATTERN.test(text);
        publishReport({
          ok: sourceMatched,
          status: sourceMatched ? "success" : "error",
          text,
          blobBytes,
          mimeType,
          sourceMatched,
          ...(sourceMatched
            ? {}
            : { error: "STT did not return the shared Harvard fixture text." }),
        });
      } catch (cause) {
        publishReport({
          ok: false,
          status: "error",
          text: "",
          blobBytes,
          mimeType,
          sourceMatched: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    void run();
  }, [apiKeys, publishReport, stt]);

  if (!shouldRunWebCaptureFixtureSmoke()) return null;

  return (
    <output data-testid="web-capture-fixture-smoke" hidden>
      {JSON.stringify(report ?? { ok: false, status: "recording" })}
    </output>
  );
}

function recordBrowserAudio(recordMs: number): Promise<Blob> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error("Browser microphone capture is not available."));
  }

  return navigator.mediaDevices.getUserMedia({ audio: true }).then(
    (stream) =>
      new Promise<Blob>((resolve, reject) => {
        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(stream);
        const stopTracks = () => {
          for (const track of stream.getTracks()) track.stop();
        };

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onerror = () => {
          stopTracks();
          reject(new Error("Browser microphone recording failed."));
        };
        recorder.onstop = () => {
          stopTracks();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.start();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, recordMs);
      }),
    (cause) => {
      throw cause instanceof Error
        ? cause
        : new Error("Browser microphone permission was rejected.");
    },
  );
}
