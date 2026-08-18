import { useTranslation } from "@looper/i18n/react";
import { IconArrowUpRight, IconSparkles } from "@tabler/icons-react";
import { Eyebrow } from "@/shared/components/eyebrow";

const SUGGESTED_PROMPT_KEYS = [
  "agent.suggestedExplain",
  "agent.suggestedDraft",
  "agent.suggestedBrainstorm",
  "agent.suggestedSummarize",
] as const;

interface ChatEmptyStateProps {
  title?: string;
  hint?: string;
  // When provided, renders clickable prompt suggestions that send immediately.
  onSelectPrompt?: (text: string) => void;
}

export function ChatEmptyState({ title, hint, onSelectPrompt }: ChatEmptyStateProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("agent.emptyTitle");
  const resolvedHint = hint ?? t("agent.emptyHint");

  return (
    <div className="flex h-full select-none items-start justify-center px-4 py-5 sm:items-center sm:px-8 sm:py-10">
      <div className="w-full max-w-xl">
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm sm:mb-5">
          <IconSparkles className="size-5" aria-hidden />
        </div>
        <Eyebrow className="mb-2">{t("agent.title")}</Eyebrow>
        <h2 className="max-w-lg font-medium text-2xl text-foreground tracking-tight">
          {resolvedTitle}
        </h2>
        <p className="mt-2 max-w-md text-muted-foreground text-sm leading-relaxed">
          {resolvedHint}
        </p>

        {onSelectPrompt ? (
          <div className="mt-6 grid grid-cols-2 border-border border-t sm:mt-8">
            {SUGGESTED_PROMPT_KEYS.map((key, index) => {
              const prompt = t(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectPrompt(prompt)}
                  className="group flex min-h-24 items-start gap-2.5 border-border border-b px-3 py-4 text-left text-sm transition-colors even:border-l hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-20 sm:gap-3 sm:px-2 sm:even:pl-5 sm:odd:pr-5"
                >
                  <span className="pt-0.5 font-mono text-[10px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 font-medium text-foreground leading-snug">
                    {prompt}
                  </span>
                  <IconArrowUpRight
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
