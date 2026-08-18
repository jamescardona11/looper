// Floating feedback widget: a small launcher button that opens a panel to send
// in-app feedback (bug / idea / praise / other). Submits via the useFeedback
// domain hook — works signed-in or anonymous. Mounted globally in __root.tsx.
import { type FeedbackKind, useFeedback } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconMessage2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import {
  COOKIE_CONSENT_EVENT,
  getCookieConsentChoice,
} from "@/shared/components/cookie-consent-state";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { ToggleGroup } from "@/shared/components/ui/toggle-group";

const KIND_KEYS: Array<{ value: FeedbackKind; labelKey: string }> = [
  { value: "idea", labelKey: "feedback.kindIdea" },
  { value: "bug", labelKey: "feedback.kindBug" },
  { value: "praise", labelKey: "feedback.kindPraise" },
  { value: "other", labelKey: "feedback.kindOther" },
];

interface FeedbackWidgetProps {
  avoidMobileComposer?: boolean;
  anchorMobileHeader?: boolean;
  hideMobile?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FeedbackWidget({
  avoidMobileComposer = false,
  anchorMobileHeader = false,
  hideMobile = false,
  open: controlledOpen,
  onOpenChange,
}: FeedbackWidgetProps) {
  const { t } = useTranslation();
  const submit = useFeedback();
  const [internalOpen, setInternalOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cookieConsentPending, setCookieConsentPending] = useState(
    () => getCookieConsentChoice() === null,
  );
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    const syncConsent = () => setCookieConsentPending(getCookieConsentChoice() === null);
    window.addEventListener(COOKIE_CONSENT_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, []);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      await submit({
        kind,
        message: message.trim(),
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
      });
      toast.success(t("feedback.thankYou"));
      setMessage("");
      setOpen(false);
    } catch {
      toast.error(t("feedback.sendError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("feedback.title")}
        className={cn(
          "touch-target fixed z-50 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-[top,bottom,color] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          anchorMobileHeader
            ? "top-1.5 right-3 size-9 sm:top-auto sm:right-4 sm:bottom-4 sm:size-11"
            : cn("right-4 size-11 sm:bottom-4", avoidMobileComposer ? "bottom-28" : "bottom-4"),
          cookieConsentPending ? "hidden" : hideMobile ? "hidden sm:flex" : "flex",
        )}
      >
        <IconMessage2 className="size-5" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[calc(100vw-1.25rem)] max-w-80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <PopoverTitle className="font-medium text-sm">{t("feedback.title")}</PopoverTitle>
        </div>

        <ToggleGroup
          aria-label={t("feedback.title")}
          className="mb-2 w-full"
          size="sm"
          value={kind}
          onValueChange={setKind}
          items={KIND_KEYS.map((k) => ({ value: k.value, label: t(k.labelKey) }))}
        />

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label={t("feedback.yourFeedback")}
          placeholder={t("feedback.placeholder")}
          className="min-h-[90px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />

        <Button
          type="button"
          onClick={send}
          disabled={!message.trim() || busy}
          className="mt-2 w-full"
        >
          {busy ? t("auth.sendingCode") : t("chat.send")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
