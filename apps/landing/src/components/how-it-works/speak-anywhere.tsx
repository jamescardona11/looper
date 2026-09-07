import { useLandingCopy } from "../../lib/landing-copy";
import { containerClass } from "../../lib/layout";

export function SpeakAnywhere() {
  const copy = useLandingCopy();

  return (
    <section
      aria-labelledby="speak-anywhere-title"
      className={`${containerClass} grid gap-9 py-16 md:grid-cols-[0.84fr_1.16fr] md:items-center md:gap-16 md:py-28 xl:gap-24`}
    >
      <div data-reveal className="flex flex-col gap-5">
        <h2
          id="speak-anywhere-title"
          className="max-w-[620px] text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[58px]"
        >
          {copy.speak.title}
        </h2>
        <p className="max-w-[500px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
          {copy.speak.body}
        </p>
      </div>

      <div
        data-reveal
        className="rounded-[24px] bg-[var(--lp-ink)] p-6 text-[var(--lp-paper)] md:rounded-[30px] md:p-9"
      >
        <p className="font-mono text-[11px] text-[var(--lp-lavender-strong)] tracking-[0.08em]">
          {copy.speak.eyebrow}
        </p>
        <p className="mt-4 max-w-[520px] font-display font-semibold text-[30px] leading-[1.02] tracking-[-0.045em] md:text-[42px]">
          {copy.speak.command}
        </p>
        <dl className="mt-8">
          {copy.speak.contexts.map((context) => (
            <div
              key={context.surface}
              className="grid gap-1 border-[var(--lp-paper)]/15 border-b py-4 last:border-b-0 md:grid-cols-[0.72fr_1.28fr] md:gap-6"
            >
              <dt className="font-medium text-[14px]">{context.surface}</dt>
              <dd className="text-[#b9bbc3] text-[13px] leading-[1.55] md:text-[14px]">
                {context.treatment}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
