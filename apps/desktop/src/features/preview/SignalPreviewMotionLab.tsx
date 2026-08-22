import { useEffect, useState } from "react";
import {
  ArrowClockwise,
  CloudArrowUp,
  Microphone,
  Trash,
  Waveform,
} from "@phosphor-icons/react";
import ActionCardButton from "../../shared/ui/ActionCardButton";
import AnimatedCount from "../../shared/ui/AnimatedCount";
import SegmentedControl from "../../shared/ui/SegmentedControl";
import Shimmer from "../../shared/ui/Shimmer";
import ToggleSwitch from "../../shared/ui/ToggleSwitch";

// Superficie de preview (VITE_SIGNAL_PREVIEW=1, ?surface=motion): galería de
// las micro-interacciones compartidas para revisión visual y screenshots.
// Igual que el resto de superficies de preview, usa datos estáticos en inglés.

const demoTranscripts = [
  { id: "a", text: "Send the research notes to Ana.", time: "14:32" },
  { id: "b", text: "Remember to call the dentist after lunch.", time: "13:08" },
  { id: "c", text: "The product review moved to Friday.", time: "11:41" },
];

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mb-4">
      <h2 className="ui-text-label-strong ui-color-primary">{title}</h2>
      <p className="mt-0.5 ui-text-micro ui-color-muted">{detail}</p>
    </div>
  );
}

function PoofDemoRow() {
  const [poofing, setPoofing] = useState<ReadonlySet<string>>(() => new Set());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const poof = (id: string) => {
    setPoofing((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setHidden((prev) => new Set(prev).add(id));
    }, 220);
  };

  const reset = () => {
    setPoofing(new Set());
    setHidden(new Set());
  };

  return (
    <div className="space-y-2">
      {demoTranscripts.map((item) =>
        hidden.has(item.id) ? null : (
          <div
            key={item.id}
            className={`flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-surface-surface px-3 py-2.5${
              poofing.has(item.id) ? " looper-poof-out" : ""
            }`}
          >
            <div className="min-w-0">
              <p className="ui-text-body-sm ui-color-primary truncate">
                {item.text}
              </p>
              <p className="ui-text-micro ui-color-muted">{item.time}</p>
            </div>
            <button
              type="button"
              onClick={() => poof(item.id)}
              aria-label={`Delete "${item.text}"`}
              className="ui-button-ghost h-7 w-7 shrink-0"
            >
              <Trash size={13} aria-hidden="true" />
            </button>
          </div>
        ),
      )}
      <button
        type="button"
        onClick={reset}
        className="ui-button-ghost h-7 px-2 ui-text-micro"
      >
        <ArrowClockwise size={12} aria-hidden="true" className="mr-1" />
        Reset
      </button>
    </div>
  );
}

export default function SignalPreviewMotionLab() {
  const [words, setWords] = useState(1187);
  const [seconds, setSeconds] = useState(42);
  const [mode, setMode] = useState<"local" | "cloud" | "auto">("local");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setWords((value) => value + Math.ceil(Math.random() * 9));
      setSeconds((value) => value + 1);
    }, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="h-screen w-screen overflow-y-auto bg-surface-secondary text-content-primary">
      <div className="mx-auto max-w-[860px] px-10 py-12">
        <p className="ui-text-uppercase-micro ui-color-muted">Motion lab</p>
        <h1 className="font-display mt-1 text-[26px] font-medium tracking-[-0.04em]">
          Micro-interacciones compartidas
        </h1>

        <div className="mt-10 grid grid-cols-2 gap-10">
          <section>
            <SectionTitle
              title="Shimmer"
              detail="Estado de carga con nombre propio (looper-shimmer)"
            />
            <div className="space-y-3">
              {[0, 1].map((row) => (
                <div
                  key={row}
                  className="rounded-lg border border-border-primary bg-surface-surface px-3 py-2.5"
                >
                  <Shimmer className="h-3 w-24" />
                  <Shimmer className="mt-2.5 h-3.5 w-3/4" />
                  <Shimmer className="mt-1.5 h-3.5 w-1/2" />
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle
              title="AnimatedCount"
              detail="Dígitos que ruedan al cambiar el valor"
            />
            <div className="rounded-lg border border-border-primary bg-surface-surface px-4 py-4">
              <p className="ui-text-uppercase-micro ui-color-muted">
                Words inserted today
              </p>
              <AnimatedCount
                value={words}
                className="font-display mt-1 block text-[34px] font-medium tracking-[-0.03em]"
              />
              <p className="mt-3 ui-text-uppercase-micro ui-color-muted">
                Recording
              </p>
              <AnimatedCount
                value={seconds}
                format={(value) =>
                  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
                }
                className="mt-1 block text-[20px] font-medium ui-color-secondary"
              />
            </div>
          </section>

          <section>
            <SectionTitle
              title="Press squish"
              detail="ActionCardButton con scale al presionar (mantén el clic)"
            />
            <div className="space-y-3">
              <ActionCardButton
                title="Start dictation"
                description="Hold ⌥ Space anywhere"
                icon={<Microphone size={16} />}
              />
              <ActionCardButton
                title="Transcribe a file"
                description="Drop audio or browse"
                icon={<Waveform size={16} />}
              />
              <div className="looper-pressable inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border-primary bg-surface-surface px-3 py-2">
                <CloudArrowUp size={14} aria-hidden="true" />
                <span className="ui-text-button">looper-pressable suelto</span>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle
              title="Poof al eliminar"
              detail="looper-poof-out: escala + blur + fade en 220ms"
            />
            <PoofDemoRow />
          </section>

          <section>
            <SectionTitle
              title="Estados de foco e interacción"
              detail="Tab para recorrer: anillo de foco consistente + squish en ghost buttons"
            />
            <div className="flex flex-wrap items-center gap-5">
              <SegmentedControl
                value={mode}
                onChange={setMode}
                ariaLabel="Speech engine"
                options={[
                  { value: "local", label: "Local" },
                  { value: "cloud", label: "Cloud" },
                  { value: "auto", label: "Auto" },
                ]}
              />
              <ToggleSwitch
                enabled={enabled}
                onToggle={() => setEnabled((value) => !value)}
                ariaLabel="Sync history"
                size="md"
              />
              <button type="button" className="ui-button-ghost h-8 w-8">
                <Waveform size={14} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
