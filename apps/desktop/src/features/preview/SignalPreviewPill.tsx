import { useEffect, useState } from "react";
import PillOverlay from "../pill/PillOverlay";
import { emitPillEvent } from "./pillPreviewBridge";

// Superficie de preview (VITE_SIGNAL_PREVIEW=1, ?surface=pill&state=<id>):
// monta el PillOverlay real y le entrega los mismos eventos que emite el
// backend, para poder ver y capturar cada diseño de la pill sin depender de un
// dictado real. Un estado por carga: los eventos son globales a la ventana.
// El puente se instala en main.tsx, antes de montar la app.

const SAMPLE_NOTE = "Send the research notes to Ana before the review.";
const SAMPLE_ANSWER =
  "The review moved to Friday at 10:00, and Ana owns the summary.";

type PillPreviewState = {
  id: string;
  label: string;
  detail: string;
  /** Eventos que el backend emitiría para dejar la pill en este diseño. */
  events: { event: string; payload: unknown }[];
  /** El espectro solo se dibuja mientras llegan muestras (status listening). */
  streamsAudio?: boolean;
};

const expanded = (tone: string, text: string, usedScreenContext = false) => [
  { event: "pill:state", payload: { status: "processing" } },
  {
    event: "pill:mode",
    payload: { expanded: true, text, tone, usedScreenContext },
  },
];

export const PILL_PREVIEW_STATES: PillPreviewState[] = [
  {
    id: "idle",
    label: "Idle · dock",
    detail: "Reposo: el dock sticky, sin dictado en curso.",
    events: [{ event: "pill:state", payload: { status: "idle" } }],
  },
  {
    id: "preflight",
    label: "Preflight",
    detail: "Antes de grabar: selector de idioma y arranque desde el dock.",
    events: [{ event: "pill:state", payload: { status: "preflight" } }],
  },
  {
    id: "listening",
    label: "Listening · compacta",
    detail: "Grabando sin hover: una línea con señal y timer.",
    events: [{ event: "pill:state", payload: { status: "listening" } }],
    streamsAudio: true,
  },
  {
    id: "listening-hover",
    label: "Listening · hover",
    detail: "Grabando con hover: se abre a título, meta y cancelar.",
    events: [
      { event: "pill:state", payload: { status: "listening" } },
      { event: "pill:hover", payload: { hovering: true } },
    ],
    streamsAudio: true,
  },
  {
    id: "processing",
    label: "Processing · compacta",
    detail: "Transcribiendo, sin hover.",
    events: [{ event: "pill:state", payload: { status: "processing" } }],
  },
  {
    id: "processing-hover",
    label: "Processing · hover",
    detail: "Transcribiendo con hover.",
    events: [
      { event: "pill:state", payload: { status: "processing" } },
      { event: "pill:hover", payload: { hovering: true } },
    ],
  },
  {
    id: "cancelled",
    label: "Cancelled",
    detail: "Dictado descartado.",
    events: [{ event: "pill:state", payload: { status: "cancelled" } }],
  },
  {
    id: "error",
    label: "Error",
    detail: "Fallo de transcripción, sin reintento disponible.",
    events: [{ event: "pill:state", payload: { status: "error" } }],
  },
  {
    id: "error-retry",
    label: "Error · retry",
    detail: "Fallo con id de reintento: la pill ofrece reintentar.",
    events: [
      { event: "pill:state", payload: { status: "error" } },
      { event: "pill:error", payload: { retry_id: "preview-retry" } },
    ],
  },
  {
    id: "inserted",
    label: "Inserted · Undo",
    detail: "Confirmación de inserción con deshacer, sobre estado idle.",
    events: [
      { event: "pill:state", payload: { status: "idle" } },
      { event: "pill:inserted", payload: { chars: 48, can_undo: true } },
    ],
  },
  {
    id: "cleanup",
    label: "Cleanup · streaming",
    detail: "Transform de Selection Mode generando texto en vivo.",
    events: [
      { event: "pill:state", payload: { status: "processing" } },
      {
        event: "pill:transform-stream",
        payload: { text: "Send the research notes to Ana bef" },
      },
    ],
  },
  {
    id: "preview",
    label: "Preview",
    detail: "Texto final pendiente de aceptar o editar.",
    events: expanded("preview", SAMPLE_NOTE),
  },
  {
    id: "preview-context",
    label: "Preview · page context",
    detail: "Igual, marcando que el transform usó contexto de pantalla.",
    events: expanded("preview", SAMPLE_NOTE, true),
  },
  {
    id: "action-select",
    label: "Action select",
    detail: "Selection Mode: elegir acción y preset tras transcribir.",
    events: expanded("action_select", SAMPLE_NOTE),
  },
  {
    id: "ask-result",
    label: "Ask result",
    detail: "Respuesta de Ask: solo lectura, nunca inserta.",
    events: expanded("ask_result", SAMPLE_ANSWER),
  },
  {
    id: "copy-result",
    label: "Copy result",
    detail: "Resultado copiado al portapapeles.",
    events: expanded("copy_result", SAMPLE_NOTE),
  },
  {
    id: "inserted-result",
    label: "Inserted result",
    detail: "Resultado ya insertado en la app destino.",
    events: expanded("inserted_result", SAMPLE_NOTE),
  },
];

const SPECTRUM_BINS = 256;

function sampleSpectrum(tick: number) {
  const bins = new Array<number>(SPECTRUM_BINS);
  for (let index = 0; index < SPECTRUM_BINS; index += 1) {
    const shape = Math.sin((index / SPECTRUM_BINS) * Math.PI);
    const wobble = Math.sin(index * 0.35 + tick * 0.25) * 0.35 + 0.65;
    bins[index] = Math.round(Math.min(255, shape * wobble * 235));
  }
  return bins;
}

export default function SignalPreviewPill() {
  const stateId = new URLSearchParams(window.location.search).get("state");
  const [state] = useState(
    () =>
      PILL_PREVIEW_STATES.find((entry) => entry.id === stateId) ??
      PILL_PREVIEW_STATES[0],
  );

  useEffect(() => {
    // El PillOverlay registra sus listeners en un efecto: emitimos en el
    // siguiente frame para que ya estén suscritos.
    const frame = requestAnimationFrame(() => {
      for (const { event, payload } of state.events) {
        emitPillEvent(event, payload);
      }
    });

    if (!state.streamsAudio) {
      return () => cancelAnimationFrame(frame);
    }

    let tick = 0;
    const spectrum = window.setInterval(() => {
      tick += 1;
      emitPillEvent("audio:spectrum", { bins: sampleSpectrum(tick) });
    }, 50);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(spectrum);
    };
  }, [state]);

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[var(--surface-preview-canvas)]">
      <div
        data-testid="pill-preview-stage"
        className="flex h-[190px] w-[300px] items-center justify-center overflow-hidden"
      >
        <PillOverlay />
      </div>
    </div>
  );
}
