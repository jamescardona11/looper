import { useFeedback } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconCheck, IconClock, IconMapPin, IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PublicPageLayout } from "@/shared/components/public-page-layout";
import type { ContactIntent } from "./contact-intent";

type FormState = "idle" | "submitting" | "success";
const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

function normalizeGithubUsername(value: string): string | undefined {
  const username = value.trim().replace(/^@/, "");

  if (!GITHUB_USERNAME_PATTERN.test(username) || username.includes("--")) {
    return undefined;
  }

  return username;
}

export function ContactPage({ intent }: { intent?: ContactIntent }) {
  const { t } = useTranslation();
  const submitContact = useFeedback();
  const [form, setForm] = useState({
    name: "",
    email: "",
    githubUsername: "",
    message: "",
  });
  const [formState, setFormState] = useState<FormState>("idle");
  const [error, setError] = useState(false);
  const [githubError, setGithubError] = useState(false);
  const isPurchaseRequest = intent === "purchase";

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === "githubUsername") {
      setGithubError(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const githubUsername = isPurchaseRequest
      ? normalizeGithubUsername(form.githubUsername)
      : undefined;

    if (isPurchaseRequest && !githubUsername) {
      setGithubError(true);
      return;
    }

    setFormState("submitting");
    setError(false);
    try {
      // The anonymous feedback contract has no structured contact fields, so
      // purchase details are stored as a small, consistently formatted record.
      const details = [
        isPurchaseRequest ? "[purchase-request]" : "[contact]",
        `Name: ${form.name}`,
        `Email: ${form.email}`,
      ];

      if (isPurchaseRequest) {
        details.push(`GitHub: ${githubUsername}`);
      }

      const message = form.message.trim();

      if (message) {
        details.push("", message);
      }

      await submitContact({
        kind: "other",
        message: details.join("\n"),
        path: isPurchaseRequest ? "/contact?intent=purchase" : "/contact",
      });
      setFormState("success");
      setForm({ name: "", email: "", githubUsername: "", message: "" });
    } catch {
      setError(true);
      setFormState("idle");
    }
  }

  return (
    <PublicPageLayout purchaseRequest={isPurchaseRequest}>
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
          <div>
            <Eyebrow className="text-primary">
              {isPurchaseRequest ? t("contact.purchaseEyebrow") : t("public.contact")}
            </Eyebrow>
            <h1 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
              {isPurchaseRequest ? t("contact.purchaseTitle") : t("contact.title")}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm">
              {isPurchaseRequest ? t("contact.purchaseSubtitle") : t("contact.subtitle")}
            </p>

            {formState === "success" ? (
              <SuccessBanner purchaseRequest={isPurchaseRequest} />
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
                <Field
                  label={t("contact.nameLabel")}
                  name="name"
                  type="text"
                  placeholder={t("contact.namePlaceholder")}
                  value={form.name}
                  onChange={handleChange}
                  required
                />
                <Field
                  label={t("auth.email")}
                  name="email"
                  type="email"
                  placeholder="jane@example.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
                {isPurchaseRequest && (
                  <Field
                    label={t("contact.githubUsernameLabel")}
                    name="githubUsername"
                    type="text"
                    placeholder="jane-smith"
                    value={form.githubUsername}
                    onChange={handleChange}
                    hint={t("contact.githubUsernameHint")}
                    error={githubError ? t("contact.githubUsernameError") : undefined}
                    required
                  />
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="message" className="font-medium text-foreground text-sm">
                    {isPurchaseRequest
                      ? t("contact.purchaseMessageLabel")
                      : t("contact.messageLabel")}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder={
                      isPurchaseRequest
                        ? t("contact.purchaseMessagePlaceholder")
                        : t("contact.messagePlaceholder")
                    }
                    value={form.message}
                    onChange={handleChange}
                    required={!isPurchaseRequest}
                    className="resize-none rounded-lg border border-border bg-card px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <button
                  type="submit"
                  disabled={formState === "submitting"}
                  className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {formState === "submitting"
                    ? t("contact.sending")
                    : isPurchaseRequest
                      ? t("contact.purchaseSend")
                      : t("contact.send")}
                </button>
                {error && (
                  <p className="text-destructive text-sm" role="alert">
                    {t("common.error")}
                  </p>
                )}
              </form>
            )}
          </div>

          <aside className="self-start border-border border-y lg:mt-16">
            <section className="py-6">
              <h2 className="mb-4 font-display font-semibold text-base tracking-tight">
                {t("contact.directContactTitle")}
              </h2>
              <div className="flex flex-col gap-4 text-muted-foreground text-sm">
                <InfoRow icon={IconUser} label={t("contact.builderLabel")}>
                  <a
                    href="https://www.jamescardona11.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground transition-colors hover:text-muted-foreground"
                  >
                    James Cardona
                  </a>
                </InfoRow>
                <InfoRow icon={IconMapPin} label={t("contact.locationLabel")}>
                  {t("contact.locationValue")}
                </InfoRow>
                <InfoRow icon={IconClock} label={t("contact.responseTimeLabel")}>
                  {t("contact.responseTimeValue")}
                </InfoRow>
              </div>
            </section>

            <section className="border-border border-t py-6">
              <h2 className="mb-3 font-display font-semibold text-base tracking-tight">
                {t("contact.whatToExpectTitle")}
              </h2>
              <ul className="flex flex-col gap-2.5 text-muted-foreground text-sm">
                {[
                  t("contact.expect1"),
                  t("contact.expect2"),
                  t("contact.expect3"),
                  t("contact.expect4"),
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </PublicPageLayout>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
  value,
  onChange,
  hint,
  error,
  required,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  const descriptionId = hint || error ? `${name}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="font-medium text-foreground text-sm">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        aria-describedby={descriptionId}
        aria-invalid={error ? true : undefined}
        className="h-10 rounded-lg border border-border bg-card px-4 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {(error || hint) && (
        <p
          id={descriptionId}
          className={error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="font-medium text-muted-foreground text-xs">{label}</p>
        <p className="text-foreground text-sm">{children}</p>
      </div>
    </div>
  );
}

function SuccessBanner({ purchaseRequest }: { purchaseRequest: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/20 text-primary">
        <IconCheck className="size-6" />
      </span>
      <h3 className="font-display font-semibold text-base tracking-tight">
        {purchaseRequest ? t("contact.purchaseSuccessTitle") : t("contact.successTitle")}
      </h3>
      <p className="text-muted-foreground text-sm">
        {purchaseRequest ? t("contact.purchaseSuccessMessage") : t("contact.successMessage")}
      </p>
    </div>
  );
}
