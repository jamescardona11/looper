import { useTranslation } from "@looper/i18n/react";
import { IconLoader2, IconMenu2 } from "@tabler/icons-react";
import { LooperMark } from "@/shared/components/looper-mark";

export function RouteLoadingState({ shellLabel }: { shellLabel?: string }) {
  const { t } = useTranslation();
  const workspace = (
    <output
      className={`web-product-workspace flex items-center justify-center px-5 py-12 text-foreground sm:px-8 ${
        shellLabel ? "min-h-0 flex-1" : "min-h-[60vh]"
      }`}
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-[var(--web-line)] bg-[var(--web-raised)] px-8 py-9 text-center shadow-sm">
        <span className="grid size-11 place-items-center rounded-xl border border-[var(--web-highlight)] bg-[var(--web-highlight)] text-[var(--web-accent)]">
          <LooperMark className="size-6" />
        </span>
        <p className="mt-4 font-medium text-sm tracking-tight">{t("status.preparingWorkspace")}</p>
        <p className="mt-1 text-muted-foreground text-xs">{t("status.loadingWorkspaceHint")}</p>
        <IconLoader2
          className="mt-5 size-4 text-[var(--web-accent)] motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    </output>
  );

  if (!shellLabel) return workspace;

  return (
    <div className="web-product-canvas">
      <div className="web-product-shell">
        <aside aria-hidden className="web-product-sidebar hidden shrink-0 flex-col lg:flex">
          <div className="web-product-brand flex shrink-0 items-center gap-2">
            <LooperMark className="size-5 shrink-0 text-[var(--web-ink)]" />
            <span className="font-display font-semibold text-[22px] text-[var(--web-ink)] tracking-[-0.055em]">
              Looper
            </span>
          </div>
          <div className="px-3 py-3">
            <div className="flex h-10 items-center rounded-lg bg-[var(--web-highlight)] px-3">
              <span className="font-semibold text-[13px] text-[var(--web-ink)]">{shellLabel}</span>
            </div>
          </div>
        </aside>

        <div className="web-product-content-shell flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-[var(--web-line)] border-b bg-[var(--web-paper)] px-3 lg:hidden">
            <span className="grid size-8 place-items-center text-[var(--web-ink-muted)]">
              <IconMenu2 className="size-4" aria-hidden />
            </span>
            <span className="font-medium text-[var(--web-ink)] text-sm">{shellLabel}</span>
          </header>
          {workspace}
        </div>
      </div>
    </div>
  );
}
