// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  LibraryImportOptions,
  LibraryItem,
  MeetingStartOptions,
  SpeechModel,
  YoutubeImportMetadata,
} from "../../../types";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import LibraryView from "./LibraryView";

const mocks = vi.hoisted(() => ({
  useLibraryItems: vi.fn(),
  useLibraryTags: vi.fn(),
  useSpeechModels: vi.fn(),
  useSettings: vi.fn(),
  useMeetingCapture: vi.fn(),
  createFile: vi.fn(),
  createYoutube: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  cancelItem: vi.fn(),
  retryItem: vi.fn(),
  exportItem: vi.fn(),
  startMeeting: vi.fn(),
  resetMeeting: vi.fn(),
  fetchNextPage: vi.fn(),
  openDialog: vi.fn(),
  showToast: vi.fn(),
  modelDownloadEvents: vi.fn(),
  shiftHeld: false,
  meetingPending: false,
  meetingError: null as unknown,
}));

vi.mock("../queries", () => ({
  libraryKeys: { tags: () => ["library", "tags"] },
  useLibraryItems: (...args: unknown[]) => mocks.useLibraryItems(...args),
  useLibraryTags: (...args: unknown[]) => mocks.useLibraryTags(...args),
  useCreateLibraryItem: () => ({ mutateAsync: mocks.createFile }),
  useCreateLibraryYoutubeItem: () => ({ mutateAsync: mocks.createYoutube }),
  useUpdateLibraryItem: () => ({ mutateAsync: mocks.updateItem }),
  useDeleteLibraryItem: () => ({ mutateAsync: mocks.deleteItem }),
  useCancelLibraryTranscription: () => ({ mutateAsync: mocks.cancelItem }),
  useRetryLibraryTranscription: () => ({ mutateAsync: mocks.retryItem }),
  useExportLibraryItem: () => ({ mutateAsync: mocks.exportItem }),
  useMeetingCapture: (...args: unknown[]) => mocks.useMeetingCapture(...args),
  useStartMeetingCapture: () => ({
    mutateAsync: mocks.startMeeting,
    reset: mocks.resetMeeting,
    isPending: mocks.meetingPending,
    error: mocks.meetingError,
  }),
}));

