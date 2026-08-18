// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { useSubscription } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowUpRight } from "@tabler/icons-react";
import { IconDownload, IconMessageCircle } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PageSurface } from "@/shared/components/page-surface";
import { Tooltip } from "@/shared/components/ui/tooltip";
import { useAgentWorkspace } from "../hooks/use-agent-workspace";
import { useMessages } from "../hooks/use-messages";
import { ChatLoadingState } from "./chat-loading-state";
import { ChatUI } from "./chat-ui";

export function AgentWorkspace({ activeThreadId }: { activeThreadId: string | null }) {
  const { isAuthenticated, isLoading, nextThreadId } = useAgentWorkspace(activeThreadId);
  const { tier } = useSubscription();

  if (isLoading) return <ChatLoadingState />;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  if (nextThreadId) {
    return <Navigate to="/agent" search={{ thread: nextThreadId }} replace />;
  }

  return (
    <PageSurface className="relative flex h-full w-full min-w-0 overflow-hidden">
      <section className="flex h-full min-w-0 flex-1 flex-col">
        <ChatHeader activeThreadId={activeThreadId} />
        {activeThreadId ? (
          <ChatUI key={activeThreadId} threadId={activeThreadId} />
        ) : (
          <ChatLoadingState />
        )}
      </section>

      {tier === "free" ? <UpgradeFab /> : null}
    </PageSurface>
  );
}

function ChatHeader({ activeThreadId }: { activeThreadId: string | null }) {
  const { t } = useTranslation();
  const { messages } = useMessages(activeThreadId);
  const busy = messages.some((m) => m.role === "assistant" && m.status === "streaming");

  const onExport = () => {
    if (messages.length === 0) return;
    const md = messages
      .map((m) => `**${m.role === "user" ? "You" : "Assistant"}**\n\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-border/80 border-b bg-background px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
          <IconMessageCircle className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <Eyebrow className="hidden sm:block">{t("nav.workspace")}</Eyebrow>
          <h1 className="sr-only truncate font-medium text-sm tracking-tight sm:not-sr-only sm:block">
            {busy ? t("agent.streaming") : t("nav.chat")}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {activeThreadId && messages.length > 0 ? (
          <Tooltip label={t("agent.exportAsMd")}>
            <button
              type="button"
              onClick={onExport}
              aria-label={t("agent.exportAsMd")}
              className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <IconDownload className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
        {busy ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary uppercase tracking-wide">
            {t("agent.streaming")}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function UpgradeFab() {
  const { t } = useTranslation();
  return (
    <Link
      to="/billing"
      className="group fixed right-20 bottom-6 z-20 hidden items-center gap-2 rounded-full border border-border bg-card/90 px-3.5 py-2 font-medium text-foreground text-xs tracking-tight shadow-lg backdrop-blur transition-all hover:border-primary/40 hover:bg-card sm:inline-flex"
    >
      <span className="relative grid size-4 place-items-center">
        <span className="absolute inset-0 animate-pulse rounded-full bg-primary/30 blur" />
        <span className="relative size-1.5 rounded-full bg-primary" />
      </span>
      <span>{t("agent.upgrade")}</span>
      <IconArrowUpRight className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
