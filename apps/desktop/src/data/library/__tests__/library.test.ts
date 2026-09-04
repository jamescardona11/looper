import { beforeEach, describe, expect, test, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  convertFileSrc: vi.fn(),
  emit: vi.fn(),
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: tauri.convertFileSrc,
  invoke: tauri.invoke,
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: tauri.emit,
  listen: tauri.listen,
}));

import {
  askMeeting,
  cancelLibraryTranscription,
  createLibraryItem,
  deleteLibraryItem,
  deleteLibraryTranslation,
  exportLibraryItemToPath,
  getLibraryItemsPage,
  getLibraryTags,
  getLibraryTranslations,
  notifyLibraryRendererReady,
  probeLibraryImportFiles,
  resolveLibraryAudioUrl,
  retryLibraryTranscription,
  startDefaultMeetingCapture,
  startMeetingCapture,
  subscribeLibraryDragEnter,
  subscribeLibraryEvents,
  translateLibraryItem,
  updateLibraryItem,
  updateMeetingNotes,
} from "../../library";

describe("library native boundary", () => {
  beforeEach(() => {
    tauri.convertFileSrc.mockReset();
    tauri.emit.mockReset();
    tauri.invoke.mockReset();
    tauri.listen.mockReset();
  });

  test("routes item, import, and meeting commands with native payloads", async () => {
    tauri.invoke.mockResolvedValue(undefined);
    const options = {
      store_original: true,
      model_key: "parakeet",
      llm_cleanup_enabled: false,
      denoise_enabled: true,
      show_timestamps: true,
      detect_speakers: false,
    };

    await createLibraryItem("/tmp/audio.wav", options);
    await getLibraryItemsPage({ search: "review" }, 25, 50);
    await probeLibraryImportFiles(["/tmp/audio.wav"]);
    await startMeetingCapture({
      model_key: "parakeet",
      system_audio_enabled: true,
    });
    await startDefaultMeetingCapture();
    await updateMeetingNotes("meeting-1", {
      notes: "Decision",
      expected_revision: 3,
    });
    await askMeeting("meeting-1", "What changed?");

    expect(tauri.invoke.mock.calls).toEqual([
      ["create_library_item", { path: "/tmp/audio.wav", options }],
      [
        "get_library_items_page",
        { filter: { search: "review" }, limit: 25, offset: 50 },
      ],
      ["probe_library_import_files", { paths: ["/tmp/audio.wav"] }],
      [
        "start_meeting_capture",
        { options: { model_key: "parakeet", system_audio_enabled: true } },
      ],
      ["start_default_meeting_capture"],
      [
        "update_meeting_notes",
        {
          id: "meeting-1",
          update: { notes: "Decision", expected_revision: 3 },
        },
      ],
      ["ask_meeting", { id: "meeting-1", question: "What changed?" }],
    ]);
  });

  test("normalizes drag payloads and combines library event cleanup", async () => {
    const unlisteners = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const pending = [...unlisteners];
    tauri.listen.mockImplementation(async () => pending.shift());
    const drag = vi.fn();

    await subscribeLibraryDragEnter(drag);
    tauri.listen.mock.calls[0]?.[1]({ payload: undefined });
    const cleanup = await subscribeLibraryEvents({
      transcriptionProgress: vi.fn(),
      transcriptionComplete: vi.fn(),
      transcriptionError: vi.fn(),
      importProgress: vi.fn(),
      watchImported: vi.fn(),
    });
    cleanup();

    expect(drag).toHaveBeenCalledWith([]);
    unlisteners
      .slice(1)
      .forEach((unlisten) => expect(unlisten).toHaveBeenCalledOnce());
  });

  test("delegates asset URLs and renderer readiness", async () => {
    tauri.convertFileSrc.mockReturnValue("asset://audio.wav");
    tauri.emit.mockResolvedValue(undefined);
    expect(resolveLibraryAudioUrl("/tmp/audio.wav")).toBe("asset://audio.wav");
    await notifyLibraryRendererReady();
    expect(tauri.emit).toHaveBeenCalledWith("library:renderer_ready");
  });

  test("keeps item lifecycle and translation command payloads exact", async () => {
    tauri.invoke.mockResolvedValue(undefined);

    await updateLibraryItem("item-1", { name: "Interview" });
    await deleteLibraryItem("item-1");
    await cancelLibraryTranscription("item-2");
    await retryLibraryTranscription("item-3");
    await exportLibraryItemToPath("item-4", "md", "/tmp/item.md");
    await getLibraryTags();
    await getLibraryTranslations("item-5");
    await translateLibraryItem("item-5", "es");
    await deleteLibraryTranslation("item-5", "es");

    expect(tauri.invoke.mock.calls).toEqual([
      ["update_library_item", { id: "item-1", patch: { name: "Interview" } }],
      ["delete_library_item", { id: "item-1" }],
      ["cancel_library_transcription", { id: "item-2" }],
      ["retry_library_transcription", { id: "item-3" }],
      [
        "export_library_item_to_path",
        { id: "item-4", format: "md", outputPath: "/tmp/item.md" },
      ],
      ["get_library_tags"],
      ["get_library_translations", { itemId: "item-5" }],
      ["translate_library_item", { itemId: "item-5", language: "es" }],
      ["delete_library_translation", { itemId: "item-5", language: "es" }],
    ]);
  });
});
