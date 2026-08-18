// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SpeechModel, YoutubeImportMetadata } from "../../../types";
import { SUPPORTED_EXTENSIONS } from "./library-utils";
import LibraryImportModal from "./LibraryImportModal";
import LibraryYoutubeImportModal from "./LibraryYoutubeImportModal";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  probeFiles: vi.fn(),
  probeYoutube: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("../../../data/library", () => ({
  probeLibraryImportFiles: mocks.probeFiles,
  probeLibraryYoutubeUrl: mocks.probeYoutube,
}));

const copy = {
  fileTitle: "ID_FILE_TITLE",
  youtubeTitle: "ID_YOUTUBE_TITLE",
  youtubeDescription: "ID_YOUTUBE_DESCRIPTION",
  close: "ID_SHARED_CLOSE",
  noModels: "ID_NO_MODELS",
  fileSummary: "ID_MULTIPLE_FILES",
  fileFilter: "ID_FILE_FILTER",
  model: "ID_MODEL_LABEL",
  selectModel: "ID_SELECT_MODEL",
  searchModels: "ID_SEARCH_MODELS",
  remoteProvider: "ID_REMOTE_PROVIDER",
  store: "ID_STORE_TITLE",
  storeFileDescription: "ID_STORE_FILE_DESCRIPTION",
  storeYoutubeDescription: "ID_STORE_YOUTUBE_DESCRIPTION",
  storeAria: "ID_STORE_ARIA",
  denoise: "ID_DENOISE_TITLE",
  denoiseDescription: "ID_DENOISE_DESCRIPTION",
  denoiseAria: "ID_DENOISE_ARIA",
  showTimestamps: "ID_SHOW_TIMESTAMPS",
  showTimestampsAria: "ID_SHOW_TIMESTAMPS_ARIA",
  timestamps: "ID_INCLUDE_TIMESTAMPS",
  timestampsAria: "ID_INCLUDE_TIMESTAMPS_ARIA",
  timestampsSupported: "ID_TIMESTAMPS_SUPPORTED",
  timestampsUnsupported: "ID_TIMESTAMPS_UNSUPPORTED",
  speakers: "ID_DETECT_SPEAKERS",
  speakersDescription: "ID_DETECT_SPEAKERS_DESCRIPTION",
  speakersAria: "ID_DETECT_SPEAKERS_ARIA",
  noFiles: "ID_NO_FILES",
  removeFile: "ID_REMOVE_FILE",
  addFiles: "ID_ADD_FILES",
  fileCancel: "ID_FILE_CANCEL",
  commonCancel: "ID_COMMON_CANCEL",
  importing: "ID_IMPORTING",
  confirmFile: "ID_CONFIRM_FILE",
  youtubeUrl: "ID_YOUTUBE_URL",
  youtubeReview: "ID_YOUTUBE_REVIEW",
  youtubeImport: "ID_YOUTUBE_IMPORT",
} as const;

const translations = {
  "library.import.title": copy.fileTitle,
  "library.youtube.title": copy.youtubeTitle,
  "library.youtube.description": copy.youtubeDescription,
  "library.import.close": copy.close,
  "library.import.no_models": copy.noModels,
  "library.import.summary.multiple": copy.fileSummary,
  "library.view.file_filter": copy.fileFilter,
  "library.import.model": copy.model,
  "library.import.select_model": copy.selectModel,
  "library.import.search_models": copy.searchModels,
  "library.import.remote_provider": copy.remoteProvider,
  "library.import.store_original": copy.store,
  "library.import.store_original.description": copy.storeFileDescription,
  "library.youtube.store_description": copy.storeYoutubeDescription,
  "library.import.store_original.aria": copy.storeAria,
  "library.import.denoise": copy.denoise,
  "library.import.denoise.description": copy.denoiseDescription,
  "library.import.denoise.aria": copy.denoiseAria,
  "library.import.show_timestamps": copy.showTimestamps,
  "library.import.show_timestamps.aria": copy.showTimestampsAria,
  "library.import.timestamps": copy.timestamps,
  "library.import.timestamps.aria": copy.timestampsAria,
  "library.import.timestamps_supported": copy.timestampsSupported,
  "library.import.timestamps_unsupported": copy.timestampsUnsupported,
  "library.import.detect_speakers": copy.speakers,
  "library.import.detect_speakers.description": copy.speakersDescription,
  "library.import.detect_speakers.aria": copy.speakersAria,
  "library.import.no_files": copy.noFiles,
  "library.import.remove_file": copy.removeFile,
  "library.import.add_files": copy.addFiles,
  "library.import.cancel": copy.fileCancel,
  "common.cancel": copy.commonCancel,
  "library.import.importing": copy.importing,
  "library.import.confirm": copy.confirmFile,
  "library.youtube.url": copy.youtubeUrl,
  "library.youtube.review": copy.youtubeReview,
  "library.youtube.import": copy.youtubeImport,
};

