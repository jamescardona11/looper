import type { TranscriptionItem } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconCopy } from "@tabler/icons-react";
import { Eyebrow } from "@/shared/components/eyebrow";
import { Badge, Button, Card } from "@/shared/components/ui";
import { transcriptionProviderLabel } from "../transcribe-types";
import { TranscriptContent } from "./transcript-content";

export function TranscriptionHistory({
  transcriptions,
  copiedTranscriptionId,
  onCopy,
}: {
  transcriptions: TranscriptionItem[];
  copiedTranscriptionId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const { t } = useTranslation();
  if (transcriptions.length === 0) return null;

  return (
    <section className="mt-10">
      <Eyebrow className="mb-4">{t("transcribe.recentTranscriptions")}</Eyebrow>
      <div className="flex flex-col gap-3">
        {transcriptions.map((item) => (
          <Card key={item._id} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Badge variant="outline">{transcriptionProviderLabel(item.provider)}</Badge>
              {item.status === "done" && item.text ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => item.text && onCopy(item._id, item.text)}
                >
                  <IconCopy className="size-3.5" aria-hidden />
                  {copiedTranscriptionId === item._id
                    ? t("transcribe.copied")
                    : t("transcribe.copy")}
                </Button>
              ) : null}
            </div>
            <TranscriptContent item={item} />
          </Card>
        ))}
      </div>
    </section>
  );
}