vi.mock("../../settings/models-queries", () => ({
  modelKeys: { speech: () => ["models", "speech"] },
  useSpeechModels: (...args: unknown[]) => mocks.useSpeechModels(...args),
}));
vi.mock("../../settings/queries", () => ({
  useSettings: (...args: unknown[]) => mocks.useSettings(...args),
}));
vi.mock("../../../shared/hooks/useDebouncedValue", () => ({
  useDebouncedValue: (value: unknown) => value,
}));
vi.mock("../../../shared/hooks/useShiftHeld", () => ({
  useShiftHeld: () => mocks.shiftHeld,
}));
vi.mock("../../../shared/hooks/useModelDownloadEvents", () => ({
  useModelDownloadEvents: (...args: unknown[]) =>
    mocks.modelDownloadEvents(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mocks.openDialog(...args),
}));
vi.mock("../../../data/library", () => ({
  showLibraryToast: (...args: unknown[]) => mocks.showToast(...args),
  openSystemAudioSettings: vi.fn(async () => undefined),
  openMicrophoneSettings: vi.fn(async () => undefined),
}));

vi.mock("./LibraryCard", () => ({
  default: (props: {
    item: LibraryItem;
    onOpen: () => void;
    onRemoveTag: (tag: string) => void;
    onClickTag?: (tag: string) => void;
    editingNameId: string | null;
    editingNameDraft: string;
    onStartNameEdit: () => void;
    onChangeNameDraft: (value: string) => void;
    onCommitNameEdit: () => void;
    onRetry: () => void;
    onCancel: () => void;
    onDelete: () => void;
    editingTagId: string | null;
    tagDraft: string;
    onStartTagEdit: () => void;
    onChangeTagDraft: (value: string) => void;
    onCommitTagAdd: (value?: string) => void;
  }) => (
    <div data-testid={`card-${props.item.id}`}>
      <button onClick={props.onOpen}>Open {props.item.name}</button>
      <button onClick={props.onStartNameEdit}>Rename {props.item.id}</button>
      {props.editingNameId === props.item.id ? (
        <>
          <input
            aria-label="NAME-DRAFT-UNIQUE"
            value={props.editingNameDraft}
            onChange={(event) => props.onChangeNameDraft(event.target.value)}
          />
          <button onClick={props.onCommitNameEdit}>Save name</button>
        </>
      ) : null}
      <button onClick={props.onStartTagEdit}>Tag {props.item.id}</button>
      {props.editingTagId === props.item.id ? (
        <>
          <input
            aria-label="TAG-DRAFT-UNIQUE"
            value={props.tagDraft}
            onChange={(event) => props.onChangeTagDraft(event.target.value)}
          />
          <button onClick={() => props.onCommitTagAdd()}>Save tag</button>
        </>
      ) : null}
      <button onClick={() => props.onClickTag?.("work")}>Find work tag</button>
      <button onClick={() => props.onRemoveTag("work")}>Remove work tag</button>
      <button onClick={props.onRetry}>Retry {props.item.id}</button>
      <button onClick={props.onCancel}>Cancel {props.item.id}</button>
      <button onClick={props.onDelete}>Delete {props.item.id}</button>
    </div>
  ),
}));

vi.mock("./LibraryDetail", () => ({
  default: (props: {
    item: LibraryItem;
    onClose: () => void;
    onDelete: () => void;
    onRetry: () => void;
    onCancel: () => void;
    onUpdate: (patch: { name: string }) => void;
    onExport: (format: "txt", outputPath: string) => void;
  }) => (
    <div data-testid="library-detail">
      DETAIL-{props.item.name}
      <button onClick={props.onClose}>Close detail</button>
      <button onClick={props.onDelete}>Delete detail</button>
      <button onClick={props.onRetry}>Retry detail</button>
      <button onClick={props.onCancel}>Cancel detail</button>
      <button onClick={() => props.onUpdate({ name: "From detail" })}>
        Update detail
      </button>
      <button onClick={() => props.onExport("txt", "/tmp/item.txt")}>
        Export detail
      </button>
    </div>
  ),
}));

vi.mock("./LibraryImportModal", () => ({
  default: (props: {
    paths: string[];
    onCancel: () => void;
    onConfirm: (paths: string[], options: LibraryImportOptions) => void;
  }) => (
    <div data-testid="file-import-modal">
      <button onClick={props.onCancel}>Cancel file import</button>
      <button
        onClick={() =>
          props.onConfirm(props.paths, {
            model_key: "remote",
            store_original: true,
            llm_cleanup_enabled: false,
            denoise_enabled: false,
            show_timestamps: true,
            detect_speakers: false,
          })
        }
      >
        Confirm file import
      </button>
    </div>
  ),
}));

vi.mock("./LibraryYoutubeImportModal", () => ({
  default: (props: {
    onCancel: () => void;
    onConfirm: (
      metadata: YoutubeImportMetadata,
      options: LibraryImportOptions,
    ) => void;
  }) => (
    <div data-testid="youtube-import-modal">
      <button onClick={props.onCancel}>Cancel YouTube</button>
      <button
        onClick={() =>
          props.onConfirm(
            {
              url: "https://youtube.test/watch?v=1",
              video_id: "1",
              title: "Video",
              channel: null,
              duration_seconds: 20,
            },
            {
              model_key: "remote",
              store_original: true,
              llm_cleanup_enabled: false,
              denoise_enabled: false,
              show_timestamps: true,
              detect_speakers: false,
            },
          )
        }
      >
        Confirm YouTube
      </button>
    </div>
  ),
}));

vi.mock("./MeetingStartModal", () => ({
  default: (props: {
    onCancel: () => void;
    onConfirm: (options: MeetingStartOptions) => void;
  }) => (
    <div data-testid="meeting-modal">
      <button onClick={props.onCancel}>Cancel meeting</button>
      <button
        onClick={() =>
          props.onConfirm({
            model_key: "configured",
            system_audio_enabled: true,
          })
        }
      >
        Confirm meeting
      </button>
    </div>
  ),
}));

const i18n = setupI18n();
i18n.loadAndActivate({
  locale: "contract",
  messages: {
    "library.view.title": "LIBRARY-TITLE-UNIQUE",
    "library.view.description": "LIBRARY-DESCRIPTION-UNIQUE",
    "library.view.search_placeholder": "LIBRARY-SEARCH-UNIQUE",
    "library.filter.aria_label": "LIBRARY-FILTERS-UNIQUE",
    "library.filter.transcribing": "ACTIVE-FILTER-UNIQUE",
    "library.filter.ready": "READY-FILTER-UNIQUE",
    "library.filter.needs_attention": "ERROR-FILTER-UNIQUE",
    "library.group.this_week": "THIS-WEEK-UNIQUE",
    "library.group.earlier": "EARLIER-UNIQUE",
    "library.view.import_button": "IMPORT-FILE-UNIQUE",
    "library.youtube.add": "YOUTUBE-UNIQUE",
    "meeting.start.title": "MEETING-UNIQUE",
    "library.view.load_more": "LOAD-MORE-UNIQUE",
  },
});

const completeItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "item-1",
  name: "Weekly sync",
  created_at: new Date().toISOString(),
  tags: ["work", "team"],
  kind: "meeting",
  status: { type: "complete" },
  audio_path: "/audio/item.wav",
  source_path: "",
  original_format: "wav",
  store_original: true,
  duration_seconds: 12,
  file_size_bytes: 32,
  llm_cleanup_enabled: false,
  denoise_enabled: false,
  show_timestamps: true,
  detect_speakers: false,
  speech_model: "configured",
  ...overrides,
});

