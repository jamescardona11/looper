import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

/** Three caveats stated before someone has to discover them after install. */
export function SmallPrint() {
  const copy = useLandingCopy();

  return (
    <section
      className={`${containerClass} grid gap-8 pb-16 md:grid-cols-[0.78fr_1.22fr] md:gap-20 md:pb-28`}
    >
      <div data-reveal>
        <h2 className="max-w-[560px] text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[52px]">
          {copy.smallPrint.title}
        </h2>
        <p className="mt-4 max-w-[430px] text-[15px] text-ink-secondary leading-[1.65] md:text-[17px]">
          {copy.smallPrint.body}
        </p>
      </div>

      <div data-reveal className="border-border border-t">
        {copy.smallPrint.cards.map((card) => (
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
