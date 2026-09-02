type CaptureState = "listening" | "transcribing" | "inserted";

type CapturePillPreviewProps = {
  readonly className?: string;
  readonly state?: CaptureState;
};

const captureWaveform = [7, 14, 18, 11, 15, 6];

function CaptureStateMark({ state }: { readonly state: CaptureState }) {
  if (state === "inserted") {
    return (
      <span className="lp-capture-check" aria-hidden="true">
        ✓
      </span>
    );
  }

  if (state === "transcribing") {
    return (
      <span className="lp-capture-processing" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    );
  }

  return (
    <span className="lp-capture-wave" aria-hidden="true">
      {captureWaveform.map((height) => (
        <span key={height} style={{ height }} />
      ))}
    </span>
  );
}

export function CapturePillPreview({
  className = "",
  state = "listening",
}: CapturePillPreviewProps) {
  const { pill } = useLandingCopy();
  const copy = {
    listening: { title: pill.listeningTitle, detail: pill.listeningDetail },
    transcribing: { title: pill.transcribingTitle, detail: pill.transcribingDetail },
    inserted: { title: pill.insertedTitle, detail: pill.insertedDetail },
  }[state];

  return (
    <div className={`lp-capture-pill ${className}`} data-capture-state={state}>
      <CaptureStateMark state={state} />
      <span className="lp-capture-copy">
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
      </span>
    </div>
  );
}

import { useLandingCopy } from "../../lib/landing-copy";
