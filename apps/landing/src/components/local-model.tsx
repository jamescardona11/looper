import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

export function LocalModel() {
  const copy = useLandingCopy();

  return (
    <section id="local" aria-labelledby="local-title" className="bg-muted">
      <div
        className={`${containerClass} grid gap-10 py-16 md:grid-cols-[1.06fr_0.94fr] md:items-center md:gap-20 md:py-28`}
      >
        <div data-reveal className="flex flex-col items-start gap-5">
          <p className="font-mono text-[11px] text-primary tracking-[0.08em] md:text-[12px]">
            {copy.local.eyebrow}
          </p>
          <h2
            id="local-title"
            className="max-w-[720px] text-[42px] leading-[0.96] tracking-[-0.055em] md:text-[66px]"
          >
            {copy.local.title}
          </h2>
          <p className="max-w-[600px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
            {copy.local.body}
          </p>
        </div>

        <aside
          data-reveal
          className="rounded-[24px] bg-[var(--lp-ink)] p-6 text-[var(--lp-paper)] md:rounded-[30px] md:p-9"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] text-[var(--lp-lavender-strong)] tracking-[0.08em]">
                {copy.local.model}
              </p>
              <h3 className="mt-3 text-[27px] tracking-[-0.04em] md:text-[34px]">
                Parakeet TDT V3
              </h3>
            </div>
            <span className="inline-flex items-center gap-2 font-mono text-[#bfc0c7] text-[11px]">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#31a486]" />
              {copy.local.ready}
            </span>
          </div>

          <dl className="mt-8 border-[#34353d] border-t">
            <div className="grid gap-2 border-[#34353d] border-b py-5 md:grid-cols-[0.8fr_1.2fr]">
              <dt className="font-medium text-[14px]">{copy.local.transcription}</dt>
              <dd className="text-[#bfc0c7] text-[13px] leading-[1.55]">
                {copy.local.transcriptionDetail}
              </dd>
            </div>
            <div className="grid gap-2 py-5 md:grid-cols-[0.8fr_1.2fr]">
              <dt className="font-medium text-[14px]">{copy.local.storage}</dt>
              <dd className="text-[#bfc0c7] text-[13px] leading-[1.55]">
                {copy.local.storageDetail}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
