import { TIERS, type Tier, type TierConfig } from "@looper/config/billing";
import { useAuth } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { includedMarketingFeatures } from "@/features/billing";
import { Eyebrow } from "@/shared/components/eyebrow";
import { PublicPageLayout } from "@/shared/components/public-page-layout";
import { Switch } from "@/shared/components/ui/switch";
import { ToggleGroup } from "@/shared/components/ui/toggle-group";

// FAQ items are built inside the component so they can use the translation function.
const FAQ_KEYS = [
  { q: "pricing.faq.q1", a: "pricing.faq.a1" },
  { q: "pricing.faq.q2", a: "pricing.faq.a2" },
  { q: "pricing.faq.q3", a: "pricing.faq.a3" },
  { q: "pricing.faq.q4", a: "pricing.faq.a4" },
] as const;

// faqSchema is computed inside PricingPage after translations are loaded.

export function PricingPage() {
  const { t, locale } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [yearly, setYearly] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>("pro");
  const selectedPlan = TIERS.find((tier) => tier.tier === selectedTier) ?? TIERS[1]!;

  const faqItems = FAQ_KEYS.map((k) => ({ question: t(k.q), answer: t(k.a) }));

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <PublicPageLayout>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data for SEO
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="border-border border-b px-5 py-14 text-center sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Eyebrow className="text-primary">{t("landing.pricing.eyebrow")}</Eyebrow>
          <h1 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
            {t("landing.pricing.headline")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            {t("landing.pricing.subtitle")}
          </p>

          {/* Monthly / Yearly toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
            <span
              className={`font-medium text-sm ${!yearly ? "text-foreground" : "text-muted-foreground"}`}
            >
              {t("billing.monthly")}
            </span>
            <Switch
              aria-label={`${t("billing.monthly")} / ${t("billing.yearly")}`}
              checked={yearly}
              onCheckedChange={setYearly}
            />
            <span
              className={`font-medium text-sm ${yearly ? "text-foreground" : "text-muted-foreground"}`}
            >
              {t("billing.yearly")}
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary text-xs">
                {t("pricing.bestValue")}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div data-testid="public-focused-plan-picker" className="xl:hidden">
            <ToggleGroup
              aria-label={t("billing.plans")}
              value={selectedTier}
              onValueChange={setSelectedTier}
              size="sm"
              className="mb-5 w-full"
              items={TIERS.map((tier) => ({
                value: tier.tier,
                label: tier.name,
              }))}
            />
            <PricingCard
              tier={selectedPlan}
              yearly={yearly}
              isAuthenticated={isAuthenticated}
              locale={locale}
            />
          </div>
          <div
            data-testid="public-desktop-plan-grid"
            className="hidden items-stretch gap-5 xl:grid xl:grid-cols-[0.92fr_1.08fr_0.92fr]"
          >
            {TIERS.map((tier) => (
              <PricingCard
                key={tier.tier}
                tier={tier}
                yearly={yearly}
                isAuthenticated={isAuthenticated}
                locale={locale}
              />
            ))}
          </div>
          <p className="mt-10 border-border border-y py-5 text-center text-muted-foreground text-sm">
            {t("landing.pricing.note")}
          </p>
        </div>
      </section>

      <section className="border-border border-t px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <Eyebrow className="text-primary">{t("landing.nav.features")}</Eyebrow>
            <h2 className="mt-4 font-bold font-display text-4xl text-foreground leading-[0.95] tracking-tighter md:text-5xl">
              {t("landing.faq.headline")}
            </h2>
          </div>
          <div className="divide-y divide-border border-border border-y">
            {faqItems.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium text-sm">
                  {item.question}
                  <IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pb-5 text-muted-foreground text-sm leading-relaxed">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </PublicPageLayout>
  );
}

function PricingCard({
  tier,
  yearly,
  isAuthenticated,
  locale,
}: {
  tier: TierConfig;
  yearly: boolean;
  isAuthenticated: boolean;
  locale: string;
}) {
  const { t } = useTranslation();
  const isPopular = tier.tier === "pro";
  const monthlyPrice = tier.displayPriceUsd;
  const yearlyPrice = tier.displayPriceYearlyUsd;
  const yearlyMonthlyRate = yearlyPrice / 12;
  const displayPrice = yearly
    ? yearlyMonthlyRate.toLocaleString(locale, {
        minimumFractionDigits: Number.isInteger(yearlyMonthlyRate) ? 0 : 2,
        maximumFractionDigits: 2,
      })
    : monthlyPrice;
  const yearlySavings = Math.max(0, monthlyPrice * 12 - yearlyPrice);
  const features = includedMarketingFeatures(tier.tier, TIERS);

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        isPopular ? "border-primary bg-primary/[0.04] xl:-my-3 xl:py-9" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-base">{tier.name}</h3>
        {isPopular ? <Eyebrow className="text-primary">{t("billing.recommended")}</Eyebrow> : null}
      </div>
      <p className="mt-0.5 text-muted-foreground text-sm">{t(`billing.planHint.${tier.tier}`)}</p>
      <div className="mt-4">
        <span className="font-bold font-display text-3xl tabular-nums tracking-tight">
          ${displayPrice}
        </span>
        <span className="text-muted-foreground text-sm">{t("pricing.perMonth")}</span>
        {yearly && monthlyPrice > 0 ? (
          <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
            <span className="text-muted-foreground">
              {t("pricing.billedYearly", { amount: `$${yearlyPrice}` })}
            </span>
            {yearlySavings > 0 ? (
              <span className="font-medium text-primary">
                {t("pricing.saveYearly", { amount: `$${yearlySavings}` })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="mt-6 flex flex-col gap-2.5">
        {features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-sm">
            <IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">{t(feat)}</span>
          </li>
        ))}
      </ul>
      <Link
        to={isAuthenticated ? "/billing" : "/sign-in"}
        className={`mt-8 inline-flex h-10 items-center justify-center rounded-lg px-4 font-medium text-sm transition-colors ${
          isPopular
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border bg-transparent text-foreground hover:bg-secondary"
        }`}
      >
        {isAuthenticated ? t("billing.manageBilling") : t("landing.getStarted")}
      </Link>
    </div>
  );
}
