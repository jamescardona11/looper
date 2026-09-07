import { useLandingCopy } from "../../lib/landing-copy";
import { containerClass } from "../../lib/layout";

export function SourceBehindTheText() {
  const copy = useLandingCopy();

  return (
    <section aria-labelledby="source-behind-the-text-title" className="bg-[var(--lp-lavender)]">
      <div
        className={`${containerClass} grid gap-10 py-16 md:grid-cols-[1.05fr_0.95fr] md:gap-20 md:py-24`}
      >
        <div data-reveal className="flex flex-col gap-5">
          <h2
            id="source-behind-the-text-title"
            className="max-w-[720px] text-[42px] leading-[0.96] tracking-[-0.055em] md:text-[66px]"
          >
            {copy.source.title}
          </h2>
          <p className="max-w-[580px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
            {copy.source.body}
          </p>
        </div>

        <dl data-reveal className="self-end border-foreground/20 border-t">
          {copy.source.principles.map((principle) => (
            <div
              key={principle.term}
              className="grid gap-2 border-foreground/20 border-b py-5 md:grid-cols-[0.72fr_1.28fr] md:gap-7"
            >
              <dt className="font-display font-semibold text-[17px] tracking-[-0.03em]">
                {principle.term}
              </dt>
              <dd className="text-[14px] text-ink-secondary leading-[1.6]">{principle.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
