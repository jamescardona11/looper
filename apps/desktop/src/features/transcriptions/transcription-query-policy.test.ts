import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import type { TranscriptionRecord } from "../../types";
import {
  removeCachedTranscription,
  restoreCachedTranscriptions,
  transcriptionKeys,
} from "./transcription-query-policy";

const records = [
  { id: "keep", text: "Keep" },
  { id: "remove", text: "Remove" },
] as TranscriptionRecord[];

describe("transcription cache policy", () => {
  test("removes a record optimistically and returns the previous list", async () => {
    const client = new QueryClient();
    client.setQueryData(transcriptionKeys.list(), records);

    const snapshot = await removeCachedTranscription(client, "remove");

    expect(snapshot).toBe(records);
    expect(client.getQueryData(transcriptionKeys.list())).toEqual([records[0]]);
  });

  test("restores the exact previous list after a failed deletion", () => {
    const client = new QueryClient();

    restoreCachedTranscriptions(client, records);

    expect(client.getQueryData(transcriptionKeys.list())).toBe(records);
  });
});
