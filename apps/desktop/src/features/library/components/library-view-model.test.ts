import { describe, expect, test } from "vitest";

import type { LibraryItem, SpeechModel } from "../../../types";
import {
  appendTagPatch,
  displayedStatusChoice,
  editNamePatch,
  libraryErrorMessage,
  libraryFilter,
  libraryItemsFromPages,
  nextStatusFilter,
  partitionImportPaths,
  removeTagPatch,
  selectedLibraryItem,
  selectLibraryModels,
} from "./library-view-model";

const item = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "item-1",
  name: "Weekly sync",
  created_at: "2026-08-17T10:00:00.000Z",
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
  speech_model: "local-a",
  ...overrides,
});

const model = (overrides: Partial<SpeechModel>): SpeechModel => ({
  id: "model-a",
  key: "local-a",
  label: "Local A",
  description: "Local model",
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

describe("library view policies", () => {
  test("builds the exact query filter and status toggle semantics", () => {
    expect(libraryFilter("quarterly", "recording")).toEqual({
      search: "quarterly",
      status: "recording",
      tag: null,
      since_days: null,
    });
    expect(libraryFilter("", "all")).toEqual({
      search: null,
      status: null,
      tag: null,
      since_days: null,
    });
    expect(displayedStatusChoice("cancelling")).toBe("active");
    expect(displayedStatusChoice("complete")).toBe("complete");
    expect(displayedStatusChoice("unknown")).toBe("all");
    expect(nextStatusFilter("recording", "active")).toBe("all");
    expect(nextStatusFilter("all", "error")).toBe("error");
  });

  test("flattens pages and resolves a selected item without inventing data", () => {
    const first = item();
    const second = item({ id: "item-2", name: "Interview" });
    const items = libraryItemsFromPages([
      { items: [first], has_more: true },
      { items: [second], has_more: false },
    ]);

    expect(items).toEqual([first, second]);
    expect(libraryItemsFromPages(undefined)).toEqual([]);
    expect(selectedLibraryItem(items, "item-2")).toEqual(second);
    expect(selectedLibraryItem(items, "missing")).toBeNull();
    expect(selectedLibraryItem(items, null)).toBeNull();
  });

  test("normalizes name and tag edits while preserving duplicate rules", () => {
    const current = item();
    expect(editNamePatch([current], current.id, " Renamed ")).toEqual({
      name: "Renamed",
    });
    expect(editNamePatch([current], current.id, "Weekly sync")).toBeNull();
    expect(editNamePatch([current], current.id, "   ")).toBeNull();
    expect(appendTagPatch([current], current.id, " Client ")).toEqual({
      tags: ["work", "team", "Client"],
    });
    expect(appendTagPatch([current], current.id, "WORK")).toBeNull();
    expect(appendTagPatch([current], "missing", "new")).toBeNull();
    expect(removeTagPatch(current, "work")).toEqual({ tags: ["team"] });
  });

  test("keeps model eligibility and the three default priorities distinct", () => {
    const remote = model({
      id: "remote",
      key: "remote",
      remote: true,
      engine_id: "cloud",
      capabilities: [],
    });
    const configured = model({ id: "configured", key: "configured" });
    const localFallback = model({ id: "fallback", key: "fallback" });
    const incompatible = model({
      id: "incompatible",
      key: "incompatible",
      capabilities: [],
    });
    const missing = model({ id: "missing", key: "missing", installed: false });

    const result = selectLibraryModels(
      [remote, localFallback, configured, incompatible, missing],
      "configured",
    );
    expect(result.installed).toEqual([
      remote,
      localFallback,
      configured,
      incompatible,
    ]);
    expect(result.meeting).toEqual([remote, localFallback, configured]);
    expect(result.liveMeeting).toEqual([localFallback, configured]);
    expect(result.detailDefault).toBe("configured");
    expect(result.importDefault).toBe("remote");
    expect(result.meetingDefault).toBe("configured");
  });

  test("partitions supported files once and maps unknown errors", () => {
    expect(
      partitionImportPaths(["voice.WAV", "clip.mp4", "notes.txt", "README"]),
    ).toEqual({
      supported: ["voice.WAV", "clip.mp4"],
      unsupported: ["notes.txt", "README"],
    });
    expect(libraryErrorMessage(new Error("query failed"))).toBe("query failed");
    expect(libraryErrorMessage("plain failure")).toBe("plain failure");
    expect(libraryErrorMessage(null)).toBeNull();
  });
});
