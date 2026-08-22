import { containerClass } from "../lib/layout";

export function Pricing() {
  return (
    <section
      aria-labelledby="pricing-title"
      className={`${containerClass} pb-16 md:pb-28`}
      id="pricing"
    >
      <div data-reveal className="flex max-w-[720px] flex-col gap-4">
        <p className="font-mono text-[11px] text-primary tracking-[0.08em] md:text-[12px]">
          PRICING
        </p>
        <h2
          className="text-[42px] leading-[0.96] tracking-[-0.055em] md:text-[66px]"
          id="pricing-title"
        >
          Free where your own hardware does the work.
        </h2>
      </div>

      <div
        data-reveal
        className="mt-9 grid gap-4 lg:mt-12 lg:grid-cols-[1.14fr_0.86fr] lg:gap-5"
      >
        <article className="flex min-h-[380px] flex-col rounded-[24px] bg-[var(--lp-ink)] p-6 text-[var(--lp-paper)] md:rounded-[30px] md:p-9">
          <p className="text-[#bfc0c7] text-[14px]">Local</p>
          <p className="mt-4 font-display font-semibold text-[70px] leading-none tracking-[-0.065em] md:text-[94px]">
            Free
          </p>
          <p className="mt-5 max-w-[620px] text-[#c1c3ca] text-[15px] leading-[1.65] md:text-[17px]">
            Unlimited local dictation, recording notes, dictionary, cleanup and searchable history.
            No server is counting your words.
          </p>
          <p className="mt-auto pt-10 font-mono text-[11px] text-[var(--lp-lavender-strong)] tracking-[0.05em]">
            macOS, Windows and Linux
          </p>
        </article>

        <aside className="flex flex-col rounded-[24px] bg-[var(--lp-lavender)] p-6 md:rounded-[30px] md:p-9">
          <h3 className="text-[27px] tracking-[-0.045em] md:text-[34px]">What may cost later</h3>
          <p className="mt-3 text-[14px] text-ink-secondary leading-[1.6] md:text-[15px]">
            Only the work that genuinely needs infrastructure beyond your machine.
          </p>
          <dl className="mt-8 border-foreground/20 border-t">
            <div className="border-foreground/20 border-b py-5">
              <dt className="font-medium text-[15px]">Cloud model</dt>
              <dd className="mt-1 text-[13px] text-ink-secondary leading-[1.55]">
                An explicit switch for long or difficult recordings.
              </dd>
            </div>
            <div className="py-5">
              <dt className="font-medium text-[15px]">Sync across devices</dt>
              <dd className="mt-1 text-[13px] text-ink-secondary leading-[1.55]">
                Paid once mobile arrives and a server has real work to do.
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
