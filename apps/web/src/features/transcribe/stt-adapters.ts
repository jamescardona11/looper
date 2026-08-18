// The 20% that differs per streaming-STT provider, extracted as pure data so the
// protocol framing + parsing can be unit-tested without a live WebSocket. The
// hook (use-streaming-stt) owns the shared socket + audio-capture lifecycle and
// just drives these adapters. Adding or removing a provider is editing this map.
// Specs grounded in each provider's streaming docs (see the streaming-stt research).

import { pcmToBase64 } from "./pcm-capture";

export type StreamProvider = "deepgram" | "assemblyai" | "elevenlabs" | "openai";

// A parse result is expressed in terms of HOW it changes the on-screen text:
// replace the live partial, append to it, or commit a final segment.
export type ParseResult = {
  interimReplace?: string;
  interimAppend?: string;
  final?: string;
} | null;

export interface Adapter {
  sampleRate: number;
  wsUrl: (token: string) => string;
  protocols?: (token: string) => string[];
  sendAudio: (ws: WebSocket, pcm: Int16Array) => void;
  parse: (data: string) => ParseResult;
  finish: (ws: WebSocket) => void;
  keepAlive?: (ws: WebSocket) => void;
}

export const ADAPTERS: Record<StreamProvider, Adapter> = {
  // Binary PCM16 @16k, JWT via Sec-WebSocket-Protocol, Results.is_final.
  deepgram: {
    sampleRate: 16000,
    wsUrl: () =>
      "wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true",
    protocols: (token) => ["token", token],
    sendAudio: (ws, pcm) => {
      if (pcm.length) ws.send(pcm.buffer);
    },
    parse: (data) => {
      const m = JSON.parse(data);
      if (m.type !== "Results") return null;
      const text: string = m.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text) return null;
      return m.is_final ? { final: text } : { interimReplace: text };
    },
    finish: (ws) => ws.send(JSON.stringify({ type: "CloseStream" })),
    keepAlive: (ws) => ws.send(JSON.stringify({ type: "KeepAlive" })),
  },
  // Binary PCM16 @16k, token in query, Turn.end_of_turn.
  assemblyai: {
    sampleRate: 16000,
    // universal-streaming-multilingual: en/es/fr/de/it/pt with auto language
    // detection. The default streaming model is English-only (returns no Turns
    // for Spanish audio).
    wsUrl: (token) =>
      `wss://streaming.assemblyai.com/v3/ws?token=${encodeURIComponent(token)}&speech_model=universal-streaming-multilingual&encoding=pcm_s16le&sample_rate=16000&format_turns=true`,
    sendAudio: (ws, pcm) => {
      if (pcm.length) ws.send(pcm.buffer);
    },
    parse: (data) => {
      const m = JSON.parse(data);
      if (m.type !== "Turn") return null;
      const text: string = m.transcript ?? "";
      if (!text) return null;
      return m.end_of_turn ? { final: text } : { interimReplace: text };
    },
    finish: (ws) => ws.send(JSON.stringify({ type: "Terminate" })),
    keepAlive: (ws) => ws.send(JSON.stringify({ type: "KeepAlive" })),
  },
  // base64 PCM16 @16k in JSON, token in query, partial_/committed_transcript.
  elevenlabs: {
    sampleRate: 16000,
    wsUrl: (token) =>
      `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${encodeURIComponent(token)}&model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=vad`,
    sendAudio: (ws, pcm) => {
      if (pcm.length)
        ws.send(
          JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: pcmToBase64(pcm) }),
        );
    },
    parse: (data) => {
      const m = JSON.parse(data);
      if (m.message_type === "partial_transcript") return { interimReplace: m.text ?? "" };
      if (m.message_type === "committed_transcript") return { final: m.text ?? "" };
      return null;
    },
    finish: (ws) =>
      ws.send(
        JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: "", commit: true }),
      ),
  },
  // base64 PCM16 @24k in JSON, ephemeral key via subprotocol, transcription deltas.
  openai: {
    sampleRate: 24000,
    wsUrl: () => "wss://api.openai.com/v1/realtime?intent=transcription",
    protocols: (token) => ["realtime", `openai-insecure-api-key.${token}`],
    sendAudio: (ws, pcm) => {
      if (pcm.length)
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcmToBase64(pcm) }));
    },
    parse: (data) => {
      const m = JSON.parse(data);
      if (m.type === "conversation.item.input_audio_transcription.delta")
        return { interimAppend: m.delta ?? "" };
      if (m.type === "conversation.item.input_audio_transcription.completed")
        return { final: m.transcript ?? "" };
      return null;
    },
    finish: (ws) => ws.send(JSON.stringify({ type: "input_audio_buffer.commit" })),
  },
};
