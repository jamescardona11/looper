import { describe, expect, it, vi } from "vitest";
import type { ModelInfo, ModelStatus, StoredSettings } from "../../types";
import type { ModelDownloadActivity } from "../settings/modelDownloadActivity";
import {
  buildCompletedOnboardingSettings,
  buildModelDisplayStates,
  licenseActivationError,
  missingCheckoutMessage,
  modelDownloadRequest,
  permissionPresentation,
  permissionQueryOptions,
  resolveOnboardingModels,
  selectedModelIsReady,
} from "./onboarding-screen-policy";

const model = (key: string, overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  key,
  label: key,
  description: "",
  size_mb: 100,
  engine_id: "parakeet",
  variant: "int8",
  tags: [],
  capabilities: [],
  supported_languages: [],
  family: "speech",
  category: "speech",
  downloadable: true,
  language_selection_mode: "auto_detect",
  ane_size_mb: null,
  ...overrides,
});

const status = (key: string, installed: boolean): ModelStatus => ({
  key,
  installed,
  ane_installed: false,
  bytes_on_disk: 0,
  missing_files: [],
  directory: "",
});

const activity = (
  modelKey: string,
  state: ModelDownloadActivity["status"],
): ModelDownloadActivity => ({
  model: modelKey,
  label: modelKey,
  downloadedBytes: 20,
  totalBytes: 100,
  percent: 20,
  status: state,
  ane: false,
  updatedAt: 1,
});

describe("onboarding-screen-policy", () => {
  it("projects imported, preferred, and selected models without losing status keys", () => {
    const catalog = [
      model("parakeet_tdt_int8"),
      model("cohere_transcribe_int4"),
      model("imported-model", { tags: ["recommended"] }),
    ];
    const projection = resolveOnboardingModels(
      catalog,
      "imported-model",
      "cohere_transcribe_int4",
    );

    expect(projection.onboardingModels.map(({ key }) => key)).toEqual([
      "parakeet_tdt_int8",
      "cohere_transcribe_int4",
      "imported-model",
    ]);
    expect(projection.selectedKey).toBe("imported-model");
    expect(projection.selectedInfo).toBe(catalog[2]);
    expect(projection.statusKeys).toEqual([
      "parakeet_tdt_int8",
      "cohere_transcribe_int4",
      "imported-model",
    ]);
  });

  it("combines durable installation and transient download activity", () => {
    const catalog = [model("installed"), model("fetching"), model("idle")];
    const statuses = { installed: status("installed", true) };
    const activities = { fetching: activity("fetching", "downloading") };
    const display = buildModelDisplayStates(catalog, statuses, activities);

    expect(display.installed).toEqual({ status: "complete", percent: 100 });
    expect(display.fetching).toMatchObject({
      status: "downloading",
      percent: 20,
    });
    expect(display.idle).toEqual({ status: "idle", percent: 0 });
    expect(selectedModelIsReady("installed", statuses, display)).toBe(true);
    expect(selectedModelIsReady("fetching", statuses, display)).toBe(false);
  });

  it("builds download byte totals with an explicit or inferred ANE choice", () => {
    const catalog = [model("ane", { size_mb: 120.5, ane_size_mb: 20.25 })];
    expect(modelDownloadRequest(catalog, "ane")).toEqual({
      model: "ane",
      label: "ane",
      totalBytes: 140_750_000,
      ane: true,
    });
    expect(modelDownloadRequest(catalog, "ane", false).totalBytes).toBe(
      120_500_000,
    );
  });

  it("keeps polling only while a required permission is unresolved", () => {
    const queryFn = vi.fn(async () => false);
    const visible = permissionQueryOptions(["permission"], queryFn, true, true);
    expect(visible.enabled).toBe(true);
    expect(visible.refetchOnWindowFocus).toBe("always");
    expect(visible.refetchInterval({ state: { data: false } })).toBe(2_000);
    expect(visible.refetchInterval({ state: { data: true } })).toBe(false);

    const hidden = permissionQueryOptions(
      ["permission"],
      queryFn,
      false,
      false,
    );
    expect(hidden.enabled).toBe(false);
    expect(hidden.refetchInterval({ state: { data: false } })).toBe(false);
    expect(permissionPresentation(false, undefined, true, true)).toEqual({
      granted: true,
      checking: false,
    });
  });

  it("preserves onboarding persistence defaults and locale selection", () => {
    const latest = {
      app_locale: "system",
      language: "auto",
      remote_speech_provider: "custom",
      auto_launch_enabled: false,
      analytics_enabled: false,
    } as StoredSettings;
    const cohere = model("cohere", {
      engine_id: "cohere",
      supported_languages: [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
      ],
    });
    const result = buildCompletedOnboardingSettings({
      latest,
      smartShortcut: "Alt+Space",
      transcriptionMode: "local",
      localModel: "cohere",
      localModelInfo: cohere,
      autoLaunchEnabled: true,
      systemLanguage: "es-CO",
      meetingAiProvider: "local",
    });

    expect(result).toMatchObject({
      smartShortcut: "Alt+Space",
      smartEnabled: true,
      transcriptionMode: "local",
      localModel: "cohere",
      language: "es",
      appLocale: "system",
      meetingAiProvider: "local",
      autoLaunchEnabled: true,
      analyticsEnabled: false,
    });
    expect(result.shortcutBindings.smart[0]?.shortcut).toBe("Alt+Space");
  });

  it("normalizes checkout and activation failures", () => {
    expect(missingCheckoutMessage("commercial")).toContain("Commercial");
    expect(missingCheckoutMessage("personal")).toContain("Personal");
    expect(licenseActivationError(new Error("invalid key"))).toBe(
      "invalid key",
    );
    expect(licenseActivationError("offline")).toBe("offline");
    expect(licenseActivationError(null)).toBeNull();
  });
});
