import { loadAudioFixture } from "@/lib/desktop-host";

const NAMED_AUDIO_FIXTURES: Record<string, string> = {
  env: "/__e2e-audio-fixtures/env.wav",
  harvard: "/__e2e-audio-fixtures/harvard.wav",
};

export type AudioFixture = {
  blob: Blob;
  mimeType: string;
  name: string;
};

export function configuredAudioFixtureUrl(): string | null {
  const queryValue = new URLSearchParams(window.location.search).get("audioFixture");
  const value = queryValue ?? import.meta.env.VITE_E2E_AUDIO_FIXTURE ?? null;
  if (!value || value === "0" || value === "false") return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("blob:")) {
    return value;
  }
  return NAMED_AUDIO_FIXTURES[value] ?? null;
}

export async function loadSharedAudioFixture(): Promise<AudioFixture | null> {
  const url = configuredAudioFixtureUrl();
  if (url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Audio fixture failed to load: ${response.status}`);
    const blob = await response.blob();
    return {
      blob,
      mimeType: blob.type || "audio/wav",
      name: fixtureNameFromUrl(url),
    };
  }

  const desktopFixture = await loadAudioFixture();
  if (!desktopFixture) return null;

  return {
    blob: new Blob([new Uint8Array(desktopFixture.bytes)], {
      type: desktopFixture.mimeType,
    }),
    mimeType: desktopFixture.mimeType,
    name: desktopFixture.name,
  };
}

function fixtureNameFromUrl(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path.split("/").pop() || "audio-fixture.wav";
}
