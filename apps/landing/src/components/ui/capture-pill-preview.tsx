type CaptureState = "listening" | "transcribing" | "inserted";

type CapturePillPreviewProps = {
  readonly className?: string;
  readonly state?: CaptureState;
};

const captureWaveform = [7, 14, 18, 11, 15, 6];

const COPY: Record<CaptureState, { readonly detail: string; readonly title: string }> = {
  listening: {
    title: "Listening · 00:12",
    detail: "Release Fn to transcribe",
  },
  transcribing: {
    title: "Transcribing",
    detail: "Turning audio into text",
  },
  inserted: {
    title: "Inserted",
    detail: "Ready in your current app",
  },
};

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

export function CapturePillPreview({ className = "", state = "listening" }: CapturePillPreviewProps) {
  const copy = COPY[state];

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
