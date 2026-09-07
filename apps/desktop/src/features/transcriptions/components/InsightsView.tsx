import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

import type {
  TranscriptionRecord,
  TranscriptionMode,
} from "../../../contracts";
import { isRemoteTranscriptionSpeechModel } from "../../../shared/lib/speechProviders";
import { formatRecordingClock } from "../todayStats";
import { useTranscriptionList } from "../queries";

type InsightsViewProps = {
  transcriptionMode: TranscriptionMode;
  isActive?: boolean;
  onOpenStudio?: () => void;
};

type MetricProps = {
  detail: string;
  label: string;
  value: string;
};

function Metric({ detail, label, value }: MetricProps) {
  return (
    <article className="min-w-0 rounded-xl border border-border-primary bg-[var(--color-bg-surface)] p-[17px]">
      <strong className="block font-display ui-text-metric font-semibold tabular-nums ui-color-primary">
        {value}
      </strong>
      <span className="mt-[7px] block ui-text-uppercase-micro font-bold tracking-[0.07em] uppercase ui-color-muted">
        {label}
      </span>
      <p className="mt-[9px] text-pretty ui-text-label leading-[1.5] ui-color-muted">
        {detail}
      </p>
    </article>
  );
}

function MetricBar({
  label,
  value,
  width,
  tone = "accent",
}: {
  label: string;
  value: string;
  width: number;
  tone?: "accent" | "local";
}) {
  return (
    <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)_52px] items-center gap-3 border-b border-border-primary py-[9px] last:border-b-0 min-[721px]:grid-cols-[132px_minmax(0,1fr)_62px]">
      <span className="min-w-0 ui-text-body-sm font-semibold ui-color-primary">
        {label}
      </span>
      <span className="h-[9px] overflow-hidden rounded-[5px] bg-surface-elevated">
        <span
          className={`block h-full rounded-[5px] ${
            tone === "local"
              ? "bg-[var(--color-local)]"
              : "bg-[var(--color-accent)]"
          }`}
          style={{ width: `${Math.max(0, Math.min(width, 100))}%` }}
        />
      </span>
      <span className="w-[52px] text-right tabular-nums ui-text-label ui-color-muted min-[721px]:w-[62px]">
        {value}
      </span>
    </div>
  );
}

function DestinationProof({ destination }: { destination: Destination }) {
  return (
    <div className="mt-5 flex w-full items-center gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--color-success)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_8%,var(--color-bg-primary))] px-[17px] py-[15px] text-pretty ui-text-body-sm text-content-secondary">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]"
      />
      <p>
        <strong className="font-semibold text-[var(--color-success)]">
          Most dictations landed in {destination.label} this week.
        </strong>{" "}
        Destination context comes from the app that was active when the
        transcription was inserted.
      </p>
    </div>
  );
}

type Destination = {
  label: string;
  count: number;
};

function weekStart(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - offset,
  ).getTime();
}

function destinationFor(appId: string | null | undefined) {
  const value = appId?.toLowerCase() ?? "";
  if (/chatgpt|openai|claude|anthropic|perplexity|gemini/.test(value)) {
    return "AI prompts";
  }
  if (/code|cursor|terminal|iterm|warp|xcode/.test(value)) {
    return "Code & terminals";
  }
  if (/notion|obsidian|craft|word|pages|notes/.test(value)) {
    return "Documents";
  }
  if (/slack|teams|discord|linear|mail|outlook/.test(value)) {
    return "Work messages";
  }
  return appId ? "Other apps" : "No app context";
}

function weeklyRecords(records: TranscriptionRecord[], now = Date.now()) {
  const start = weekStart(now);
  return records.filter((record) => {
    const timestamp = new Date(record.timestamp).getTime();
    return (
      record.status === "success" && timestamp >= start && timestamp <= now
    );
  });
}

function weeklyDestinations(records: TranscriptionRecord[]): Destination[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = destinationFor(record.app_id);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
}

function isRemoteSpeechRecord(record: TranscriptionRecord) {
  const model = record.speech_model.trim();
  return model.startsWith("cloud-") || isRemoteTranscriptionSpeechModel(model);
}