const model = (
  id: string,
  capabilities: string[] = ["timestamps", "diarization"],
  remote = false,
): SpeechModel => ({
  id,
  key: id,
  label: id,
  description: `${id} description`,
  size_mb: 100,
  engine_id: id,
  variant: "default",
  tags: [],
  capabilities,
  supported_languages: [],
  remote,
  installed: true,
});

const renderWithProviders = (node: React.ReactNode) => {
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: "test", messages: translations });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </I18nProvider>,
  );
};

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  mocks.open.mockReset();
  mocks.probeFiles.mockReset();
  mocks.probeYoutube.mockReset();
  mocks.probeFiles.mockImplementation(async (paths: string[]) =>
    paths.map((path) => ({
      path,
      duration_ms: path.includes("one") ? 65_000 : 125_000,
      size_bytes: path.includes("one") ? 1_024 : 2_048,
    })),
  );
});

afterEach(cleanup);

describe("LibraryImportModal", () => {
  test("conserva los IDs distintivos, la estructura y el aviso sin modelos", () => {
    const onCancel = vi.fn();
    const { container } = renderWithProviders(
      <LibraryImportModal
        paths={["/recordings/one.wav", "/recordings/two.mp3"]}
        models={[]}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toBe(
      "fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs",
    );
    expect(dialog.firstElementChild?.className).toBe(
      "relative w-[440px] max-w-[92vw] rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
    );
    expect(screen.getByText(copy.fileTitle)).toBeTruthy();
    expect(screen.getByText(copy.fileSummary)).toBeTruthy();
    expect(screen.getByText(copy.noModels)).toBeTruthy();
    expect(screen.getByText(copy.model)).toBeTruthy();
    expect(screen.getByText(copy.storeFileDescription)).toBeTruthy();
    expect(screen.getByText(copy.timestampsUnsupported)).toBeTruthy();
    expect(screen.getByText(copy.fileCancel)).toBeTruthy();
    expect(screen.queryByText(copy.commonCancel)).toBeNull();
    expect(
      container.querySelectorAll("[aria-hidden='true']").length,
    ).toBeGreaterThan(0);

    fireEvent.click(dialog.firstElementChild as HTMLElement);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("sondea, agrega sin duplicar, mantiene opciones y confirma el mismo contrato", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    mocks.open.mockResolvedValue([
      "/recordings/two.mp3",
      "/recordings/one.wav",
    ]);
    renderWithProviders(
      <LibraryImportModal
        paths={["/recordings/one.wav"]}
        models={[model("Parakeet")]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await waitFor(() => expect(mocks.probeFiles).toHaveBeenCalledTimes(1));
    expect(mocks.probeFiles).toHaveBeenLastCalledWith(["/recordings/one.wav"]);
    expect(await screen.findByText("one.wav · 1:05 · 1 KB")).toBeTruthy();
    expect(screen.getByText(copy.timestampsSupported)).toBeTruthy();
    expect(screen.getByText(copy.speakersDescription)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: copy.addFiles }));
    await waitFor(() => expect(mocks.probeFiles).toHaveBeenCalledTimes(2));
    expect(mocks.probeFiles).toHaveBeenLastCalledWith(["/recordings/two.mp3"]);
    expect(mocks.open).toHaveBeenCalledWith({
      multiple: true,
      filters: [{ name: copy.fileFilter, extensions: SUPPORTED_EXTENSIONS }],
    });
    expect(screen.getAllByText("one.wav")).toHaveLength(1);
    expect(await screen.findByText("2:05 · 2 KB")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: copy.storeAria }));
    fireEvent.click(screen.getByRole("switch", { name: copy.denoiseAria }));
    fireEvent.click(
      screen.getByRole("switch", { name: copy.showTimestampsAria }),
    );
    fireEvent.click(screen.getByRole("switch", { name: copy.speakersAria }));
    fireEvent.click(screen.getByRole("button", { name: copy.confirmFile }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(
      ["/recordings/one.wav", "/recordings/two.mp3"],
      {
        store_original: false,
        model_key: "Parakeet",
        llm_cleanup_enabled: false,
        denoise_enabled: true,
        show_timestamps: false,
        detect_speakers: true,
      },
    );
  });

  test("expone los IDs de búsqueda/proveedor y el progreso de confirmación", async () => {
    const pending = deferred<void>();
    renderWithProviders(
      <LibraryImportModal
        paths={["/recordings/one.wav"]}
        models={[model("Cloud", ["diarization"], true)]}
        onCancel={vi.fn()}
        onConfirm={() => pending.promise}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cloud" }));
    expect(screen.getByText(copy.remoteProvider)).toBeTruthy();
    expect(screen.getByPlaceholderText(copy.searchModels)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.confirmFile }));
    expect(await screen.findByText(copy.importing)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: copy.importing,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => pending.resolve());
    expect(screen.getByRole("button", { name: copy.confirmFile })).toBeTruthy();
  });

  test("limpia opciones no soportadas al cambiar el modelo y no las restaura", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <LibraryImportModal
        paths={["/recordings/one.wav"]}
        models={[model("Parakeet"), model("Basic", [])]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: copy.speakersAria }));
    fireEvent.click(screen.getByRole("button", { name: "Parakeet" }));
    fireEvent.click(screen.getByRole("option", { name: /Basic/ }));
    const unsupportedTimestamps = screen.getByRole("switch", {
      name: copy.showTimestampsAria,
    }) as HTMLButtonElement;
    expect(unsupportedTimestamps.disabled).toBe(true);
    expect(unsupportedTimestamps.getAttribute("aria-checked")).toBe("false");
    expect(
      screen.queryByRole("switch", { name: copy.speakersAria }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Basic" }));
    fireEvent.click(screen.getByRole("option", { name: /Parakeet/ }));
    expect(
      screen
        .getByRole("switch", { name: copy.showTimestampsAria })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: copy.speakersAria })
        .getAttribute("aria-checked"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: copy.confirmFile }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][1]).toMatchObject({
      show_timestamps: false,
      detect_speakers: false,
    });
  });
});

