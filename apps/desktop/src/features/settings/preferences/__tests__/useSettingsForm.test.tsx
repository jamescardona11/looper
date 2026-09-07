// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { StoredSettings } from "../../../../contracts/index";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  emit: vi.fn(),
  mutateAsync: vi.fn(),
  resetCaptureState: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: mocks.emit }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("../../../../shared/lib/macosPermissions", () => ({
  checkMacAccessibilityPermission: vi.fn().mockResolvedValue(true),
  checkMacInputMonitoringPermission: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../../platform/service", () => ({
  getPlatformCapabilities: () => ({
    id: "macos",
    requiresNativeMicrophonePermission: false,
    requiresAccessibilityPermission: false,
    requiresInputMonitoringPermission: false,
  }),
}));
vi.mock("../../../../shared/hooks/useModelDownloadEvents", () => ({
  useModelDownloadEvents: vi.fn(),
}));
vi.mock("../../../../shared/hooks/useShortcutCapture", () => ({
  useShortcutCapture: () => ({
    resetCaptureState: mocks.resetCaptureState,
  }),
}));
vi.mock("../../../license/queries", () => ({
  useLicenseGate: () => true,
  useLicenseState: () => ({
    data: { status: "active", licenseGateActive: true },
    isLoading: false,
  }),
}));

const settings: StoredSettings = {
  onboarding_completed: true,
  smart_shortcut: "Fn",
  smart_enabled: true,
  hold_shortcut: "Control+Shift+Space",
  hold_enabled: false,
  toggle_shortcut: "Control+Alt+Space",
  toggle_enabled: false,
  shortcut_bindings: {
    smart: [{ shortcut: "Fn", temporary: false, cleanup_enabled: false }],
    hold: [],
    toggle: [],
  },
  transcription_mode: "local",
  local_model: "parakeet-v3",
  remote_speech_enabled: false,
  remote_speech_provider: "openai",
  remote_speech_endpoint: "https://api.openai.com/v1",
  remote_speech_api_key: "",
  remote_speech_model: "auto",
  microphone_device: null,
  language: "en",
  app_locale: "system",
  theme_mode: "system",
  llm_enabled: true,
  cleanup_enabled: false,
  llm_provider: "openrouter",
  llm_endpoint: "https://openrouter.ai/api/v1",
  llm_api_key: "old-key",
  llm_model: "openai/gpt-5.4-mini",
  meeting_ai_provider: "writing",
  local_llm_model: "qwen3.5:4b-q3_k_m",
  dictionary: [],
  auto_dictionary_enabled: false,
  auto_dictionary_ignored: [],
  replacements: [],
  user_snippets: [],
  personalities: [],
  mode_rules: [],
  edit_mode_enabled: false,
  preview_before_insert_enabled: false,
  preview_before_insert_selection_enabled: true,
  use_screen_context: false,
  media_action: "off",
  auto_update_enabled: false,
  auto_launch_enabled: false,
  start_in_background: false,
  calendar_meeting_awareness_enabled: false,
  microphone_meeting_awareness_enabled: true,
  meeting_system_audio_enabled: true,
  meeting_live_transcript_enabled: true,
  auto_delete_target: "transcripts",
  auto_delete_duration: "never",
  audio_storage_budget_mb: 0,
  hide_overlays_from_capture: false,
  markdown_mirror_enabled: false,
  markdown_mirror_path: "",
  analytics_enabled: true,
  analytics_install_id: "test-install",
};

vi.mock("../queries", () => ({
  useSettings: () => ({ data: settings, isLoading: false, error: null }),
  useAppInfo: () => ({ data: null, isLoading: false }),
  useInputDevices: () => ({ data: [], isLoading: false }),
}));
vi.mock("../../models/models-queries", () => ({
  modelKeys: { status: (model: string) => ["models", "status", model] },
  useModelCatalog: () => ({ data: [], isLoading: false }),
  useModelStatuses: () => ({ statusByModel: {} }),
  useCliInstallStatus: () => ({ data: null, error: null }),
  useInstallCli: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useRemoveCli: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
  useFetchLlmModels: () => ({ mutateAsync: mocks.mutateAsync }),
  useFetchRemoteSpeechModels: () => ({ mutateAsync: mocks.mutateAsync }),
}));

afterEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(undefined);
  mocks.emit.mockReset();
  mocks.mutateAsync.mockReset();
  mocks.resetCaptureState.mockReset();
});

describe("useSettingsForm", () => {
  test("keeps the OpenRouter default model when the API key changes", async () => {
    const { useSettingsForm } = await import("../useSettingsForm");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useSettingsForm({
          isOpen: true,
          onClose: vi.fn(),
          initialTab: "providers",
          transcriptionMode: "local",
        }),
      { wrapper },
    );

    // Testing Library's implicit waitFor budget is 1_000ms, which the full
    // monorepo run exceeds whenever typecheck and test compete for CPU: this
    // waits on the initial settings query resolving through React Query, not on
    // anything time-sensitive, so the budget was measuring the machine.
    await waitFor(
      () =>
        expect(result.current.tabs.providers.writing.model).toBe(
          "openai/gpt-5.4-mini",
        ),
      { timeout: 5_000 },
    );
    mocks.invoke.mockClear();

    act(() => result.current.tabs.providers.writing.setApiKey("new-key"));

    expect(result.current.tabs.providers.writing.model).toBe(
      "openai/gpt-5.4-mini",
    );
    await waitFor(
      () =>
        expect(mocks.invoke).toHaveBeenCalledWith("update_settings", {
          args: expect.objectContaining({
            llmEnabled: true,
            llmProvider: "openrouter",
            llmApiKey: "new-key",
            llmModel: "openai/gpt-5.4-mini",
          }),
        }),
      // Autosave debounces for 500ms (useSettingsPersistence). The old 1_500ms
      // budget left only a second of headroom, which the full monorepo run ate
      // whenever typecheck and test competed for CPU — the assertion was timing
      // the machine, not the behaviour. The happy path still resolves in ~500ms,
      // so the wider budget costs nothing and only removes the flake.
      { timeout: 5_000 },
    );
  });
});
