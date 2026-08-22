import { useLingui } from "@lingui/react/macro";
import { formatShortcutForDisplay } from "../../../shared/lib/shortcuts";

type CaptureStatusCardProps = {
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
 * La home confirma que el atajo está listo. La enseñanza y las métricas viven
 * fuera de este estado diario: el onboarding explica el gesto una vez y cada
 * captura conserva sus propios detalles en Dictation.
 */
const CaptureStatusCard = ({
  stage = "ready",
  shortcut = "Fn",
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
                  id: "home.capture.ready_daily",
                  message: "Dictation is ready",
                });

  return (
    <section
      className="mb-6 shrink-0"
      aria-label={t({
        id: "home.capture.aria",
        message: "Dictation status and today's activity",
      })}
    >
      <div className="rounded-[18px] border border-[var(--ui-pill-shell-border)] bg-[var(--ui-pill-shell-bg)] px-6 py-5 text-[var(--ui-capture-fg)] shadow-[var(--ui-pill-shell-shadow)]">
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
      </div>
    </section>
  );
};

export default CaptureStatusCard;