describe("LibraryYoutubeImportModal", () => {
  const metadata: YoutubeImportMetadata = {
    url: "https://youtu.be/abc",
    video_id: "abc",
    title: "Distinct video title",
    channel: "Distinct channel",
    duration_seconds: 65,
  };

  test("usa los IDs de YouTube y el cancel común antes de sondear", () => {
    renderWithProviders(
      <LibraryYoutubeImportModal
        models={[model("Parakeet")]}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(copy.youtubeTitle)).toBeTruthy();
    expect(screen.getByText(copy.youtubeDescription)).toBeTruthy();
    expect(screen.getByLabelText(copy.youtubeUrl)).toBeTruthy();
    expect(screen.getByText(copy.youtubeReview)).toBeTruthy();
    expect(screen.getByText(copy.commonCancel)).toBeTruthy();
    expect(screen.queryByText(copy.fileCancel)).toBeNull();
    expect(screen.queryByText(copy.model)).toBeNull();
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe(
      "youtube-import-title",
    );
  });

  test("sondea la URL sin modificarla y conserva opciones, metadata y espera", async () => {
    const pending = deferred<void>();
    const onConfirm = vi.fn(() => pending.promise);
    mocks.probeYoutube.mockResolvedValue(metadata);
    renderWithProviders(
      <LibraryYoutubeImportModal
        models={[model("Parakeet")]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const input = screen.getByLabelText(copy.youtubeUrl);
    fireEvent.change(input, { target: { value: " https://youtu.be/abc " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.probeYoutube).toHaveBeenCalledWith("https://youtu.be/abc");
    expect(await screen.findByText(metadata.title)).toBeTruthy();
    expect(screen.getByText("Distinct channel · 1:05")).toBeTruthy();
    expect(screen.getByText(copy.model)).toBeTruthy();
    expect(screen.getByText(copy.storeYoutubeDescription)).toBeTruthy();
    expect(screen.getByText(copy.timestamps)).toBeTruthy();
    expect(screen.getByText(copy.speakers)).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: copy.storeAria }));
    fireEvent.click(screen.getByRole("switch", { name: copy.denoiseAria }));
    fireEvent.click(screen.getByRole("switch", { name: copy.timestampsAria }));
    fireEvent.click(screen.getByRole("switch", { name: copy.speakersAria }));
    fireEvent.click(screen.getByRole("button", { name: copy.youtubeImport }));

    expect(onConfirm).toHaveBeenCalledWith(metadata, {
      store_original: false,
      model_key: "Parakeet",
      llm_cleanup_enabled: false,
      denoise_enabled: true,
      show_timestamps: false,
      detect_speakers: true,
    });
    expect(
      (
        screen.getByRole("button", {
          name: copy.youtubeImport,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => pending.resolve());
    expect(
      (
        screen.getByRole("button", {
          name: copy.youtubeImport,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("oculta capacidades ausentes, limita opciones y recupera un fallo", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Import failed"));
    mocks.probeYoutube.mockResolvedValue(metadata);
    renderWithProviders(
      <LibraryYoutubeImportModal
        models={[model("Basic", [])]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(copy.youtubeUrl), {
      target: { value: metadata.url },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.youtubeReview }));
    await screen.findByText(metadata.title);
    expect(screen.queryByText(copy.timestamps)).toBeNull();
    expect(screen.queryByText(copy.speakers)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: copy.youtubeImport }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Import failed",
    );
    expect(onConfirm).toHaveBeenCalledWith(metadata, {
      store_original: true,
      model_key: "Basic",
      llm_cleanup_enabled: false,
      denoise_enabled: false,
      show_timestamps: false,
      detect_speakers: false,
    });
    expect(
      (
        screen.getByRole("button", {
          name: copy.youtubeImport,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
