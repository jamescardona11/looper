import { describe, expect, it } from "vitest";

import { ADAPTERS } from "./stt-adapters";

const json = (o: unknown) => JSON.stringify(o);

// Pure protocol tests: each provider frames/parses its own wire format. These
// used to be reachable only end-to-end against a live WebSocket.
describe("deepgram adapter", () => {
  const a = ADAPTERS.deepgram;
  it("captures at 16kHz and authenticates via subprotocol", () => {
    expect(a.sampleRate).toBe(16000);
    expect(a.protocols?.("tok")).toEqual(["token", "tok"]);
    expect(a.wsUrl("tok")).toContain("language=multi");
  });
  it("parses a final result", () => {
    expect(
      a.parse(
        json({
          type: "Results",
          is_final: true,
          channel: { alternatives: [{ transcript: "hello" }] },
        }),
      ),
    ).toEqual({ final: "hello" });
  });
  it("parses an interim result as a replace", () => {
    expect(
      a.parse(
        json({
          type: "Results",
          is_final: false,
          channel: { alternatives: [{ transcript: "hel" }] },
        }),
      ),
    ).toEqual({ interimReplace: "hel" });
  });
  it("ignores empty transcripts and non-Results frames", () => {
    expect(
      a.parse(json({ type: "Results", channel: { alternatives: [{ transcript: "" }] } })),
    ).toBeNull();
    expect(a.parse(json({ type: "Metadata" }))).toBeNull();
  });
});

describe("assemblyai adapter", () => {
  const a = ADAPTERS.assemblyai;
  it("uses the multilingual streaming model + encoded token", () => {
    expect(a.sampleRate).toBe(16000);
    expect(a.wsUrl("a b")).toContain("token=a%20b");
    expect(a.wsUrl("t")).toContain("universal-streaming-multilingual");
  });
  it("parses end-of-turn as final, otherwise interim", () => {
    expect(a.parse(json({ type: "Turn", end_of_turn: true, transcript: "done" }))).toEqual({
      final: "done",
    });
    expect(a.parse(json({ type: "Turn", end_of_turn: false, transcript: "doi" }))).toEqual({
      interimReplace: "doi",
    });
  });
  it("ignores empty transcripts and non-Turn frames", () => {
    expect(a.parse(json({ type: "Turn", transcript: "" }))).toBeNull();
    expect(a.parse(json({ type: "Begin" }))).toBeNull();
  });
});

describe("elevenlabs adapter", () => {
  const a = ADAPTERS.elevenlabs;
  it("authenticates via query token + scribe model", () => {
    expect(a.sampleRate).toBe(16000);
    expect(a.wsUrl("t")).toContain("scribe_v2_realtime");
  });
  it("maps partial → replace and committed → final", () => {
    expect(a.parse(json({ message_type: "partial_transcript", text: "pa" }))).toEqual({
      interimReplace: "pa",
    });
    expect(a.parse(json({ message_type: "committed_transcript", text: "final" }))).toEqual({
      final: "final",
    });
    expect(a.parse(json({ message_type: "session_started" }))).toBeNull();
  });
});

describe("openai adapter", () => {
  const a = ADAPTERS.openai;
  it("captures at 24kHz and authenticates via subprotocol", () => {
    expect(a.sampleRate).toBe(24000);
    expect(a.protocols?.("k")).toEqual(["realtime", "openai-insecure-api-key.k"]);
  });
  it("appends deltas and commits on completion", () => {
    expect(
      a.parse(json({ type: "conversation.item.input_audio_transcription.delta", delta: "he" })),
    ).toEqual({ interimAppend: "he" });
    expect(
      a.parse(
        json({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "hello",
        }),
      ),
    ).toEqual({ final: "hello" });
    expect(a.parse(json({ type: "response.created" }))).toBeNull();
  });
});
