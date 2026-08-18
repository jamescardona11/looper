import type { TranscriptionItem } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconCopy, IconFileText, IconFileUpload, IconMicrophone } from "@tabler/icons-react";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/shared/components/empty-state";
import { Eyebrow } from "@/shared/components/eyebrow";
import { Badge, Button, Card } from "@/shared/components/ui";
import {
  type TranscriptionMode,
  type TranscriptionProvider,
  transcriptionProviderLabel,
} from "../transcribe-types";
import type { useStreamingStt } from "../use-streaming-stt";
import { TranscriptContent } from "./transcript-content";

export function TranscriptWorkspace({
  mode,
  provider,
  live,
  latestTranscription,
  copiedTranscriptionId,
  showFirst,
  onCopy,
}: {
  mode: TranscriptionMode;
  provider: TranscriptionProvider;
  live: ReturnType<typeof useStreamingStt>;
  latestTranscription: TranscriptionItem | undefined;
  copiedTranscriptionId: string | null;
  showFirst: boolean;
  onCopy: (id: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const hasTranscriptContent =
    mode === "live" ? Boolean(live.transcript) : Boolean(latestTranscription);

  return (
    <Card
      data-testid="transcript-workspace"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden p-0 md:order-1",
        hasTranscriptContent
          ? "min-h-[260px] sm:min-h-[320px] md:min-h-[400px] lg:min-h-[460px]"
          : "min-h-[400px] sm:min-h-[520px] md:min-h-[560px] lg:min-h-[620px]",
        showFirst ? "order-1" : "order-2",
      )}
    >
      <header className="flex items-center justify-between gap-4 border-border border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
            <IconFileText aria-hidden className="size-4" />
          </span>
          <div>
            <Eyebrow>
              {mode === "live" ? t("transcribe.modeLive") : t("transcribe.recentTranscriptions")}
            </Eyebrow>
            <p className="mt-1 text-muted-foreground text-xs">
              {mode === "live"
                ? transcriptionProviderLabel(provider)
                : transcriptionProviderLabel(latestTranscription?.provider ?? provider)}
            </p>
          </div>
        </div>

        {mode === "live" ? (
          <div className="flex items-center gap-2">
            {live.transcript ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCopy("live", live.transcript)}
              >
                <IconCopy className="size-3.5" aria-hidden />
                {copiedTranscriptionId === "live" ? t("transcribe.copied") : t("transcribe.copy")}
              </Button>
            ) : null}
            <Badge variant={live.isLive ? "success" : "muted"}>
              {live.isLive ? t("transcribe.liveListening") : t("transcribe.modeLive")}
            </Badge>
          </div>
        ) : latestTranscription?.status === "done" && latestTranscription.text ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              latestTranscription.text && onCopy(latestTranscription._id, latestTranscription.text)
            }
          >
            <IconCopy className="size-3.5" aria-hidden />
            {copiedTranscriptionId === latestTranscription._id
              ? t("transcribe.copied")
              : t("transcribe.copy")}
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-6">
        {mode === "live" ? (
          live.transcript ? (
            <p className="whitespace-pre-wrap text-base text-foreground leading-7">
              {live.transcript}
            </p>
          ) : (
            <EmptyState
              icon={<IconMicrophone className="size-6 text-primary" />}
              title={t("transcribe.modeLive")}
              description={t("transcribe.livePlaceholder")}
              className="min-h-0 flex-1 rounded-none border-0"
            />
          )
        ) : latestTranscription ? (
          <TranscriptContent item={latestTranscription} />
        ) : (
          <EmptyState
            icon={<IconFileUpload className="size-6 text-primary" />}
            title={t("transcribe.noTranscriptions")}
            description={t("transcribe.noTranscriptionsHint")}
            className="min-h-0 flex-1 rounded-none border-0"
          />
        )}
      </div>
    </Card>
  );
}
