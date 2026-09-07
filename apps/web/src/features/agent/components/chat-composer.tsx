import { convexCapabilities } from "@looper/data";
import { PRODUCT_ACCESS_IS_FREE } from "@looper/config/billing";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowUp, IconPlayerStopFilled } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type KeyboardEvent, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/shared/components/ui/tooltip";
import { quotaBlocksSend } from "../quota";
import { hasDisplayableQuota } from "../quota-presentation";

interface ChatComposerProps {
  initialText?: string;
  disabled?: boolean;
  busy?: boolean;
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  creditsRemaining?: number | null;
  creditsLimit?: number | null;
  tier?: "free" | "pro" | "ultra";
  byok?: boolean;
  error?: string | null;
}

export function ChatComposer({
  initialText = "",
  disabled,
  busy,
  onSend,
  onStop,
  creditsRemaining,
  creditsLimit,
  tier = "free",
  byok = false,
  error,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Quota gate: a metered user with no messages left can't send — the button
  // disables instead of firing a request the backend will reject.
  const atLimit = quotaBlocksSend(byok, creditsRemaining);
  const canSend = text.trim().length > 0 && !disabled && !busy && !atLimit;

  const submit = async () => {
    if (!canSend) return;
    await onSend(text);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onInput = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  };

  const composerPlaceholder = busy ? t("ai.generating") : t("chat.askAnything");

  return (
    <div data-testid="chat-composer" className="bg-background">
      <div className="mx-auto max-w-3xl px-4 pt-2 pb-4 sm:px-6">
        <div className="relative">
          <fieldset
            aria-label={t("chat.askAnything")}
            className="flex items-end gap-1.5 rounded-2xl border border-border bg-card p-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-foreground/25 focus-within:shadow-md"
          >
            <textarea
              ref={textareaRef}
              value={text}
              aria-label={t("chat.askAnything")}
              onChange={(e) => {
                setText(e.target.value);
                onInput();
              }}
              onKeyDown={onKeyDown}
              placeholder={composerPlaceholder}
              disabled={disabled || busy}
              rows={1}
              className={cn(
                "min-h-9 flex-1 resize-none self-center bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground",
                "max-h-[180px]",
              )}
            />

            {busy && onStop && convexCapabilities.streamingChat ? (
              <Tooltip label={t("agent.stopGenerating")}>
                <button
                  type="button"
                  onClick={() => void onStop()}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground transition-[background-color,transform] hover:bg-secondary active:scale-95 sm:size-9"
                  aria-label={t("agent.stopGenerating")}
                >
                  <IconPlayerStopFilled className="size-3.5" />
                </button>
              </Tooltip>
            ) : (
              <Tooltip label={t("agent.sendMessageHint")}>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSend}
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl transition-[background-color,transform] sm:size-9",
                    canSend
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                      : "bg-secondary text-muted-foreground",
                  )}
                  aria-label={t("chat.send")}
                >
                  <IconArrowUp className="size-4" />
                </button>
              </Tooltip>
            )}
          </fieldset>
        </div>

        <CreditsHint
          remaining={creditsRemaining}
          limit={creditsLimit}
          tier={tier}
          byok={byok}
          error={error}
        />
      </div>
    </div>
  );
}

function CreditsHint({
  remaining,
  limit,
  tier,
  byok,
  error,
}: {
  remaining: number | null | undefined;
  limit: number | null | undefined;
  tier: "free" | "pro" | "ultra";
  byok: boolean;
  error: string | null | undefined;
}) {
  const { t } = useTranslation();
  if (error) {
    return (
      <p role="alert" className="mt-1.5 text-center text-destructive text-xs">
        {error}
      </p>
    );
  }
  if (PRODUCT_ACCESS_IS_FREE) return null;
  if (byok) {
    return (
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        {t("agent.creditsRunOnKey")}
      </p>
    );
  }
  if (!hasDisplayableQuota(remaining, limit)) {
    return (
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        {t("agent.creditsHint")}
      </p>
    );
  }
  const quotaRemaining = Number(remaining);
  const quotaLimit = Number(limit);
  const low = quotaRemaining <= Math.max(2, Math.floor(quotaLimit * 0.2));
  return (
    <p
      className={cn(
        "mt-1.5 text-center text-[10px]",
        low ? "text-destructive/80" : "text-muted-foreground",
      )}
    >
      {t("agent.messagesPerDay", { remaining: quotaRemaining, limit: quotaLimit })}
      {" · "}
      <span className="font-mono uppercase tracking-wide">{tier}</span>
      {low ? (
        <>
          {" · "}
          <Link to="/settings" className="underline underline-offset-2">
            {t("agent.addKey")}
          </Link>
          {" · "}
          <Link to="/billing" className="underline underline-offset-2">
            {t("agent.upgrade")}
          </Link>
        </>
      ) : null}
    </p>
  );
}