const speechModel = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "configured",
  key: "configured",
  label: "Configured",
  description: "Installed local model",
  engine_id: "nvidia",
  variant: "default",
  tags: [],
  capabilities: ["timestamps"],
  size_mb: 10,
  supported_languages: [],
  remote: false,
  installed: true,
  ...overrides,
});

const items = [
  completeItem(),
  completeItem({
    id: "item-2",
    name: "Old interview",
    created_at: "2000-01-01T00:00:00.000Z",
    tags: [],
  }),
];

function renderLibrary(
  props: Partial<ComponentProps<typeof LibraryView>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <LibraryView
          pendingImportPaths={null}
          onSetImportPaths={vi.fn()}
          isActive
          {...props}
        />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...render(element) };
}

beforeEach(() => {
  mocks.useLibraryItems.mockReturnValue({
    data: { pages: [{ items, has_more: true }] },
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    fetchNextPage: mocks.fetchNextPage,
    error: null,
  });
  mocks.useLibraryTags.mockReturnValue({ data: ["work", "team", "client"] });
  mocks.useSpeechModels.mockReturnValue({ data: [speechModel()] });
  mocks.useSettings.mockReturnValue({ data: "configured" });
  mocks.useMeetingCapture.mockReturnValue({
    data: {
      phase: "idle",
      elapsed_seconds: 0,
      system_audio_enabled: true,
      capture_intent: "meeting",
      live_transcript: "",
      capture_health: { status: "healthy", audio_lag_ms: 0 },
    },
  });
  mocks.meetingPending = false;
  mocks.meetingError = null;
  mocks.createFile.mockResolvedValue(completeItem({ id: "created" }));
  mocks.createYoutube.mockResolvedValue(completeItem({ id: "youtube" }));
  mocks.updateItem.mockImplementation(async ({ id, patch }) => ({
    ...items.find((entry) => entry.id === id),
    ...patch,
  }));
  mocks.deleteItem.mockResolvedValue(undefined);
  mocks.cancelItem.mockResolvedValue(undefined);
  mocks.retryItem.mockResolvedValue(undefined);
  mocks.exportItem.mockResolvedValue(undefined);
  mocks.startMeeting.mockResolvedValue({ phase: "recording" });
  mocks.openDialog.mockResolvedValue(null);
  mocks.showToast.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryView contract", () => {
  test("preserves translated toolbar, groups, filtering and pagination", async () => {
    mocks.useLibraryItems.mockReturnValue({
      data: { pages: [{ items, has_more: true }] },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: mocks.fetchNextPage,
      error: new Error("LIBRARY-QUERY-FAILURE-UNIQUE"),
    });
    const { container } = renderLibrary();

    expect(container.firstElementChild?.className).toBe(
      "relative flex h-full min-h-0 min-w-0 flex-1 flex-col",
    );
    expect(screen.getByText("LIBRARY-TITLE-UNIQUE")).toBeTruthy();
    expect(screen.getByText("LIBRARY-DESCRIPTION-UNIQUE")).toBeTruthy();
    expect(screen.getByText("THIS-WEEK-UNIQUE")).toBeTruthy();
    expect(screen.getByText("EARLIER-UNIQUE")).toBeTruthy();
    expect(
      screen.getByRole("alert").getAttribute("data-notification-position"),
    ).toBe("library-header");

    const search = screen.getByPlaceholderText("LIBRARY-SEARCH-UNIQUE");
    fireEvent.change(search, { target: { value: "quarterly" } });
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ search: "quarterly", status: null });
    });

    const active = screen.getByRole("button", { name: "ACTIVE-FILTER-UNIQUE" });
    fireEvent.click(active);
    expect(active.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ status: "active" });
    });
    fireEvent.click(
      screen.getByRole("button", { name: /ACTIVE-FILTER-UNIQUE/ }),
    );
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ status: null });
    });
    fireEvent.click(screen.getByRole("button", { name: "LOAD-MORE-UNIQUE" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  test("opens focused and clicked items and forwards detail callbacks", async () => {
    renderLibrary({ focusItem: { id: "item-2", query: "Old interview" } });

    expect(await screen.findByText("DETAIL-Old interview")).toBeTruthy();
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ search: "Old interview" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Update detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Export detail" }));
    expect(mocks.retryItem).toHaveBeenCalledWith("item-2");
    expect(mocks.cancelItem).toHaveBeenCalledWith("item-2");
    expect(mocks.updateItem).toHaveBeenCalledWith({
      id: "item-2",
      patch: { name: "From detail" },
    });
    expect(mocks.exportItem).toHaveBeenCalledWith({
      id: "item-2",
      format: "txt",
      outputPath: "/tmp/item.txt",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close detail" }));
    expect(await screen.findByText("Open Weekly sync")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Weekly sync" }));
    expect(await screen.findByText("DETAIL-Weekly sync")).toBeTruthy();
  });

  test("clears the focus search when the focused detail is closed", async () => {
    renderLibrary({ focusItem: { id: "item-2", query: "Old interview" } });

    expect(await screen.findByText("DETAIL-Old interview")).toBeTruthy();
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ search: "Old interview" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Close detail" }));

    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ search: null });
    });
    expect(screen.queryByText("DETAIL-Old interview")).toBeNull();
  });

  test("preserves name, tag and card mutation policies", async () => {
    const { queryClient } = renderLibrary();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: "Rename item-1" }));
    fireEvent.change(screen.getByLabelText("NAME-DRAFT-UNIQUE"), {
      target: { value: " Renamed sync " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith({
        id: "item-1",
        patch: { name: "Renamed sync" },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Tag item-1" }));
    fireEvent.change(screen.getByLabelText("TAG-DRAFT-UNIQUE"), {
      target: { value: " Client " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save tag" }));
    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith({
        id: "item-1",
        patch: { tags: ["work", "team", "Client"] },
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["library", "tags"] });

    const firstCard = within(screen.getByTestId("card-item-1"));
    fireEvent.click(firstCard.getByRole("button", { name: "Remove work tag" }));
    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith({
        id: "item-1",
        patch: { tags: ["team"] },
      }),
    );
    fireEvent.click(firstCard.getByRole("button", { name: "Find work tag" }));
    await waitFor(() => {
      const latest = mocks.useLibraryItems.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ search: "#work" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry item-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel item-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete item-1" }));
    expect(mocks.retryItem).toHaveBeenCalledWith("item-1");
    expect(mocks.cancelItem).toHaveBeenCalledWith("item-1");
    expect(mocks.deleteItem).toHaveBeenCalledWith("item-1");
  });

  test("keeps native picker and mixed-file import behavior", async () => {
    const setImportPaths = vi.fn();
    mocks.openDialog.mockResolvedValue([
      "/tmp/voice.wav",
      "/tmp/voice.wav",
      "/tmp/video.mp4",
    ]);
    renderLibrary({ onSetImportPaths: setImportPaths });
    fireEvent.click(screen.getByRole("button", { name: "IMPORT-FILE-UNIQUE" }));
    await waitFor(() =>
      expect(setImportPaths).toHaveBeenCalledWith([
        "/tmp/voice.wav",
        "/tmp/video.mp4",
      ]),
    );
    expect(mocks.openDialog).toHaveBeenCalledWith({
      multiple: true,
      filters: [{ name: "Audio & Video", extensions: expect.any(Array) }],
    });

    cleanup();
    renderLibrary({
      pendingImportPaths: ["/tmp/voice.wav", "/tmp/notes.txt"],
      onSetImportPaths: setImportPaths,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm file import" }),
    );
    await waitFor(() => expect(mocks.createFile).toHaveBeenCalledOnce());
    expect(mocks.createFile.mock.calls[0]?.[0]).toMatchObject({
      path: "/tmp/voice.wav",
      options: { model_key: "remote" },
    });
    expect(mocks.showToast).toHaveBeenCalledWith(
      "warning",
      expect.stringContaining("1"),
    );
    expect(setImportPaths).toHaveBeenLastCalledWith(null);
  });

  test("preserves YouTube and meeting modal lifecycles", async () => {
    renderLibrary();
    fireEvent.click(screen.getByRole("button", { name: "YOUTUBE-UNIQUE" }));
    expect(screen.getByTestId("youtube-import-modal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm YouTube" }));
    await waitFor(() => expect(mocks.createYoutube).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByTestId("youtube-import-modal")).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "MEETING-UNIQUE" }));
    expect(screen.getByTestId("meeting-modal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm meeting" }));
    await waitFor(() => expect(mocks.startMeeting).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByTestId("meeting-modal")).toBeNull(),
    );
  });
});
