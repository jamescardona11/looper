// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  showError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: mocks.save }));
vi.mock("../../../../data/library", () => ({
  showLibraryErrorToast: mocks.showError,
}));

import { useLibraryExport } from "../useLibraryExport";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

beforeEach(() => {
  mocks.save.mockReset();
  mocks.showError.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("library export hook", () => {
  test("saves to the selected path with the requested extension", async () => {
    mocks.save.mockResolvedValue("/tmp/Weekly Notes");
    const onExport = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn();
    const { result } = renderHook(
      () =>
        useLibraryExport({
          itemName: "Weekly Notes",
          onExport,
          onComplete,
        }),
      { wrapper },
    );

    await act(() => result.current.handleExport("vtt"));

    expect(mocks.save).toHaveBeenCalledWith({
      title: "Export transcription",
      defaultPath: "Weekly Notes.vtt",
      filters: [{ name: "VTT", extensions: ["vtt"] }],
    });
    expect(onExport).toHaveBeenCalledWith("vtt", "/tmp/Weekly Notes.vtt");
    expect(onComplete).toHaveBeenCalledOnce();
    expect(result.current.isExporting).toBe(false);
  });

  test("completes a cancelled dialog without invoking the exporter", async () => {
    mocks.save.mockResolvedValue(null);
    const onExport = vi.fn();
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useLibraryExport({ itemName: "Draft", onExport, onComplete }),
      { wrapper },
    );

    await act(() => result.current.handleExport("txt"));

    expect(onExport).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(result.current.isExporting).toBe(false);
  });

  test("maps timestamp failures and always closes the export flow", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.save.mockResolvedValue("/tmp/captions.srt");
    const onExport = vi
      .fn()
      .mockRejectedValue(new Error("No timestamp segments available"));
    const onComplete = vi.fn();
    const { result } = renderHook(
      () => useLibraryExport({ itemName: "Captions", onExport, onComplete }),
      { wrapper },
    );

    await act(() => result.current.handleExport("srt"));

    expect(mocks.showError).toHaveBeenCalledWith(
      "This item doesn't have timestamps. Retranscribe with timestamps to export subtitles.",
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(result.current.isExporting).toBe(false);
  });
});
