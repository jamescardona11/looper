// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ModelDownloadActivityBar from "../components/ModelDownloadActivityBar";
import {
  ModelDownloadActivityProvider,
  useModelDownloadActivity,
} from "../modelDownloadActivity";
import type { DownloadProgressPayload } from "../../../types";

type DownloadHandlers = {
  onProgress?: (payload: DownloadProgressPayload) => void;
  onComplete?: (payload: { model: string }) => void;
  onError?: (payload: { model: string; error: string }) => void;
  onCancelled?: (payload: { model: string }) => void;
};

let downloadHandlers: DownloadHandlers = {};
const downloadModel = vi.fn(async (_model: string, _ane?: boolean) => ({
  installed: false,
}));
const cancelDownload = vi.fn(async (_model: string) => undefined);

vi.mock("../../../shared/hooks/useModelDownloadEvents", () => ({
  useModelDownloadEvents: (handlers: DownloadHandlers) => {
    downloadHandlers = handlers;
  },
}));

vi.mock("../../../data/transcription", () => ({
  downloadModel: (model: string, ane?: boolean) => downloadModel(model, ane),
  cancelDownload: (model: string) => cancelDownload(model),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function StartDownloadButton() {
  const { startDownload } = useModelDownloadActivity();
  return (
    <button
      type="button"
      onClick={() =>
        void startDownload({
          model: "cohere_transcribe_int4",
          label: "Cohere Transcribe",
          totalBytes: 2_000_000_000,
        })
      }
    >
      Start Cohere
    </button>
  );
}

function NavigationHarness() {
  const [page, setPage] = useState<"onboarding" | "home">("onboarding");
  return (
    <>
      {page === "onboarding" ? <StartDownloadButton /> : <p>Home</p>}
      <button type="button" onClick={() => setPage("home")}>
        Finish onboarding
      </button>
      <ModelDownloadActivityBar />
    </>
  );
}

const renderActivity = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <ModelDownloadActivityProvider>
          <StartDownloadButton />
          <ModelDownloadActivityBar />
        </ModelDownloadActivityProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  downloadHandlers = {};
  downloadModel.mockClear();
  cancelDownload.mockClear();
});

afterEach(cleanup);

describe("model download activity", () => {
  test("survives the transition from onboarding to Home", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider i18n={i18n}>
          <ModelDownloadActivityProvider>
            <NavigationHarness />
          </ModelDownloadActivityProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Cohere" }));
    expect(await screen.findByText("Cohere Transcribe")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finish onboarding" }));

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Cohere Transcribe")).toBeTruthy();
  });

  test("shows total size and cumulative progress while navigation remains available", async () => {
    renderActivity();
    fireEvent.click(screen.getByRole("button", { name: "Start Cohere" }));

    expect(await screen.findByText("Cohere Transcribe")).toBeTruthy();
    expect(screen.getByText("0 KB / 2.0 GB")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();

    act(() => {
      downloadHandlers.onProgress?.({
        model: "cohere_transcribe_int4",
        file: "cohere-encoder.int4.onnx.data",
        downloaded: 1_000_000_000,
        total: 2_000_000_000,
        percent: 50,
        verifying: false,
      });
    });

    expect(screen.getByText("1.0 GB / 2.0 GB")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Cancel Cohere Transcribe download",
      }),
    ).toBeTruthy();
  });

  test("supports cancel, retry and completion states", async () => {
    renderActivity();
    fireEvent.click(screen.getByRole("button", { name: "Start Cohere" }));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Cancel Cohere Transcribe download",
      }),
    );
    await waitFor(() =>
      expect(cancelDownload).toHaveBeenCalledWith("cohere_transcribe_int4"),
    );

    act(() => {
      downloadHandlers.onCancelled?.({ model: "cohere_transcribe_int4" });
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry Cohere Transcribe download",
      }),
    );
    await waitFor(() => expect(downloadModel).toHaveBeenCalledTimes(2));

    act(() => {
      downloadHandlers.onComplete?.({ model: "cohere_transcribe_int4" });
    });
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss Cohere Transcribe download",
      }),
    );
    expect(screen.queryByText("Cohere Transcribe")).toBeNull();
  });
});
