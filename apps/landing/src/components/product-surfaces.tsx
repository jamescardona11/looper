import { useTranslation } from "@looper/i18n/react";
import { useLandingCopy } from "../lib/landing-copy";
import { containerClass } from "../lib/layout";

const mobileSurfaces = [
  {
    src: "/looper-store-home",
    className: "lg:translate-y-10",
  },
  {
    src: "/looper-store-meeting",
    className: "",
  },
  {
    src: "/looper-store-library",
    className: "lg:translate-y-16",
  },
  {
    src: "/looper-store-studio",
    className: "lg:translate-y-5",
  },
];

const webSurfaces = [
  {
    src: "/looper-web-home-campaign",
  },
  {
    src: "/looper-web-meeting-campaign",
  },
  {
    src: "/looper-web-studio-campaign",
  },
  {
    src: "/looper-web-note-campaign",
  },
];

export function ProductSurfaces() {
  const { locale } = useTranslation();
  const copy = useLandingCopy();

  return (
    <section
      id="surfaces"
      aria-labelledby="product-surfaces-title"
      className={`${containerClass} overflow-hidden py-16 md:py-28`}
    >
      <div data-reveal className="flex max-w-[760px] flex-col gap-5">
        <h2
          id="product-surfaces-title"
          className="text-[39px] leading-[0.98] tracking-[-0.05em] md:text-[58px]"
        >
          {copy.surfaces.title}
        </h2>
        <p className="max-w-[620px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
          {copy.surfaces.body}
        </p>
      </div>

      <div data-reveal className="-mx-5 mt-10 px-5 md:-mx-8 md:mt-14 md:px-8 xl:-mx-14 xl:px-14">
        <ol
          aria-label={copy.surfaces.mobileLabel}
          className="grid snap-x snap-mandatory auto-cols-[minmax(76vw,320px)] grid-flow-col items-start gap-4 overflow-x-auto pb-5 md:auto-cols-[minmax(280px,0.8fr)] md:gap-5 lg:grid-flow-row lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:pb-16"
        >
          {mobileSurfaces.map((surface, index) => (
            <li key={surface.src} className={`snap-start ${surface.className}`}>
              <img
                src={`${surface.src}-${locale}.png`}
                alt={copy.surfaces.mobileAlts[index]}
                width="1320"
                height="2868"
                loading="lazy"
                className="block h-auto w-full rounded-[20px] border border-border/70 bg-[var(--lp-raised)] shadow-[0_24px_70px_rgb(50_42_85/0.12)]"
              />
            </li>
          ))}
        </ol>
      </div>

      <div data-reveal className="mt-14 border-border border-t pt-10 md:mt-24 md:pt-14">
        <div className="max-w-[620px]">
          <h3 className="text-[28px] leading-[1.05] tracking-[-0.04em] md:text-[38px]">
            {copy.surfaces.webTitle}
          </h3>
          <p className="mt-4 text-[15px] text-ink-secondary leading-[1.65] md:text-[17px]">
            {copy.surfaces.webBody}
          </p>
        </div>

        <div className="-mx-5 mt-8 px-5 md:-mx-8 md:mt-10 md:px-8 xl:-mx-14 xl:px-14">
          <ol
            aria-label={copy.surfaces.webLabel}
            className="grid snap-x snap-mandatory auto-cols-[minmax(88vw,680px)] grid-flow-col gap-4 overflow-x-auto pb-6 md:auto-cols-[minmax(78vw,980px)] md:gap-6 xl:auto-cols-[minmax(900px,0.88fr)]"
          >
            {webSurfaces.map((surface, index) => (
              <li key={surface.src} className="snap-start">
                <img
                  src={`${surface.src}-${locale}.png`}
                  alt={copy.surfaces.webAlts[index]}
                  width="2400"
                  height="1500"
                  loading="lazy"
                  className="block h-auto w-full rounded-[18px] border border-border/70 bg-[var(--lp-raised)] md:rounded-[24px]"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
