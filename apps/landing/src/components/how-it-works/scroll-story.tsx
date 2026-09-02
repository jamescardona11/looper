import { useTranslation } from "@looper/i18n/react";
import { useLandingCopy } from "../../lib/landing-copy";
import { containerClass } from "../../lib/layout";
import { CapturePillPreview } from "../ui/capture-pill-preview";

export function ScrollStory() {
  const { locale } = useTranslation();
  const copy = useLandingCopy();
  const steps = copy.story.steps.map((step, index) => ({
    ...step,
    number: `0${index + 1}`,
  }));

  return (
    <section
      aria-labelledby="scroll-story-title"
      className="hidden lg:block"
      data-scroll-story
      data-story-active="0"
    >
      <div className={`${containerClass} py-28`}>
        <div data-reveal className="max-w-[760px]">
          <p className="font-mono text-[11px] text-primary tracking-[0.08em]">
            {copy.story.eyebrow}
          </p>
          <h2
            id="scroll-story-title"
            className="mt-4 text-[66px] leading-[0.96] tracking-[-0.055em]"
          >
            {copy.story.title}
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-[0.72fr_1.28fr] gap-20 xl:gap-24">
          <ol className="m-0 list-none p-0">
            {steps.map((step, index) => (
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
                    src={`/looper-workspace-purple-${locale}.png`}
                    alt=""
                    width="1350"
                    height="830"
                    className="lp-story-image block h-auto w-full rounded-[21px]"
                    data-story-image="workspace"
                  />
                  <img
                    src={`/looper-note-detail-purple-${locale}.png`}
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
                      <strong>{copy.story.ready}</strong>
                      <small>{copy.story.sourceAttached}</small>
                    </span>
                  </div>
                </div>
              </div>

              <CapturePillPreview className="lp-story-pill lp-story-pill-0" />
              <CapturePillPreview className="lp-story-pill lp-story-pill-1" state="transcribing" />
              <CapturePillPreview className="lp-story-pill lp-story-pill-2" state="inserted" />
            </div>
            <figcaption className="mt-3 ml-5 max-w-[620px] text-[13px] text-ink-muted leading-[1.55]">
              {copy.story.caption}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
