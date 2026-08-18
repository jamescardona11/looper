import { type SttProvider, useApiKeys, useTranscribe } from "@looper/data";
import { useEffect } from "react";
import { reportTranscribeFixtureSmoke } from "@/lib/desktop-host";
import { loadSharedAudioFixture } from "./audio-fixture";

const RUN_FLAG = "__looperTranscribeFixtureSmokeStarted";
const DEFAULT_PROVIDER = "openai";

export function shouldRunTranscribeFixtureSmoke(): boolean {
  return import.meta.env.VITE_E2E_TRANSCRIBE_FIXTURE_SMOKE === "1";
}

export function TranscribeFixtureSmoke(): null {
  const apiKeys = useApiKeys();
  const stt = useTranscribe();

  useEffect(() => {
    if (!shouldRunTranscribeFixtureSmoke()) return;
    const globalState = window as unknown as Record<string, boolean>;
    if (globalState[RUN_FLAG]) return;
    globalState[RUN_FLAG] = true;

    const provider = (import.meta.env.VITE_E2E_TRANSCRIBE_PROVIDER ??
      DEFAULT_PROVIDER) as SttProvider;

    async function run() {
      let name = "";
      let blobBytes = 0;
      let mimeType = "";
      try {
        if (!stt.isAvailable) {
          throw new Error("STT backend is not available in this build.");
        }
        const fixture = await loadSharedAudioFixture();
        if (!fixture) {
          throw new Error("No shared audio fixture was configured.");
        }
        if (provider === "openai" && import.meta.env.VITE_E2E_OPENAI_API_KEY) {
          await apiKeys.save("openai", import.meta.env.VITE_E2E_OPENAI_API_KEY);
        }
        name = fixture.name;
        blobBytes = fixture.blob.size;
        mimeType = fixture.mimeType;
        const result = await stt.transcribe({
          blob: fixture.blob,
          type: fixture.mimeType,
          provider,
        });
        await reportTranscribeFixtureSmoke({
          ok: result.text.trim().length > 0,
          provider,
          name,
          blobBytes,
          mimeType,
          text: result.text,
        });
      } catch (cause) {
        await reportTranscribeFixtureSmoke({
          ok: false,
          provider,
          name,
          blobBytes,
          mimeType,
          text: "",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    void run();
  }, [apiKeys, stt]);

  return null;
}
