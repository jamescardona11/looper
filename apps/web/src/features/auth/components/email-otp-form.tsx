import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconMail } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

type Step = { kind: "email" } | { kind: "code"; email: string };

export function EmailOtpForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("email", email);
      await signIn("resend-otp", formData);
      setStep({ kind: "code", email });
      toast.success(`${t("auth.codeSentToShort")} ${email}`);
    } catch (cause) {
      const msg = friendlyError(cause, t("auth.sendCodeError"));
      setError(msg);
      toast.error(msg);
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
      const formData = new FormData();
      formData.set("email", step.email);
      formData.set("code", code);
      await signIn("resend-otp", formData);
      await navigate({ to: "/" });
    } catch (cause) {
      const msg = friendlyError(cause, t("auth.verifyCodeError"));
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (step.kind === "email") {
    return (
      <form className="w-full space-y-3" onSubmit={requestCode}>
        <label className="block font-medium text-sm" htmlFor="email">
          {t("auth.email")}
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 sm:h-10"
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={!email || submitting} className="h-11 w-full sm:h-9">
          <IconMail className="size-4" />
          {submitting ? t("auth.sendingCode") : t("auth.emailMeCode")}
        </Button>
      </form>
    );
  }

  return (
    <form className="w-full space-y-3" onSubmit={submitCode}>
      <p className="text-muted-foreground text-sm">
        {t("auth.codeSentTo")} <span className="font-medium text-foreground">{step.email}</span>
      </p>
      <label className="block font-medium text-sm" htmlFor="code">
        {t("auth.codeLabel")}
      </label>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={t("auth.codePlaceholder")}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="h-11 sm:h-10"
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!code || submitting} className="h-11 w-full sm:h-9">
        {submitting ? t("auth.verifying") : t("auth.signIn")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setError("");
          setCode("");
          setStep({ kind: "email" });
        }}
        className="h-11 w-full sm:h-9"
      >
        {t("auth.useDifferentEmail")}
      </Button>
    </form>
  );
}
