import type { TranscriptionItem } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconLoader2 } from "@tabler/icons-react";

export function TranscriptContent({ item }: { item: TranscriptionItem }) {
  const { t } = useTranslation();

  if (item.status === "transcribing") {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <IconLoader2
          className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
          aria-hidden
        />
        {t("transcribe.transcribing")}
      </div>
    );
  }

  if (item.status === "error") {
    return (
      <p role="alert" className="text-destructive text-sm">
        {item.error || t("transcribe.failed")}
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-base text-foreground leading-7">
      {item.text || t("transcribe.emptyTranscript")}
    </p>
  );
}
