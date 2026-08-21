import { type MeetingSession, useMeetingDetail } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge, Card } from "@/shared/components/ui";

export function MeetingList({ sessions }: { sessions: MeetingSession[] }) {
  const { locale } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? sessions[0]?.meetingId ?? null;
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <ol className="grid content-start gap-2">
        {sessions.map((session) => (
          <li key={session.meetingId}>
            <button
              type="button"
              onClick={() => setSelectedId(session.meetingId)}
              className={cn(
                "w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50",
                activeId === session.meetingId && "border-primary/40 bg-secondary/60",
              )}
            >
              <span className="block truncate font-medium text-sm">{session.title}</span>
              <span className="mt-2 block text-muted-foreground text-xs">
                {formatter.format(session.startedAt)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <MeetingDetail meetingId={activeId} />
    </div>
  );
}

function MeetingDetail({ meetingId }: { meetingId: string | null }) {
  const { t } = useTranslation();
  const detail = useMeetingDetail(meetingId);

  if (detail.isLoading) {
    return <Card className="min-h-80 animate-pulse bg-secondary/30" />;
  }

  return (
    <Card className="min-h-80 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-xl tracking-tight">
          {detail.session?.title ?? t("library.meeting")}
        </h2>
        {detail.session ? <Badge variant="outline">{detail.session.state}</Badge> : null}
      </div>

      {detail.brief ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <BriefSection title={t("library.decisions")} items={detail.brief.decisions} />
          <BriefSection title={t("library.tasks")} items={detail.brief.tasks} />
          <BriefSection title={t("library.questions")} items={detail.brief.questions} />
        </div>
      ) : null}

      <section className="mt-6">
        <h3 className="font-medium text-sm">{t("library.transcript")}</h3>
        {detail.transcript.length > 0 ? (
          <ol className="mt-3 grid gap-3">
            {detail.transcript.map((segment) => (
              <li key={segment.id} className="border-border border-l-2 pl-3 text-sm leading-6">
                {segment.speaker ? (
                  <span className="mr-2 font-medium text-foreground">{segment.speaker}</span>
                ) : null}
                <span className="text-muted-foreground">{segment.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-muted-foreground text-sm">{t("library.emptyTranscript")}</p>
        )}
      </section>
    </Card>
  );
}

function BriefSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="font-medium text-sm">{title}</h3>
      <ul className="mt-2 grid gap-2 text-muted-foreground text-sm leading-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
