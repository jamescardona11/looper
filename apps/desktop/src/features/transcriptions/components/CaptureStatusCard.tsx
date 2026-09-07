import { useLingui } from "@lingui/react/macro";
import AnimatedCount from "../../../shared/ui/AnimatedCount";
import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";
import {
  EMPTY_WEEKLY_DICTATION_ACTIVITY,
  type WeeklyDictationActivity,
} from "../todayStats";

type CaptureStatusCardProps = {
  stage?: SignalStage;
  shortcut?: string;
  weeklyActivity?: WeeklyDictationActivity;
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
 * una superficie clara con el estado, el atajo y la señal semanal, sin
 * repetir las mismas métricas en un pie secundario.
 */
const CaptureStatusCard = ({
  stage = "ready",
  shortcut = "Fn",
  weeklyActivity = EMPTY_WEEKLY_DICTATION_ACTIVITY,
}: CaptureStatusCardProps) => {
  const { t } = useLingui();
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
      className="shrink-0"
      aria-label={t({
        id: "home.capture.aria",
        message: "Dictation status and weekly activity",
      })}
    >
      <div className="min-h-[211px] rounded-[26px] bg-[var(--desktop-highlight)] px-7 py-[26px] text-[var(--color-text-primary)]">
        <div className="grid grid-cols-[minmax(0,1fr)_190px] items-end gap-8">
          <div className="min-w-0">
            <p className="ui-text-uppercase-micro text-[var(--color-text-secondary)]">
              {t({ id: "home.capture.week", message: "This week" })}
            </p>
            <div className="mt-3 grid gap-0.5" data-capture-metric>
              <strong className="font-display ui-text-capture-metric font-semibold tracking-normal">
                <AnimatedCount value={weeklyActivity.words} />
              </strong>
              <span className="ui-text-capture-label font-bold text-[var(--color-text-secondary)]">
                {t({
                  id: "home.capture.words_captured",
                  message: "words captured",
                })}
              </span>
            </div>
            <p className="mt-2.5 max-w-[300px] ui-text-body-sm text-[var(--color-text-secondary)]">
              {t({
                id: "home.capture.summary",
                message: "From your apps, keyboard and meetings.",
              })}
            </p>
            <div className="mt-[17px] flex min-w-0 items-center gap-2.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${stage === "error" ? "bg-[var(--color-error)]" : stage === "ready" || stage === "inserted" ? "bg-[var(--color-accent)]" : "animate-pulse bg-[var(--color-accent)]"}`}
                aria-hidden="true"
              />
              <p className="truncate ui-text-label font-semibold text-[var(--color-text-primary)]">
                {title}
              </p>
              <span className="hidden min-w-0 truncate ui-text-micro text-[var(--color-text-secondary)] sm:inline">
                · {t({ id: "home.capture.hint.hold", message: "Hold" })}{" "}
                {shortcutKeys.map((key) => (
                  <kbd
                    className="mx-0.5 rounded-md bg-[var(--color-bg-primary)] px-1.5 py-0.5 ui-text-micro font-medium text-[var(--color-text-primary)]"
                    key={key}
                  >
                    {key}
                  </kbd>
                ))}
                {t({
                  id: "home.capture.hint.rest",
                  message: "in any app · release to insert",
                })}
              </span>
            </div>
          </div>
          <div
            className="flex h-[113px] items-start gap-1.5"
            aria-hidden="true"
          >
            {weeklyActivity.days.map(({ day, height, words }, index) => (
              <span
                className="flex h-[113px] w-[13px] shrink-0 flex-col items-center"
                data-day={day}
                key={day}
                title={`${words} words`}
              >
                <span className="flex h-24 w-full items-end">
                  <span
                    className={
                      words > 0 && index < 5
                        ? "w-full rounded-[4px] bg-[var(--color-toggle-on)]"
                        : words > 0
                          ? "w-full rounded-[4px] bg-[var(--color-toggle-on)]/25"
                          : "w-full rounded-[4px] bg-[var(--color-toggle-on)]/15"
                    }
                    style={{ height: height > 0 ? `${height}%` : "4px" }}
                  />
                </span>
                <span className="mt-1 ui-text-micro font-bold text-[var(--color-text-secondary)] opacity-50">
                  {day}
                </span>
              </span>
            ))}
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
                  className={`flex items-center justify-center gap-2 rounded-lg py-1.5 text-center ui-text-micro ${active ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]" : done ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${active || done ? "bg-[var(--color-accent)]" : "bg-[var(--color-accent-20)]"}`}
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
      </div>
    </section>
  );
};

export default CaptureStatusCard;
