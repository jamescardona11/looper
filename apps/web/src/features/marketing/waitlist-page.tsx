import { useWaitlist } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PublicPageLayout } from "@/shared/components/public-page-layout";

export function WaitlistPage({ referredBy }: { referredBy?: string }) {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { join, total, status } = useWaitlist(code);

  const submit = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await join({ email: email.trim(), ...(referredBy ? { referredBy } : {}) });
      setCode(res.referralCode);
      toast.success(res.alreadyJoined ? t("waitlist.alreadyOnList") : t("waitlist.onList"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("waitlist.joinError");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const shareUrl =
    code && typeof window !== "undefined" ? `${window.location.origin}/waitlist?ref=${code}` : "";

  const benefits = [t("waitlist.benefit1"), t("waitlist.benefit2"), t("waitlist.benefit3")];

  return (
    <PublicPageLayout>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.75fr)] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-10 lg:py-28">
        <div className="order-1 max-w-2xl lg:col-start-1 lg:row-start-1">
          <Eyebrow className="text-primary">{t("waitlist.eyebrow")}</Eyebrow>
          <h1 className="mt-5 max-w-xl font-bold font-display text-5xl leading-[0.92] tracking-tighter sm:text-6xl">
            {t("waitlist.title")}
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground leading-relaxed">
            {t("waitlist.subtitle")}
          </p>

          {typeof total === "number" && total > 0 ? (
            <p className="mt-6 font-mono text-muted-foreground text-xs uppercase tracking-wide">
              <span className="text-foreground tabular-nums">{total}</span>{" "}
              {t("waitlist.alreadyJoinedCount")}
            </p>
          ) : null}
        </div>

        <ol className="order-3 border-border border-t lg:col-start-1 lg:row-start-2">
          {benefits.map((benefit, index) => (
            <li
              key={benefit}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 border-border border-b py-4"
            >
              <span className="font-mono text-muted-foreground text-xs tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-sm">{benefit}</span>
            </li>
          ))}
        </ol>

        <div className="order-2 self-start border-border border-t pt-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-t-0 lg:border-l lg:pt-2 lg:pl-12">
          {code ? (
            <div>
              <span className="grid size-10 place-items-center rounded-lg bg-success/15 text-success">
                <IconCheck className="size-5" aria-hidden />
              </span>
              <h2 className="mt-6 font-display font-semibold text-3xl tracking-tight">
                {t("waitlist.youreIn")}
              </h2>
              {status ? (
                <p className="mt-3 text-muted-foreground">
                  {t("waitlist.position", { position: status.position })}
                  {status.referralCount > 0
                    ? ` · ${status.referralCount} ${t("waitlist.referred")}`
                    : ""}
                </p>
              ) : null}
              <label
                htmlFor="referral-link"
                className="mt-10 block font-mono text-muted-foreground text-xs uppercase tracking-wide"
              >
                {t("waitlist.shareToMoveUp")}
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="referral-link"
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-foreground text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl).then(
                      () => toast.success(t("waitlist.linkCopied")),
                      () => undefined,
                    );
                  }}
                  className="rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
                >
                  {t("agent.copy")}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
                {t("waitlist.eyebrow")}
              </p>
              <h2 className="mt-3 font-display font-semibold text-2xl tracking-tight">
                {t("waitlist.formTitle")}
              </h2>
              <label htmlFor="waitlist-email" className="mt-8 block font-medium text-sm">
                {t("waitlist.emailLabel")}
              </label>
              <input
                id="waitlist-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                aria-describedby={error ? "waitlist-error" : undefined}
                aria-invalid={error ? true : undefined}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={!email.trim() || busy}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? t("waitlist.joining") : t("waitlist.join")}
                {!busy ? <IconArrowRight className="size-4" aria-hidden /> : null}
              </button>
              {error ? (
                <p id="waitlist-error" role="alert" className="mt-3 text-destructive text-sm">
                  {error}
                </p>
              ) : null}
              <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
                {t("waitlist.termsNote")}{" "}
                <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
                  {t("legal.terms")}
                </Link>{" "}
                ·{" "}
                <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                  {t("legal.privacy")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </PublicPageLayout>
  );
}
