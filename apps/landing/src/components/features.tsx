import type { ReactNode } from "react";
import { containerClass } from "../lib/layout";

/*
 * "Everything that ships on day one": a 2x2 board of four feature clusters on
 * desktop, a single stack on mobile, with cards 2 and 3 tinted so the board
 * reads as a checkerboard rather than four identical boxes.
 *
 * COLOR and MOTION are both fully shared now: the greys are the --ink-* roles in
 * src/styles/index.css and .lp-reveal / .lp-lift live there too. This file
 * previously carried its own copy of the keyframe, byte-identical to the one in
 * local-model.tsx.
 */

/* Card surface. The hover lift is `.lp-lift`, shared with the destination rows in
   beat one and the small-print cards; this file used to re-implement it inline.
   Radii are explicit px rather than the rounded-* scale: index.css rebuilds
   that scale from --radius, so rounded-xl is 14px and rounded-2xl is 18px. The
   design asks for 14px and 16px here, so a named step would be quietly wrong. */
const cardClass =
  "lp-lift flex flex-col gap-3.5 rounded-[14px] border border-border p-5.5 md:gap-5 md:rounded-[16px] md:p-8";

type FeatureCluster = {
  readonly title: string;
  readonly icon: ReactNode;
  readonly points: readonly string[];
  /* Cards 2 and 3 carry the subtle surface. Stored rather than derived from the
     index so the checkerboard survives anyone reordering the array. */
  readonly tinted: boolean;
};

/* One <svg> definition, four sets of paths. The icon repeats the h3 next to
   it, so it is decorative and hidden from assistive tech. Mobile drops it
   entirely, matching the Mobile artboard. */
function ClusterIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="hidden shrink-0 text-accent md:block"
    >
      {children}
    </svg>
  );
}

const clusters: readonly FeatureCluster[] = [
  {
    title: "Dictation",
    icon: (
      <ClusterIcon>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v3" />
      </ClusterIcon>
    ),
    points: [
      "Push to talk, or double tap for hands free",
      "Writes into whatever app has focus",
      "A floating bar you can put wherever you like",
      "Cleanup that you can undo per dictation",
      "Searchable history of everything you said",
    ],
    tinted: false,
  },
  {
    title: "Recording notes",
    icon: (
      <ClusterIcon>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
      </ClusterIcon>
    ),
    points: [
      "Capture a meeting from your own audio",
      "A heads up before a scheduled call starts",
      "Import a file you already have, or a YouTube link",
      "Moments with timestamps, next to the player",
      "Retranscribe or translate a recording later",
    ],
    tinted: true,
  },
  {
    title: "Your words",
    icon: (
      <ClusterIcon>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </ClusterIcon>
    ),
    points: [
      "A dictionary for names, jargon and product terms",
      "Corrections that stick after you make them once",
      "Tell it how you write, and it writes that way",
      "Ask what you already said, across everything",
    ],
    tinted: true,
  },
  {
    title: "Your machine",
    icon: (
      <ClusterIcon>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </ClusterIcon>
    ),
    points: [
      "A speech model that runs locally",
      "Or your own provider, if you would rather",
      "Downloads that resume instead of restarting",
      "Microphone, shortcuts and storage in your hands",
      "Privacy settings that default to keeping things in",
    ],
    tinted: false,
  },
];

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={`${containerClass} flex flex-col gap-3.5 pb-12 md:block md:pb-[104px]`}
    >
      <div className="lp-rise flex flex-col gap-3.5 md:mb-9 md:max-w-[600px] md:gap-4">
        <h2
          id="features-title"
          className="text-[31px] leading-[1.06] tracking-[-0.045em] md:text-[44px] md:leading-[1.04] md:tracking-tighter"
        >
          Everything that ships on day one.
        </h2>
        <p className="text-[15px] text-ink-secondary leading-[1.6] md:text-[17px]">
          Four groups, and each one is finished software rather than a promise on a roadmap.
        </p>
      </div>

      <div className="lp-stagger mt-2.5 flex flex-col gap-3 md:mt-0 md:grid md:grid-cols-2 md:gap-5">
        {clusters.map((cluster) => (
          <article
            key={cluster.title}
            className={cluster.tinted ? `${cardClass} bg-muted` : cardClass}
          >
            <div className="flex items-center gap-[11px]">
              {cluster.icon}
              <h3 className="text-[19px] leading-[1.2] tracking-[-0.045em] md:text-[21px] md:tracking-tighter">
                {cluster.title}
              </h3>
            </div>
            <ul className="grid gap-2.5 text-[14px] text-ink-secondary leading-[1.5] md:gap-[13px] md:text-[15px]">
              {cluster.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
