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
  createLibraryItem,
  getLibraryItemsPage,
  notifyLibraryRendererReady,
  probeLibraryImportFiles,
  resolveLibraryAudioUrl,
  startMeetingCapture,
  subscribeLibraryDragEnter,
  subscribeLibraryEvents,
  updateMeetingNotes,
} from "../library";

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
});
