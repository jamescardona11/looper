import { useAutoAnimate } from "@formkit/auto-animate/react";
import { type AgentThread, useThreads } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import {
  IconArchive,
  IconDots,
  IconMessageCircle,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/shared/components/eyebrow";
import {
  Button,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tooltip,
} from "@/shared/components/ui";

export function ThreadSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeThreadId = useRouterState({
    select: (state) => {
      if (state.location.pathname !== "/agent") return null;
      const search = state.location.search as { thread?: string };
      return search.thread ?? null;
    },
  });
  const { threads, create, rename, archive, remove } = useThreads();
  const [listRef] = useAutoAnimate<HTMLDivElement>();

  const onNewChat = async () => {
    const id = await create(t("agent.newChat"));
    await navigate({ to: "/agent", search: { thread: id } });
    onNavigate?.();
  };

  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const visibleThreads = normalizedSearch
    ? threads.filter((thread) => thread.title.toLowerCase().includes(normalizedSearch))
    : threads;
  const dateLabels = {
    today: t("agent.today"),
    yesterday: t("agent.yesterday"),
    last7Days: t("agent.last7Days"),
    last30Days: t("agent.last30Days"),
    older: t("agent.older"),
  };
  const groups = groupByDate(visibleThreads, dateLabels);
  const selectThread = (id: string) => {
    void navigate({ to: "/agent", search: { thread: id } });
    onNavigate?.();
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <Eyebrow>{t("chat.threads")}</Eyebrow>
        <Tooltip label={t("agent.newChat")}>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => void onNewChat()}
            className="size-11 text-muted-foreground hover:bg-secondary hover:text-foreground sm:size-7"
            aria-label={t("agent.newChat")}
          >
            <IconPlus className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>

      <div className="relative px-2 pb-1">
        <IconSearch
          className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("agent.searchChats")}
          className="h-11 bg-background pr-2.5 pl-8 text-xs shadow-none sm:h-8"
        />
      </div>

      <div
        ref={listRef as React.Ref<HTMLDivElement>}
        className="flex-1 space-y-3 overflow-y-auto p-2"
      >
        {visibleThreads.length === 0 ? (
          <p className="px-2 pt-1 text-foreground text-xs">
            {normalizedSearch ? t("agent.noMatches") : t("agent.noThreadsYet")}
          </p>
        ) : (
          groups.map((group) =>
            group.threads.length === 0 ? null : (
              <ThreadGroup
                key={group.label}
                label={group.label}
                threads={group.threads}
                activeThreadId={activeThreadId}
                onSelect={selectThread}
                onRename={async (id, newTitle) => {
                  await rename(id, newTitle);
                }}
                onArchive={async (id) => {
                  await archive(id);
                  if (activeThreadId === id && threads.length > 1) {
                    const next = threads.find((thread) => thread._id !== id);
                    if (next) selectThread(next._id);
                  }
                }}
                onDelete={async (id) => {
                  await remove(id);
                  if (activeThreadId === id) {
                    const next = threads.find((thread) => thread._id !== id);
                    if (next) selectThread(next._id);
                  }
                }}
              />
            ),
          )
        )}
      </div>
    </section>
  );
}

interface ThreadGroupProps {
  label: string;
  threads: AgentThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function ThreadGroup({
  label,
  threads,
  activeThreadId,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: ThreadGroupProps) {
  const [groupRef] = useAutoAnimate<HTMLUListElement>();
  return (
    <div>
      <Eyebrow className="mb-1 px-2">{label}</Eyebrow>
      <ul ref={groupRef as React.Ref<HTMLUListElement>} className="space-y-0.5">
        {threads.map((t) => (
          <ThreadItem
            key={t._id}
            thread={t}
            active={activeThreadId === t._id}
            onSelect={onSelect}
            onRename={onRename}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function ThreadItem({
  thread,
  active,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: {
  thread: AgentThread;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const submitRename = async () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== thread.title) {
      await onRename(thread._id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <li
      className={cn(
        "group relative flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors sm:min-h-0 sm:items-start",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => !renaming && onSelect(thread._id)}
        className="flex flex-1 items-start gap-2 text-left"
      >
        <IconMessageCircle className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              aria-label={t("chat.renameThread")}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRename();
                if (e.key === "Escape") {
                  setDraftTitle(thread.title);
                  setRenaming(false);
                }
              }}
              className="w-full rounded-sm bg-background px-1 py-0 text-xs outline-none ring-1 ring-border"
            />
          ) : (
            <p className="truncate">{thread.title || t("agent.untitled")}</p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {formatRelative(thread.lastMessageAt, t)} {"·"}{" "}
            {t("agent.messageCount", { count: thread.messageCount })}
          </p>
        </div>
      </button>

      <Menu>
        <MenuTrigger
          aria-label={t("agent.threadActions")}
          className="grid size-11 shrink-0 place-items-center rounded text-muted-foreground opacity-100 transition-opacity hover:bg-secondary hover:text-foreground data-[popup-open]:opacity-100 sm:size-5 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <IconDots className="size-3" aria-hidden />
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[140px]">
          <MenuItem
            onClick={() => {
              setDraftTitle(thread.title);
              setRenaming(true);
            }}
          >
            <IconPencil className="size-3" aria-hidden />
            {t("agent.rename")}
          </MenuItem>
          <MenuItem onClick={() => void onArchive(thread._id)}>
            <IconArchive className="size-3" aria-hidden />
            {t("agent.archive")}
          </MenuItem>
          <MenuItem destructive onClick={() => void onDelete(thread._id)}>
            <IconTrash className="size-3" aria-hidden />
            {t("agent.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

function formatRelative(
  ms: number,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return t("common.justNow");
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function groupByDate(
  threads: AgentThread[],
  labels: {
    today: string;
    yesterday: string;
    last7Days: string;
    last30Days: string;
    older: string;
  },
): { label: string; threads: AgentThread[] }[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const last7Start = todayStart - 6 * 86_400_000;
  const last30Start = todayStart - 29 * 86_400_000;

  const today: AgentThread[] = [];
  const yesterday: AgentThread[] = [];
  const last7: AgentThread[] = [];
  const last30: AgentThread[] = [];
  const older: AgentThread[] = [];

  for (const thread of threads) {
    if (thread.lastMessageAt >= todayStart) today.push(thread);
    else if (thread.lastMessageAt >= yesterdayStart) yesterday.push(thread);
    else if (thread.lastMessageAt >= last7Start) last7.push(thread);
    else if (thread.lastMessageAt >= last30Start) last30.push(thread);
    else older.push(thread);
  }

  return [
    { label: labels.today, threads: today },
    { label: labels.yesterday, threads: yesterday },
    { label: labels.last7Days, threads: last7 },
    { label: labels.last30Days, threads: last30 },
    { label: labels.older, threads: older },
  ];
}
