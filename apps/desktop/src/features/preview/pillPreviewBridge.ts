// Puente de preview (VITE_SIGNAL_PREVIEW=1, ?surface=pill): implementa los
// internals que `@tauri-apps/api` espera del runtime nativo, para poder montar
// el PillOverlay real en el navegador y recorrer sus estados. No sustituye a la
// app: solo permite capturar los diseños sin depender de un dictado real.
//
// El contrato imitado es el de @tauri-apps/api v2:
// - `transformCallback` guarda el handler y devuelve un id numérico.
// - `listen()` invoca `plugin:event|listen` con { event, handler: id }.
// - El backend entrega el evento llamando al handler con { event, id, payload }.

type TauriEvent<TPayload = unknown> = {
  event: string;
  id: number;
  payload: TPayload;
};

type EventHandler = (event: TauriEvent) => void;

type TauriInternals = {
  metadata: {
    currentWindow: { label: string };
    currentWebview: { windowLabel: string; label: string };
  };
  transformCallback: (callback: EventHandler, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (path: string) => string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

const callbacks = new Map<number, EventHandler>();
const listeners = new Map<string, Set<number>>();
let nextCallbackId = 1;

// Respuestas mínimas para los comandos que la pill consulta al montarse. Los
// valores replican el mock de PillOverlay.test.tsx: es la referencia que ya se
// mantiene junto al componente.
const COMMAND_RESULTS: Record<string, unknown> = {
  get_settings: {
    language: "en",
    local_model: "parakeet",
    remote_speech_enabled: false,
    remote_speech_provider: "openai",
    remote_speech_endpoint: "",
    remote_speech_model: "auto",
    transcription_mode: "local",
  },
  list_models: [
    {
      key: "parakeet",
      language_selection_mode: "auto_detect",
      supported_languages: [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "pt", name: "Portuguese" },
        { code: "fr", name: "French" },
      ],
    },
  ],
  get_active_mode_rule_suggestion: null,
};

export function installPillPreviewBridge() {
  if (window.__TAURI_INTERNALS__) return;

  // `@tauri-apps/api` ya declara este global (sin `?`), así que lo asignamos
  // sin volver a declararlo.
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(event: string, eventId: number) {
      listeners.get(event)?.delete(eventId);
    },
  };

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    transformCallback(callback) {
      const id = nextCallbackId++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc: (path) => path,
    invoke(cmd, args) {
      if (cmd === "plugin:event|listen") {
        const event = String(args?.event ?? "");
        const handlerId = Number(args?.handler ?? 0);
        const forEvent = listeners.get(event) ?? new Set<number>();
        forEvent.add(handlerId);
        listeners.set(event, forEvent);
        return Promise.resolve(handlerId);
      }

      if (cmd === "plugin:event|unlisten") {
        const event = String(args?.event ?? "");
        listeners.get(event)?.delete(Number(args?.eventId ?? 0));
        return Promise.resolve(null);
      }

      return Promise.resolve(COMMAND_RESULTS[cmd] ?? null);
    },
  };
}

/** Entrega un evento a los listeners registrados, como haría el backend. */
export function emitPillEvent(event: string, payload: unknown) {
  const forEvent = listeners.get(event);
  if (!forEvent) return;
  for (const id of forEvent) {
    callbacks.get(id)?.({ event, id, payload });
  }
}
