import { useTranslation } from "@looper/i18n/react";
import { IconSparkles } from "@tabler/icons-react";
import { Eyebrow } from "@/shared/components/eyebrow";

export function ChatLoadingState() {
  const { t } = useTranslation();

  return (
    <output
      className="flex h-full min-h-72 items-center justify-center px-6 py-12 text-center"
      aria-live="polite"
    >
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-card text-primary shadow-sm">
          <IconSparkles className="size-5" aria-hidden />
        </span>
        <Eyebrow className="mt-5 block">{t("agent.modelLabel")}</Eyebrow>
        <h2 className="mt-3 font-display font-medium text-2xl tracking-tight">
          {t("agent.preparingTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
          {t("agent.preparingHint")}
        </p>
        <span className="mt-6 inline-flex gap-1.5" aria-hidden>
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
          <span className="size-1.5 rounded-full bg-primary/65 motion-safe:animate-pulse motion-safe:[animation-delay:150ms]" />
          <span className="size-1.5 rounded-full bg-primary/35 motion-safe:animate-pulse motion-safe:[animation-delay:300ms]" />
        </span>
      </div>
    </output>
  );
}
