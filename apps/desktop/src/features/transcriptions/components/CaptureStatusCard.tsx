import { useLingui } from "@lingui/react/macro";
import AnimatedCount from "../../../shared/ui/AnimatedCount";
import type { TodayDictationStats } from "../../../types";
import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";

type CaptureStatusCardProps = {
  stats: TodayDictationStats;
  stage?: SignalStage;
  shortcut?: string;
};

export type SignalStage =
  "ready" | "listening" | "transcribing" | "writing" | "inserted" | "error";

const JOURNEY: Exclude<SignalStage, "ready" | "error">[] = [
  "listening",
  "transcribing",
  "writing",
  "inserted",
];

/**
 * La captura es el objeto protagonista de la home (patrón Otter/Fabric):
 * una superficie clara con el estado y el atajo; las métricas bajan a una
 * línea silenciosa de texto debajo, fuera de la card.
 */
const CaptureStatusCard = ({
  stats,
  stage = "ready",
  shortcut = "Fn",
}: CaptureStatusCardProps) => {
  const { t } = useLingui();
  const minutes = Math.round(stats.audioSeconds / 60);
  const shortcutKeys = formatShortcutForDisplay(shortcut).split(" + ");
  const activeIndex = JOURNEY.indexOf(
    stage as Exclude<SignalStage, "ready" | "error">,
  );
  const title =
    stage === "listening"
      ? t({ id: "home.capture.listening", message: "Listening…" })
      : stage === "transcribing"
        ? t({
            id: "home.capture.transcribing",
            message: "Transcribing locally…",
          })
        : stage === "writing"
          ? t({ id: "home.capture.writing", message: "Writing…" })
          : stage === "inserted"
            ? t({ id: "home.capture.inserted", message: "Inserted" })
            : stage === "error"
              ? t({
                  id: "home.capture.error",
                  message: "Dictation needs attention",
                })
              : t({
                  id: "home.capture.ready",
                  message: "Ready to write anywhere",
                });

  return (
    <section
      className="mb-6 shrink-0"
      aria-label={t({
        id: "home.capture.aria",
        message: "Dictation status and today's activity",
      })}
    >
      <div className="rounded-[18px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] px-5 py-4 text-[var(--ui-capture-fg)] shadow-[var(--ui-pill-shell-shadow)]">
        <div className="flex items-center gap-3.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage === "error" ? "bg-[var(--color-error)]" : stage === "ready" || stage === "inserted" ? "bg-[var(--color-success)]" : "animate-pulse bg-[var(--color-accent)]"}`}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="ui-text-body-sm font-semibold text-[var(--ui-capture-fg-strong)]">
              {title}
            </p>
            <p className="mt-0.5 ui-text-micro text-[var(--ui-capture-muted)]">
              {t({ id: "home.capture.hint.hold", message: "Hold" })}{" "}
              {shortcutKeys.map((key) => (
                <span key={key}>
                  <kbd className="rounded-md border border-[var(--ui-pill-shell-border)] bg-[var(--ui-capture-key-bg)] px-1.5 py-0.5 ui-text-micro font-medium text-[var(--ui-capture-fg)]">
                    {key}
                  </kbd>{" "}
                </span>
              ))}
              {t({
                id: "home.capture.hint.rest",
                message: "in any app · release to insert",
              })}
            </p>
          </div>
        </div>

        {activeIndex >= 0 ? (
          <ol
            className="mt-4 grid grid-cols-4"
            aria-label={t({
              id: "home.capture.journey",
              message: "Dictation progress",
            })}
          >
            {JOURNEY.map((item, index) => {
              const active = index === activeIndex;
              const done = activeIndex > index;
              return (
                <li
                  key={item}
                  aria-current={active ? "step" : undefined}
                  data-stage={item}
                  data-stage-state={
                    active ? "current" : done ? "complete" : "upcoming"
                  }
                  className={`flex items-center justify-center gap-2 rounded-lg py-1.5 text-center ui-text-micro ${active ? "bg-[var(--ui-capture-key-bg)] text-[var(--ui-capture-fg-strong)]" : done ? "text-[var(--ui-capture-fg)]" : "text-[var(--ui-capture-muted)]"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${active || done ? "bg-[var(--color-accent)]" : "bg-[var(--ui-pill-shell-border)]"}`}
                  />
                  <span>
                    {item === "listening"
                      ? t({
                          id: "home.capture.step.listening",
                          message: "Listening",
                        })
                      : item === "transcribing"
                        ? t({
                            id: "home.capture.step.transcribing",
                            message: "Transcribing",
                          })
                        : item === "writing"
                          ? t({
                              id: "home.capture.step.writing",
                              message: "Writing",
                            })
                          : t({
                              id: "home.capture.step.inserted",
                              message: "Inserted",
                            })}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}

        <p className="mt-4 flex gap-5 border-t border-[var(--ui-pill-shell-border)] pt-3 ui-text-micro text-[var(--ui-capture-muted)]">
          <span>
            <b className="font-semibold tabular-nums text-[var(--ui-capture-fg)]">
              <AnimatedCount value={stats.count} />
            </b>{" "}
            {t({ id: "home.capture.stat.dictations", message: "dictations" })}
          </span>
          <span>
            <b className="font-semibold tabular-nums text-[var(--ui-capture-fg)]">
              <AnimatedCount value={stats.words} />
            </b>{" "}
            {t({ id: "home.capture.stat.words", message: "words today" })}
          </span>
          <span>
            <b className="font-semibold tabular-nums text-[var(--ui-capture-fg)]">
              <AnimatedCount value={minutes} />
            </b>{" "}
            {t({ id: "home.capture.stat.minutes", message: "min spoken" })}
          </span>
        </p>
      </div>
    </section>
  );
};

export default CaptureStatusCard;
