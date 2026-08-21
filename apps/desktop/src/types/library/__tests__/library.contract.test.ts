import { describe, expectTypeOf, test } from "vitest";
import type {
  LibraryImportOptions,
  LibraryImportProgressPayload,
  LibraryItem,
  LibraryItemStatus,
  LibraryProgressPayload,
  MeetingCaptureHealth,
  MeetingCaptureState,
  YoutubeImportMetadata,
} from "../../library";

describe("library wire contract", () => {
  test("keeps progress on active item states", () => {
    type Transcribing = Extract<LibraryItemStatus, { type: "transcribing" }>;
    expectTypeOf<Transcribing["progress"]>().toEqualTypeOf<number>();
  });

  test("composes media, processing, and meeting payloads", () => {
    expectTypeOf<LibraryItem>().toMatchTypeOf<{
      audio_path: string;
      transcript?: string | null;
      status: LibraryItemStatus;
    }>();
    expectTypeOf<
      MeetingCaptureState["capture_health"]
    >().toEqualTypeOf<MeetingCaptureHealth>();
    expectTypeOf<LibraryImportOptions>().toHaveProperty("detect_speakers");
  });

  test("keeps import progress and video metadata wire fields", () => {
    expectTypeOf<
      LibraryProgressPayload["current_chunk"]
    >().toEqualTypeOf<number>();
    expectTypeOf<LibraryProgressPayload["chunk_segments"]>().toEqualTypeOf<
      import("../../library").TranscriptSegment[] | null | undefined
    >();
    expectTypeOf<
      LibraryImportProgressPayload["progress"]
    >().toEqualTypeOf<number>();
    expectTypeOf<YoutubeImportMetadata["channel"]>().toEqualTypeOf<
      string | null
    >();
  });
});
