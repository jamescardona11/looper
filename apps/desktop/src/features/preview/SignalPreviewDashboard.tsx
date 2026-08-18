import {
  BookBookmark,
  BookOpen,
  CaretRight,
  MagnifyingGlass,
  Waveform,
} from "@phosphor-icons/react";
import { LooperLogo } from "../../shared/ui/LooperLogo";

const recentDictations = [
  {
    time: "14:38",
    text: "Let’s keep the dashboard quiet, then make the active voice impossible to miss.",
    mode: "Cloud",
  },
  {
    time: "14:32",
    text: "Send the research notes to Ana and ask for feedback by Thursday.",
    mode: "Cloud",
  },
  {
    time: "13:08",
    text: "Remember to call the dentist after lunch.",
    mode: "Local",
  },
  {
    time: "11:41",
    text: "The product review is moved to Friday morning.",
    mode: "Local",
  },
];

const waveformHeights = [12, 22, 30, 17, 40, 26, 16, 33, 23, 12, 27, 18];

export default function SignalPreviewDashboard() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <aside
        data-app-sidebar
        className="flex w-[236px] shrink-0 flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-5 pb-6 text-[var(--color-text-secondary)]"
      >
        <div data-tauri-drag-region className="h-10 shrink-0" />
        <div className="flex items-center gap-3 px-2">
          <LooperLogo size="md" />
          <span className="text-[17px] font-semibold tracking-[-0.04em]">
            Looper
          </span>
        </div>

        <nav className="mt-10 space-y-1 text-[13px] font-medium">
          <a
            className="flex items-center gap-3 rounded-lg bg-[var(--color-accent-10)] px-3 py-2.5 text-[var(--color-accent)]"
            href="#home"
          >
            <Waveform size={16} weight="bold" />
            Dictations
          </a>
          <a
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[var(--color-text-secondary)]"
            href="#library"
          >
            <BookBookmark size={16} />
            Library
          </a>
          <a
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[var(--color-text-secondary)]"
            href="#dictionary"
          >
            <BookOpen size={16} />
            Dictionary
          </a>
        </nav>

        <div className="mt-auto rounded-xl bg-[var(--color-bg-primary)] p-4 ring-1 ring-[var(--color-border-primary)]">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
            Ready to dictate
          </div>
          <div className="mt-3 flex items-center justify-between text-[13px]">
            <span className="text-[var(--color-text-secondary)]">Hold</span>
            <kbd className="rounded-md bg-[var(--color-bg-tertiary)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-primary)]">
              ⌥ Space
            </kbd>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div data-tauri-drag-region className="h-10" />
        <div className="px-12 pb-10">
          <header className="flex items-start justify-between border-b-2 border-[var(--color-text-primary)] pb-6">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                Tuesday, July 21
              </p>
              <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.05em]">
                Dictations
              </h1>
              <p className="mt-1 text-[14px] text-[var(--color-text-secondary)]">
                Four thoughts captured and inserted today.
              </p>
            </div>
            <button className="flex items-center gap-2 rounded-full border border-[var(--color-border-secondary)] bg-[var(--color-surface-primary)] px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)]">
              <MagnifyingGlass size={16} /> Search{" "}
              <span className="text-[var(--color-text-tertiary)]">⌘ K</span>
            </button>
          </header>

          <section className="mt-8 grid grid-cols-[minmax(0,1.25fr)_minmax(330px,0.8fr)] gap-10">
            <article className="rounded-2xl bg-[var(--color-bg-surface)] p-7 ring-1 ring-[var(--color-border-primary)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                  <Waveform
                    size={17}
                    weight="bold"
                    className="text-[var(--color-accent-dark)]"
                  />
                  Most recent
                </div>
                <span className="rounded-full bg-[var(--color-cloud)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-cloud-dark)]">
                  Cloud · inserted
                </span>
              </div>
              <p className="mt-7 max-w-[25ch] text-[29px] font-medium leading-[1.13] tracking-[-0.05em] text-[var(--color-text-primary)]">
                “Let’s keep the dashboard quiet, then make the active voice
                impossible to miss.”
              </p>
              <div
                className="mt-7 flex h-10 items-center gap-1.5"
                aria-hidden="true"
              >
                {waveformHeights.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className="w-1 rounded-full bg-[var(--color-cloud)]"
                    style={{ height }}
                  />
                ))}
                <span className="ml-3 h-px flex-1 bg-[var(--color-border-secondary)]" />
                <span className="ml-3 text-[11px] font-mono text-[var(--color-text-tertiary)]">
                  00:07
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border-primary)] pt-5 text-[13px]">
                <span className="text-[var(--color-text-secondary)]">
                  14:38 · 13 words · English
                </span>
                <button className="flex items-center gap-1 font-semibold text-[var(--color-accent-dark)]">
                  Open transcript <CaretRight size={15} />
                </button>
              </div>
            </article>

            <section className="border-t border-[var(--color-border-secondary)] pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
                  Today
                </h2>
                <span className="text-[12px] text-[var(--color-text-tertiary)]">
                  4 dictations
                </span>
              </div>
              <div className="mt-5 space-y-1">
                {recentDictations.map((dictation) => (
                  <button
                    key={dictation.time}
                    className="group w-full border-b border-[var(--color-border-primary)] px-2 py-3 text-left last:border-b-0 hover:bg-[var(--color-bg-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="line-clamp-2 text-[14px] leading-5 text-[var(--color-text-secondary)]">
                        {dictation.text}
                      </p>
                      <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-tertiary)]">
                        {dictation.time}
                      </span>
                    </div>
                    <span
                      className={`mt-2 inline-block text-[11px] font-semibold ${dictation.mode === "Cloud" ? "text-[var(--color-cloud-dark)]" : "text-[var(--color-local)]"}`}
                    >
                      {dictation.mode}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <section className="mt-8 border-t border-[var(--color-border-primary)] pt-5">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">
                Recent activity
              </p>
              <button className="text-[13px] font-semibold text-[var(--color-accent-dark)]">
                See all <CaretRight className="inline" size={15} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 divide-x divide-[var(--color-border-primary)]">
              <div className="pr-6 text-[13px] text-[var(--color-text-secondary)]">
                <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                  10:16
                </span>
                <p className="mt-1">Meeting follow-up inserted in Notes.</p>
              </div>
              <div className="pl-6 text-[13px] text-[var(--color-text-secondary)]">
                <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                  Yesterday
                </span>
                <p className="mt-1">Four local dictations completed offline.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
