import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

type FeatureCluster = {
  readonly className: string;
  readonly dark?: boolean;
};

const CLUSTER_LAYOUT: readonly FeatureCluster[] = [
  {
    className: "bg-[var(--lp-lavender)] md:col-span-7",
  },
  {
    className: "bg-[var(--lp-ink)] text-[var(--lp-paper)] md:col-span-5",
    dark: true,
  },
  {
    className: "border border-border bg-card md:col-span-4",
  },
  {
    className: "bg-muted md:col-span-8",
  },
];

export function Features() {
  const copy = useLandingCopy();

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={`${containerClass} py-16 md:py-28`}
    >
      <div data-reveal className="flex max-w-[760px] flex-col gap-4">
        <h2
          id="features-title"
          className="text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[58px]"
        >
          {copy.features.title}
        </h2>
        <p className="max-w-[620px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
          {copy.features.body}
        </p>
      </div>

      <div data-reveal className="mt-9 grid gap-4 md:mt-12 md:grid-cols-12 md:gap-5">
        {CLUSTER_LAYOUT.map((layout, index) => {
          const cluster = copy.features.clusters[index];
          if (!cluster) return null;
          return (
            <article
              key={cluster.title}
              className={`lp-lift flex min-h-[300px] flex-col rounded-[22px] p-6 md:min-h-[340px] md:rounded-[28px] md:p-8 ${layout.className}`}
            >
              <h3 className="text-[27px] leading-none tracking-[-0.045em] md:text-[34px]">
                {cluster.title}
              </h3>
              <p
                className={`mt-3 max-w-[520px] text-[15px] leading-[1.55] md:text-[16px] ${
                  layout.dark ? "text-[#c1c3ca]" : "text-ink-secondary"
                }`}
              >
                {cluster.summary}
              </p>
              <ul
                className={`mt-auto grid gap-2.5 pt-8 text-[13px] leading-[1.55] md:text-[14px] ${
                  layout.dark ? "text-[#c1c3ca]" : "text-ink-secondary"
                }`}
              >
                {cluster.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
