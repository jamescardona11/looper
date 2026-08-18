import { useTranslation } from "@looper/i18n/react";
import { IconLoader2, IconMenu2 } from "@tabler/icons-react";
import { LooperMark } from "@/shared/components/looper-mark";

export function RouteLoadingState({ shellLabel }: { shellLabel?: string }) {
  const { t } = useTranslation();
  const workspace = (
    <output
      className="flex min-h-[60vh] items-center justify-center bg-background px-5 py-12 text-foreground sm:px-8"
      aria-live="polite"
    >
      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-between gap-4 border-border border-b pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <LooperMark className="size-5" />
            </span>
            <div>
              <p className="font-medium text-sm tracking-tight">{t("status.preparingWorkspace")}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t("status.loadingWorkspaceHint")}
              </p>
            </div>
          </div>
          <IconLoader2
            className="size-4 text-muted-foreground motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        </div>

        <div aria-hidden className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-72 rounded-2xl border border-border bg-card p-5">
            <div className="h-3 w-24 rounded-full bg-secondary motion-safe:animate-pulse" />
            <div className="mt-5 h-8 w-2/3 rounded-lg bg-secondary motion-safe:animate-pulse" />
            <div className="mt-3 h-3 w-1/2 rounded-full bg-secondary motion-safe:animate-pulse" />
            <div className="mt-10 h-28 rounded-xl bg-secondary/70 motion-safe:animate-pulse" />
          </div>
          <div className="hidden min-h-72 rounded-2xl border border-border bg-card p-4 sm:block">
            <div className="h-3 w-16 rounded-full bg-secondary motion-safe:animate-pulse" />
            <div className="mt-5 space-y-3">
              <div className="h-9 rounded-lg bg-secondary/70 motion-safe:animate-pulse" />
              <div className="h-9 rounded-lg bg-secondary/70 motion-safe:animate-pulse" />
              <div className="h-9 rounded-lg bg-secondary/70 motion-safe:animate-pulse" />
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">{t("common.loading")}</span>
    </output>
  );

  if (!shellLabel) return workspace;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        aria-hidden
        className="hidden w-64 shrink-0 flex-col border-border border-r bg-card lg:flex"
      >
        <div className="flex h-12 items-center gap-2 border-border border-b px-3">
          <span className="grid size-7 place-items-center rounded-lg border border-border bg-background text-primary">
            <LooperMark className="size-4" />
          </span>
          <span className="font-medium text-sm tracking-tight">Looper</span>
        </div>
        <div className="space-y-5 px-2 py-3">
          <div className="h-8 rounded-md border border-border bg-background" />
          <div className="space-y-1">
            <div className="ml-2 h-2 w-16 rounded-full bg-secondary" />
            <div className="flex h-8 items-center rounded-md bg-secondary px-2.5">
              <span className="font-medium text-muted-foreground text-xs">{shellLabel}</span>
            </div>
            <div className="h-8 rounded-md bg-secondary/40" />
            <div className="h-8 rounded-md bg-secondary/40" />
          </div>
        </div>
        <div className="mt-auto border-border border-t p-2">
          <div className="h-10 rounded-md bg-secondary/40" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-border border-b bg-card px-3 lg:hidden">
          <span className="grid size-8 place-items-center text-muted-foreground">
            <IconMenu2 className="size-4" aria-hidden />
          </span>
          <span className="font-medium text-sm">{shellLabel}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{workspace}</div>
      </div>
    </div>
  );
}
