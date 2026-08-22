import { containerClass } from "../lib/layout";

type FeatureCluster = {
  readonly title: string;
  readonly summary: string;
  readonly points: readonly string[];
  readonly className: string;
  readonly dark?: boolean;
};

const CLUSTERS: readonly FeatureCluster[] = [
  {
    title: "Dictation",
    summary: "Speak into the work that is already open.",
    points: [
      "Push to talk or double tap for hands free",
      "Writes into whichever app has focus",
      "Cleanup can be undone per dictation",
      "Searchable history of what you said",
    ],
    className: "bg-[var(--lp-lavender)] md:col-span-7",
  },
  {
    title: "Recording notes",
    summary: "Keep the meeting, its useful moments and the audio together.",
    points: [
      "Capture from your own computer audio",
      "Import an existing file or a YouTube link",
      "Moments stay linked to timestamps",
      "Retranscribe or translate later",
    ],
    className: "bg-[var(--lp-ink)] text-[var(--lp-paper)] md:col-span-5",
    dark: true,
  },
  {
    title: "Your words",
    summary: "Teach Looper the language you actually use.",
    points: [
      "Dictionary for names, jargon and product terms",
      "Corrections stick after you make them once",
      "Your writing style stays recognizable",
    ],
    className: "border border-border bg-card md:col-span-4",
  },
  {
    title: "Your machine",
    summary: "Local is the default architecture, not a privacy toggle.",
    points: [
      "Speech model runs on your hardware",
      "Bring your own provider when a job needs it",
      "Downloads resume instead of restarting",
      "Microphone, shortcuts and storage stay in your hands",
    ],
    className: "bg-muted md:col-span-8",
  },
];

export function Features() {
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
          One system from the first word to the useful artifact.
        </h2>
        <p className="max-w-[620px] text-[16px] text-ink-secondary leading-[1.65] md:text-[18px]">
          Dictation and recording notes are different jobs. They share the same memory, source and
          recovery model.
        </p>
      </div>

      <div data-reveal className="mt-9 grid gap-4 md:mt-12 md:grid-cols-12 md:gap-5">
        {CLUSTERS.map((cluster) => (
          <article
            key={cluster.title}
            className={`lp-lift flex min-h-[300px] flex-col rounded-[22px] p-6 md:min-h-[340px] md:rounded-[28px] md:p-8 ${cluster.className}`}
          >
            <h3 className="text-[27px] leading-none tracking-[-0.045em] md:text-[34px]">
              {cluster.title}
            </h3>
            <p
              className={`mt-3 max-w-[520px] text-[15px] leading-[1.55] md:text-[16px] ${
                cluster.dark ? "text-[#c1c3ca]" : "text-ink-secondary"
              }`}
            >
              {cluster.summary}
            </p>
            <ul
              className={`mt-auto grid gap-2.5 pt-8 text-[13px] leading-[1.55] md:text-[14px] ${
                cluster.dark ? "text-[#c1c3ca]" : "text-ink-secondary"
              }`}
            >
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