/** Weekly metrics are derived exclusively from locally retained dictations. */
export default function InsightsView({
  transcriptionMode,
  isActive = true,
  onOpenStudio,
}: InsightsViewProps) {
  const { t } = useLingui();
  const { data: records = [] } = useTranscriptionList(isActive);
  const weekRecords = useMemo(() => weeklyRecords(records), [records]);
  const destinations = useMemo(
    () => weeklyDestinations(weekRecords),
    [weekRecords],
  );
  const wordsThisWeek = weekRecords.reduce(
    (total, record) => total + record.word_count,
    0,
  );
  const audioThisWeek = weekRecords.reduce(
    (total, record) => total + record.audio_duration_seconds,
    0,
  );
  const originalCount = weekRecords.filter(
    (record) => record.audio_available,
  ).length;
  const remoteSpeechCount = weekRecords.filter(isRemoteSpeechRecord).length;
  const localSpeechCount = weekRecords.length - remoteSpeechCount;
  const localSpeechPercent =
    weekRecords.length > 0
      ? Math.round((localSpeechCount / weekRecords.length) * 100)
      : null;
  const failedCount = records.filter(
    (record) => record.status === "error",
  ).length;
  const processingDetail =
    weekRecords.length === 0
      ? transcriptionMode === "local"
        ? "Local transcription is selected for new dictations."
        : "Cloud transcription is selected for new dictations."
      : remoteSpeechCount === 0
        ? "All weekly dictations used the local speech model."
        : localSpeechCount === 0
          ? "All weekly dictations used a configured remote speech provider."
          : `${localSpeechCount} of ${weekRecords.length} weekly dictations used the local speech model.`;
  const pace =
    audioThisWeek > 0 ? Math.round(wordsThisWeek / (audioThisWeek / 60)) : 0;

  return (
    <section className="w-full min-w-0">
      <p className="ui-text-uppercase-micro font-bold tracking-[0.11em] uppercase ui-color-accent">
        {t({ id: "insights.eyebrow", message: "Insights" })}
      </p>
      <h1 className="mt-1 text-balance font-display ui-text-screen-title font-semibold tracking-normal ui-color-primary">
        {t({ id: "insights.title", message: "Proof, not a scoreboard." })}
      </h1>
      <section className="mt-[22px] grid grid-cols-1 gap-3 min-[1081px]:grid-cols-3">
        <Metric
          detail="Successful dictations retained in Looper on this Mac."
          label="words this week"
          value={wordsThisWeek.toLocaleString()}
        />
        <Metric
          detail={processingDetail}
          label="on-device"
          value={localSpeechPercent === null ? "—" : `${localSpeechPercent}%`}
        />
        <Metric
          detail={
            pace > 0 ? `${pace} words per minute` : "Available after dictating"
          }
          label="spoken this week"
          value={formatRecordingClock(audioThisWeek)}
        />
      </section>

      <section className="mt-[26px]">
        <div className="flex flex-col items-start justify-between gap-2 min-[721px]:flex-row min-[721px]:items-end min-[721px]:gap-4">
          <div>
            <p className="ui-text-uppercase-micro font-bold tracking-[0.11em] uppercase ui-color-accent">
              This week
            </p>
            <h2 className="mt-1 font-display ui-text-section-title font-semibold tracking-normal ui-color-primary">
              Where your dictation lands.
            </h2>
          </div>
          {onOpenStudio ? (
            <button
              type="button"
              onClick={onOpenStudio}
              className="-mx-2 inline-flex h-9 items-center rounded-[10px] px-2 ui-text-label font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
            >
              Tune these modes →
            </button>
          ) : null}
        </div>
        <div className="mt-3 w-full">
          {destinations.length > 0 ? (
            destinations.map((destination) => (
              <MetricBar
                key={destination.label}
                label={destination.label}
                value={`${Math.round((destination.count / weekRecords.length) * 100)}%`}
                width={(destination.count / weekRecords.length) * 100}
              />
            ))
          ) : (
            <p className="py-3 ui-text-body-sm ui-color-muted">
              Destination context appears after your first dictation this week.
            </p>
          )}
        </div>
        {destinations[0] ? (
          <DestinationProof destination={destinations[0]} />
        ) : null}
      </section>

      <section className="mt-[26px]">
        <p className="ui-text-uppercase-micro font-bold tracking-[0.11em] uppercase ui-color-accent">
          Recovery
        </p>
        <h2 className="mt-1 font-display ui-text-section-title font-semibold tracking-normal ui-color-primary">
          Nothing was lost.
        </h2>
        <div className="mt-3 w-full">
          <MetricBar
            label="Originals kept"
            value={`${originalCount}/${weekRecords.length}`}
            width={
              weekRecords.length > 0
                ? (originalCount / weekRecords.length) * 100
                : 0
            }
            tone="local"
          />
          <MetricBar
            label="Ready to revisit"
            value={originalCount.toLocaleString()}
            width={
              weekRecords.length > 0
                ? (originalCount / weekRecords.length) * 100
                : 0
            }
            tone="local"
          />
          <MetricBar
            label="Needs attention"
            value={failedCount.toLocaleString()}
            width={
              records.length > 0 ? (failedCount / records.length) * 100 : 0
            }
            tone="local"
          />
        </div>
      </section>
    </section>
  );
}
