import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  addLibraryWatchFolder,
  getLibraryWatchFolders,
  removeLibraryWatchFolder,
  scanLibraryWatchFoldersNow,
  probeLibraryYoutubeUrl,
  createLibraryYoutubeItem,
  getLibraryTranslations,
  translateLibraryItem,
  deleteLibraryTranslation,
} from "../library";

describe("library watch folder API", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("sends the folder and import policy to the native layer", async () => {
    const options = {
      store_original: true,
      model_key: "parakeet",
      llm_cleanup_enabled: false,
      denoise_enabled: false,
      show_timestamps: false,
      detect_speakers: false,
    };
    invokeMock.mockResolvedValueOnce({
      path: "/Users/test/Recordings",
      options,
      enabled: true,
    });

    await addLibraryWatchFolder("/Users/test/Recordings", options);

    expect(invokeMock).toHaveBeenCalledWith("add_library_watch_folder", {
      path: "/Users/test/Recordings",
      options,
    });
  });

  it("maps list, scan and remove commands", async () => {
    invokeMock.mockResolvedValue([]);

    await getLibraryWatchFolders();
    await scanLibraryWatchFoldersNow();
    await removeLibraryWatchFolder("/Users/test/Recordings");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_library_watch_folders");
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "scan_library_watch_folders_now",
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      3,
      "remove_library_watch_folder",
      { path: "/Users/test/Recordings" },
    );
  });

  it("keeps YouTube metadata structured across probe and import", async () => {
    const metadata = {
      url: "https://www.youtube.com/watch?v=abc",
      video_id: "abc",
      title: "A useful talk",
      channel: "Example",
      duration_seconds: 123,
    };
    const options = {
      store_original: true,
      model_key: "parakeet",
      llm_cleanup_enabled: false,
      denoise_enabled: false,
      show_timestamps: true,
      detect_speakers: false,
    };
    invokeMock.mockResolvedValue(metadata);

    await probeLibraryYoutubeUrl(metadata.url);
    await createLibraryYoutubeItem(metadata, options);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "probe_library_youtube_url", {
      url: metadata.url,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "create_library_youtube_item",
      { metadata, options },
    );
  });

  it("maps explicit Library translation CRUD without replacing the transcript", async () => {
    invokeMock.mockResolvedValue([]);

    await getLibraryTranslations("item-1");
    await translateLibraryItem("item-1", "Spanish");
    await deleteLibraryTranslation("item-1", "Spanish");

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_library_translations", {
      itemId: "item-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "translate_library_item", {
      itemId: "item-1",
      language: "Spanish",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(
      3,
      "delete_library_translation",
      {
        itemId: "item-1",
        language: "Spanish",
      },
    );
  });
});
