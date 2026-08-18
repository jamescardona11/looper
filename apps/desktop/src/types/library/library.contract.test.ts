import { describe, expectTypeOf, test } from "vitest";
import type {
  LibraryImportOptions,
  LibraryItem,
  LibraryItemStatus,
  MeetingCaptureHealth,
  MeetingCaptureState,
} from "../library";

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
});
