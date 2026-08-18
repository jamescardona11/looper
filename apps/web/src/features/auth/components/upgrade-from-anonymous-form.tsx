// Two-step upgrade form: anonymous user → email-verified account.
// Step 1 sends OTP via signIn('resend-otp'). Step 2 uses
// useUpgradeFromAnonymous which calls signIn(code) AND claims the
// orphaned anonymous user's data atomically.

import { useAuth, useUpgradeFromAnonymous } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconMail, IconShieldCheck } from "@tabler/icons-react";
import { useState } from "react";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

type Step = { kind: "email" } | { kind: "code"; email: string };

export function UpgradeFromAnonymousForm() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { upgrade, isReady } = useUpgradeFromAnonymous();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      await signIn("resend-otp", fd);
      setStep({ kind: "code", email });
    } catch (cause) {
      setError(friendlyError(cause, t("auth.sendCodeError")));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind !== "code") return;
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("email", step.email);
      fd.set("code", code);
      await upgrade(fd);
      setDone(true);
    } catch (cause) {
      setError(friendlyError(cause, t("auth.verifyCodeError")));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        <IconShieldCheck className="size-4 text-primary" />
        {t("auth.dataMigrated")}
      </div>
    );
  }

  if (step.kind === "email") {
    return (
      <form className="space-y-3" onSubmit={requestCode}>
        <label
          className="block text-[10px] text-muted-foreground uppercase tracking-[0.18em]"
          htmlFor="upgrade-email"
        >
          {t("auth.email")}
        </label>
        <Input
          id="upgrade-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!isReady}
        />
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <Button type="submit" disabled={!email || submitting || !isReady} className="w-full">
          <IconMail className="size-4" />
          {submitting ? t("auth.sendingCode") : t("auth.emailMeCode")}
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-3" onSubmit={submitCode}>
      <p className="text-muted-foreground text-xs">
        {t("auth.codeSentToShort")}{" "}
        <span className="font-medium text-foreground">{step.email}</span>
      </p>
      <Input
        id="upgrade-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={t("auth.codePlaceholder")}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            setStep({ kind: "email" });
            setCode("");
            setError("");
          }}
          className="flex-1"
        >
          {t("common.back")}
        </Button>
        <Button type="submit" disabled={!code || submitting} className="flex-1">
          {submitting ? t("auth.verifying") : t("auth.confirmKeepData")}
        </Button>
      </div>
    </form>
  );
}
