import { SignalRail } from "../pill/SignalRail";

const waveformHeights = [8, 16, 24, 13, 30, 21, 12, 25];

export default function SignalPreviewFloating() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-preview-canvas)] p-16 text-[var(--color-preview-primary)]">
      <div className="mx-auto max-w-[860px] rounded-xl bg-[var(--surface-preview-document)] px-16 py-14 shadow-[var(--shadow-preview-document)] ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-[var(--color-preview-border)] pb-5 text-[13px] text-[var(--color-preview-secondary)]">
          <span>Notes</span>
          <span>Today</span>
        </div>
        <p className="mt-12 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-preview-secondary)]">
          Product review
        </p>
        <h1 className="mt-3 max-w-[18ch] text-[38px] font-semibold leading-[1.05] tracking-[-0.055em]">
          Capture the thought before it disappears.
        </h1>
        <div className="mt-12 space-y-5 text-[16px] leading-7 text-[var(--color-preview-body)]">
          <p>
            The floating control stays above the work without turning into a
            second application.
          </p>
          <p>
            Release the shortcut when the sentence is complete. Looper will
            insert the transcription where the cursor is waiting.
          </p>
        </div>
      </div>

      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <SignalRail
          ariaLabel="Listening"
          dragTitle="Drag voice control"
          className="!w-[260px]"
          signal={
            <span className="flex h-6 items-center gap-1" aria-hidden="true">
              {waveformHeights.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="w-0.5 rounded-full bg-[var(--color-accent)]"
                  style={{ height }}
                />
              ))}
            </span>
          }
          title="Listening · 00:12"
          meta="Release ⌥ to finish"
          progress={64}
        />
      </div>
    </div>
  );
}
