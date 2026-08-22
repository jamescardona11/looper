import { containerClass } from "../lib/layout";

type SmallPrintCard = {
  readonly heading: string;
  readonly body: string;
};

const CARDS: readonly SmallPrintCard[] = [
  {
    heading: "The first run downloads a model.",
    body: "Once. After that Looper works with the network off, and a failed download resumes instead of starting over.",
  },
  {
    heading: "Cleanup is English first.",
    body: "Transcription supports multiple languages. The rewriting that fixes punctuation and filler is strongest in English today.",
  },
  {
    heading: "Phones come next.",
    body: "Desktop is ready on all three platforms. iPhone and Android are in the workshop, and sync is what will connect them.",
  },
];

/** Three caveats stated before someone has to discover them after install. */
export function SmallPrint() {
  return (
    <section
      className={`${containerClass} grid gap-8 pb-16 md:grid-cols-[0.78fr_1.22fr] md:gap-20 md:pb-28`}
    >
      <div data-reveal>
        <h2 className="max-w-[560px] text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[52px]">
          The honest small print.
        </h2>
        <p className="mt-4 max-w-[430px] text-[15px] text-ink-secondary leading-[1.65] md:text-[17px]">
          Local first has tradeoffs. They should be visible before install, not discovered after.
        </p>
      </div>

      <div data-reveal className="border-border border-t">
        {CARDS.map((card) => (
          <article
            key={card.heading}
            className="grid gap-2 border-border border-b py-5 md:grid-cols-[0.9fr_1.1fr] md:gap-8 md:py-6"
          >
            <h3 className="text-[18px] leading-[1.2] tracking-[-0.035em] md:text-[20px]">
              {card.heading}
            </h3>
            <p className="text-[14px] text-ink-secondary leading-[1.65]">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
