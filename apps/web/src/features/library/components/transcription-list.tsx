import type { DictationHistoryItem } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconCopy } from "@tabler/icons-react";
import { Badge, Button, Card } from "@/shared/components/ui";

export function TranscriptionList({
  items,
  copiedId,
  onCopy,
}: {
  items: DictationHistoryItem[];
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const { t, locale } = useTranslation();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <ol className="grid gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {item.source === "remote"
                    ? t("library.sourceRemote")
                    : t("library.sourceDesktop")}
                </Badge>
                <time
                  dateTime={new Date(item.occurredAt).toISOString()}
                  className="text-muted-foreground text-xs"
                >
                  {formatter.format(item.occurredAt)}
                </time>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCopy(item.id, item.text)}
              >
                <IconCopy className="size-3.5" aria-hidden />
                {copiedId === item.id ? t("library.copied") : t("library.copy")}
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-base text-foreground leading-7">{item.text}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
