/// <reference types="vite/client" />

type LooperWebEnvironment = {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_E2E_WEB_CAPTURE_FIXTURE_SMOKE?: string;
  readonly VITE_E2E_WEB_CAPTURE_RECORD_MS?: string;
  readonly VITE_E2E_TRANSCRIBE_FIXTURE_SMOKE?: string;
  readonly VITE_E2E_TRANSCRIBE_PROVIDER?: string;
  readonly VITE_E2E_OPENAI_API_KEY?: string;
  readonly VITE_E2E_MIC_PROBE?: string;
};

interface ImportMetaEnv extends LooperWebEnvironment {}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
