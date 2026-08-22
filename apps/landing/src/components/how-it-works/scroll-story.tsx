import { containerClass } from "../../lib/layout";
import { CapturePillPreview } from "../ui/capture-pill-preview";

const STORY_STEPS = [
  {
    number: "01",
    label: "LISTENING",
    title: "Speak where the work already is.",
    body: "Hold the shortcut and keep your cursor in the editor, message or prompt that needs the words.",
  },
  {
    number: "02",
    label: "TRANSCRIBING",
    title: "Looper turns the audio into useful text.",
    body: "The local model transcribes first, then cleanup removes filler without erasing your original words.",
  },
  {
    number: "03",
    label: "INSERTED",
    title: "The result lands with its source intact.",
    body: "Use the finished note, jump back to the exact moment, or undo the cleanup when the first pass is wrong.",
  },
] as const;

export function ScrollStory() {
  return (
    <section
      aria-labelledby="scroll-story-title"
      className="hidden lg:block"
      data-scroll-story
      data-story-active="0"
    >
      <div className={`${containerClass} py-28`}>
        <div data-reveal className="max-w-[760px]">
          <p className="font-mono text-[11px] text-primary tracking-[0.08em]">HOW LOOPER MOVES</p>
          <h2
            id="scroll-story-title"
            className="mt-4 text-[66px] leading-[0.96] tracking-[-0.055em]"
          >
            From voice to work, without a detour.
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-[0.72fr_1.28fr] gap-20 xl:gap-24">
          <ol className="m-0 list-none p-0">
            {STORY_STEPS.map((step, index) => (
              <li
                key={step.label}
                className="lp-story-step flex min-h-[62vh] items-center border-border border-t py-14 last:border-b"
                data-story-step={index}
                data-story-active={index === 0 ? "true" : "false"}
              >
                <div className="grid grid-cols-[42px_1fr] gap-5">
                  <span className="font-mono text-[11px] text-ink-muted">{step.number}</span>
                  <div>
                    <p className="font-mono text-[11px] text-primary tracking-[0.08em]">
                      {step.label}
                    </p>
                    <h3 className="mt-4 max-w-[520px] text-[38px] leading-[1] tracking-[-0.05em]">
                      {step.title}
                    </h3>
                    <p className="mt-4 max-w-[470px] text-[16px] text-ink-secondary leading-[1.65]">
                      {step.body}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <figure data-reveal className="sticky top-[108px] m-0 h-fit pt-14">
            <div className="lp-product-stage">
              <div className="lp-product-frame overflow-hidden rounded-[28px]">
                <div className="lp-story-image-stack">
                  <img
                    src="/looper-workspace-purple.png"
                    alt=""
                    width="1350"
                    height="830"
                    className="lp-story-image block h-auto w-full rounded-[21px]"
                    data-story-image="workspace"
                  />
                  <img
                    src="/looper-note-detail-purple.png"
                    alt=""
                    width="1350"
                    height="830"
                    loading="lazy"
                    className="lp-story-image block h-auto w-full rounded-[21px]"
                    data-story-image="note"
                  />
                  <div className="lp-story-result-card" aria-hidden="true">
                    <span className="lp-story-result-check">✓</span>
                    <span>
                      <strong>Note ready</strong>
                      <small>Source audio stays attached</small>
                    </span>
                  </div>
                </div>
              </div>

              <CapturePillPreview className="lp-story-pill lp-story-pill-0" />
              <CapturePillPreview className="lp-story-pill lp-story-pill-1" state="transcribing" />
              <CapturePillPreview className="lp-story-pill lp-story-pill-2" state="inserted" />
            </div>
            <figcaption className="mt-3 ml-5 max-w-[620px] text-[13px] text-ink-muted leading-[1.55]">
              The capture pill shows exactly what Looper is doing while the workspace keeps the
              source beside the result.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
