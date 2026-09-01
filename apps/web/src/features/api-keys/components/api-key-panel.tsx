import { useTranslation } from "@looper/i18n/react";
import {
  IconEye,
  IconEyeOff,
  IconKey,
  IconLoader2,
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { reportError } from "@/lib/errors";
import { useConfirm } from "@/shared/components/confirm-dialog";
import { Button, Card, CardContent } from "@/shared/components/ui";
import { type ApiKeyProvider, type ProviderKeyStatus, useApiKeys } from "../hooks/use-api-key";

const PLACEHOLDER: Record<ApiKeyProvider, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "AIza...",
};

export function ApiKeyPanel() {
  const { t } = useTranslation();
  const { providers, isLoading, save, test, clear } = useApiKeys();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-muted-foreground text-sm">
          <IconLoader2 className="size-4 motion-safe:animate-spin" />
          {t("apiKeys.loadingStatus")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("apiKeys.description")}</p>
      {(providers ?? []).map((p) => (
        <ProviderKeyRow key={p.provider} status={p} onSave={save} onTest={test} onClear={clear} />
      ))}
    </div>
  );
}

function ProviderKeyRow({
  status,
  onSave,
  onTest,
  onClear,
}: {
  status: ProviderKeyStatus;
  onSave: (provider: ApiKeyProvider, plaintext: string) => Promise<unknown>;
  onTest: (provider: ApiKeyProvider) => Promise<{ ok: boolean; error: string | null }>;
  onClear: (provider: ApiKeyProvider) => Promise<unknown>;
}) {
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = status.configured;

  const onSaveClick = async () => {
    setError(null);
    if (!draft.trim()) {
      setError(t("apiKeys.pasteFirst", { label: status.label }));
      return;
    }
    setBusy("save");
    try {
      await onSave(status.provider, draft.trim());
      setDraft("");
    } catch (err) {
      setError(reportError(err, t("apiKeys.saveFailed")));
    } finally {
      setBusy(null);
    }
  };

  const onTestClick = async () => {
    setError(null);
    setBusy("test");
    try {
      const res = await onTest(status.provider);
      if (!res.ok && res.error) setError(reportError(res.error, t("apiKeys.testFailed")));
    } catch (err) {
      setError(reportError(err, t("apiKeys.testFailed")));
    } finally {
      setBusy(null);
    }
  };

  const onClearClick = async () => {
    setError(null);
    const confirmed = await confirm({
      title: t("settings.removeKey"),
      description: t("settings.removeKeyHint"),
      confirmLabel: t("settings.remove"),
      destructive: true,
    });
    if (!confirmed) return;

    setBusy("clear");
    try {
      await onClear(status.provider);
    } catch (err) {
      setError(reportError(err, t("apiKeys.removeFailed")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card role="group" aria-label={status.label}>
      <CardContent className="flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-secondary">
              <IconKey className="size-4 text-muted-foreground" />
            </span>
            <div>
              <p className="font-medium text-sm tracking-tight">{status.label}</p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {configured ? t("apiKeys.configured") : t("apiKeys.notConfigured")}
              </p>
            </div>
          </div>
          <StatusPill configured={configured} />
        </header>

        {!configured ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`api-key-${status.provider}`}
              className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide"
            >
              {t("apiKeys.pasteKey")}
            </label>
            <div className="flex gap-2">
              <div
                className={cn(
                  "flex flex-1 items-center gap-1 rounded-lg border border-border bg-card px-2 transition-colors",
                  "focus-within:border-foreground/30",
                )}
              >
                <input
                  id={`api-key-${status.provider}`}
                  type={showKey ? "text" : "password"}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={t("apiKeys.pasteKey")}
                  placeholder={PLACEHOLDER[status.provider]}
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 bg-transparent px-1 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-10"
                  aria-label={showKey ? t("apiKeys.hideKey") : t("apiKeys.showKey")}
                >
                  {showKey ? <IconEyeOff className="size-3.5" /> : <IconEye className="size-3.5" />}
                </button>
              </div>
              <Button
                onClick={onSaveClick}
                disabled={busy !== null}
                className="min-h-11 sm:min-h-10"
              >
                {busy === "save" ? (
                  <IconLoader2 className="size-3.5 motion-safe:animate-spin" />
                ) : null}
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <p className="text-muted-foreground text-xs">
                {status.lastTestedAt
                  ? t("apiKeys.lastTested", {
                      when: relativeTime(status.lastTestedAt, locale),
                      result: status.lastTestOk ? t("apiKeys.ok") : t("apiKeys.failed"),
                    })
                  : t("apiKeys.notTestedYet")}
              </p>
              {status.lastTestError ? (
                <p className="text-[10px] text-destructive">{status.lastTestError}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onTestClick}
                disabled={busy !== null}
                className="min-h-11 sm:min-h-10"
              >
                {busy === "test" ? (
                  <IconLoader2 className="size-3.5 motion-safe:animate-spin" />
                ) : (
                  <IconShieldCheck className="size-3.5" />
                )}
                {t("settings.testKey")}
              </Button>
              <Button
                variant="outline"
                onClick={onClearClick}
                disabled={busy !== null}
                className="min-h-11 sm:min-h-10"
              >
                {busy === "clear" ? (
                  <IconLoader2 className="size-3.5 motion-safe:animate-spin" />
                ) : (
                  <IconTrash className="size-3.5" />
                )}
                {t("settings.remove")}
              </Button>
            </div>
          </div>
        )}

        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatusPill({ configured }: { configured: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        configured
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {configured ? t("apiKeys.active") : t("apiKeys.notConfiguredPill")}
    </span>
  );
}

function relativeTime(ms: number, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const delta = ms - Date.now();
  const absoluteDelta = Math.abs(delta);

  if (absoluteDelta < 60_000) return formatter.format(0, "second");
  if (absoluteDelta < 3_600_000) return formatter.format(Math.round(delta / 60_000), "minute");
  if (absoluteDelta < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), "hour");
  return formatter.format(Math.round(delta / 86_400_000), "day");
}
