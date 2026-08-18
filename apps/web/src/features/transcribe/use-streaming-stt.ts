import { useStreamingStt as useStreamingSttDomain } from "@looper/data";
import { useCallback, useEffect, useRef, useState } from "react";
import { type PcmCapture, startPcmCapture } from "./pcm-capture";
import { ADAPTERS, type ParseResult, type StreamProvider } from "./stt-adapters";

export type { StreamProvider } from "./stt-adapters";
export type StreamStatus = "idle" | "connecting" | "live" | "error";

export function useStreamingStt(provider: StreamProvider) {
  const { createSession, saveTranscript } = useStreamingSttDomain();

  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<PcmCapture | null>(null);
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const finalRef = useRef(""); // mirror of finalText for the save-on-stop path
  const startedAtRef = useRef<number | null>(null);

  const applyParse = useCallback((r: ParseResult) => {
    if (!r) return;
    if (r.interimReplace !== undefined) setInterim(r.interimReplace);
    if (r.interimAppend !== undefined) setInterim((p) => p + r.interimAppend);
    if (r.final) {
      finalRef.current = finalRef.current ? `${finalRef.current} ${r.final}` : r.final;
      setFinalText(finalRef.current);
      setInterim("");
    }
  }, []);

  const teardown = useCallback(() => {
    for (const t of timersRef.current) clearInterval(t);
    timersRef.current = [];
    captureRef.current?.stop();
    captureRef.current = null;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
    wsRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setFinalText("");
    setInterim("");
    finalRef.current = "";
    setError(null);
    setStatus("connecting");
    startedAtRef.current = Date.now();
    try {
      const session = await createSession(provider);
      if (session.mock) {
        runMock(provider, applyParse, setStatus, timersRef);
        return;
      }
      const adapter = ADAPTERS[provider];
      const ws = new WebSocket(adapter.wsUrl(session.token), adapter.protocols?.(session.token));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          captureRef.current = await startPcmCapture(adapter.sampleRate, (pcm) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) adapter.sendAudio(wsRef.current, pcm);
          });
          if (adapter.keepAlive) {
            timersRef.current.push(
              setInterval(() => {
                if (wsRef.current?.readyState === WebSocket.OPEN)
                  adapter.keepAlive?.(wsRef.current);
              }, 5000),
            );
          }
          setStatus("live");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Microphone access failed");
          setStatus("error");
          teardown();
        }
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        try {
          applyParse(adapter.parse(e.data));
        } catch {
          // Ignore frames we can't parse.
        }
      };
      ws.onerror = () => {
        setError("Streaming connection error");
        setStatus("error");
      };
      ws.onclose = () => setStatus((s) => (s === "error" ? s : "idle"));
    } catch (err) {
      startedAtRef.current = null;
      setError(err instanceof Error ? err.message : "Could not start the session");
      setStatus("error");
      teardown();
    }
  }, [provider, createSession, applyParse, teardown]);

  const stop = useCallback(async () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ADAPTERS[provider].finish(ws);
      } catch {
        // best-effort flush
      }
    }
    teardown();
    setStatus("idle");
    setInterim("");
    const text = finalRef.current.trim();
    const startedAt = startedAtRef.current;
    startedAtRef.current = null;
    if (text) {
      try {
        await saveTranscript(
          provider,
          text,
          startedAt === null ? undefined : Math.max(0, Date.now() - startedAt),
        );
      } catch {
        // Saving is best-effort; the transcript stays on screen regardless.
      }
    }
    return text;
  }, [provider, teardown, saveTranscript]);

  // Tear down the socket + mic if the component unmounts (mode switch, route nav)
  // while a session is live, so we never leak an open WebSocket / mic capture.
  useEffect(() => () => teardown(), [teardown]);

  const transcript = interim ? (finalText ? `${finalText} ${interim}` : interim) : finalText;

  return { status, error, transcript, isLive: status === "live", start, stop };
}

// MOCK: streams a canned sentence word-by-word (partial) then commits it (final),
// so the live UX is demonstrable with zero provider keys (MOCK_MODE).
function runMock(
  provider: StreamProvider,
  apply: (r: ParseResult) => void,
  setStatus: (s: StreamStatus) => void,
  timers: { current: ReturnType<typeof setInterval>[] },
) {
  setStatus("live");
  const words =
    `[Mock · ${provider}] esta es una transcripción en vivo simulada — set MOCK_MODE=false y una clave del proveedor para STT real`.split(
      " ",
    );
  let i = 0;
  const timer = setInterval(() => {
    i++;
    if (i >= words.length) {
      apply({ final: words.join(" ") });
      clearInterval(timer);
      return;
    }
    apply({ interimReplace: words.slice(0, i).join(" ") });
  }, 170);
  timers.current.push(timer);
}
