import { ONE_TIME_GRANTS, type OneTimePack, TIERS, type Tier } from "@looper/config/billing";
import { useSubscription } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconBolt, IconCheck, IconCrown } from "@tabler/icons-react";
import { useState } from "react";
import { useRequireAuth } from "@/features/auth";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ToggleGroup,
} from "@/shared/components/ui";
import {
  BILLING_ENABLED,
  CREDIT_PACKS_ENABLED,
  DEFAULT_PAYMENT_PROVIDER,
  type PaymentProvider,
  paymentProviderSupportsYearly,
  SHOW_PAYMENT_PROVIDER_TOGGLE,
  useBillingActions,
} from "./hooks/use-billing-actions";
import { includedMarketingFeatures } from "./marketing-features";

const HIGHLIGHTED: Tier = "pro";
const CREDIT_PACK_ORDER: OneTimePack[] = ["credits_100", "credits_500", "lifetime"];

export function BillingPage() {
  const { t } = useTranslation();
  const gate = useRequireAuth();
  const { tier: currentTier, isLoading: subLoading } = useSubscription();
  const [provider, setProvider] = useState<PaymentProvider>(DEFAULT_PAYMENT_PROVIDER);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [selectedTier, setSelectedTier] = useState<Tier>(HIGHLIGHTED);
  // Yearly is available when the active provider has yearly prices: Stripe is
  // configured for it; Polar only when `_yearly` products are configured. When it
  // isn't, force monthly so checkout never resolves a missing yearly product.
  const yearlyAvailable = paymentProviderSupportsYearly(provider);
  const interval = yearlyAvailable ? billingInterval : "monthly";
  const { openPortal, upgrade, buyCredits, busy, error } = useBillingActions(provider, interval);
  const upgrading = busy?.kind === "upgrade";
  const selectedPlan = TIERS.find((tier) => tier.tier === selectedTier) ?? TIERS[1]!;
  const unavailablePlanLabel = t("billing.notConfigured");

  if (gate) return gate;

  return (
    <ProductPageLayout>
      <div className="flex flex-col gap-6">
        <ProductPageHeader
          eyebrow={t("nav.billing")}
          title={t("billing.pricingTagline")}
          description={t("billing.pricingSubtitle")}
        />

        {/* Manage-subscription banner — only for an active paid plan */}
        {BILLING_ENABLED && currentTier !== "free" && !subLoading ? (
          <Card className="flex flex-col items-center justify-between gap-3 p-5 sm:flex-row">
            <p className="text-foreground text-sm">
              {t("billing.currentPlanBanner", {
                plan: TIERS.find((x) => x.tier === currentTier)?.name ?? currentTier,
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-8"
              onClick={() => void openPortal()}
              disabled={busy !== null}
            >
              {t("billing.manageSubscription")}
            </Button>
          </Card>
        ) : null}

        {/* Plan controls — payment provider + billing period in one tidy row.
            Both stay visible while Stripe and Polar are configured; the period toggle
            appears when the active provider supports yearly. */}
        {SHOW_PAYMENT_PROVIDER_TOGGLE || yearlyAvailable ? (
          <div className="flex flex-col gap-2 border-border border-y py-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {SHOW_PAYMENT_PROVIDER_TOGGLE ? (
                <div className="flex items-center gap-2.5">
                  <Eyebrow>{t("billing.paymentProvider")}</Eyebrow>
                  <ToggleGroup
                    aria-label={t("billing.paymentProvider")}
                    value={provider}
                    onValueChange={setProvider}
                    size="sm"
                    items={[
                      { value: "stripe", label: "Stripe" },
                      { value: "polar", label: "Polar" },
                    ]}
                  />
                </div>
              ) : null}
              {yearlyAvailable ? (
                <div className="flex items-center gap-2.5">
                  <Eyebrow>{t("billing.billingPeriod")}</Eyebrow>
                  <ToggleGroup
                    aria-label={t("billing.billingPeriod")}
                    value={billingInterval}
                    onValueChange={setBillingInterval}
                    size="sm"
                    items={[
                      { value: "monthly", label: t("billing.monthly") },
                      { value: "yearly", label: t("billing.yearly") },
                    ]}
                  />
                </div>
              ) : null}
            </div>
            {provider === "polar" ? (
              <p className="text-muted-foreground text-xs">{t("billing.polarTaxNote")}</p>
            ) : null}
          </div>
        ) : null}

        <section data-testid="focused-plan-picker" className="xl:hidden">
          <ToggleGroup
            aria-label={t("billing.plans")}
            value={selectedTier}
            onValueChange={setSelectedTier}
            size="sm"
            className="mb-4 w-full"
            items={TIERS.map((tier) => ({
              value: tier.tier,
              label: tier.name,
            }))}
          />
          <PlanCard
            name={selectedPlan.name}
            description={t(`billing.planHint.${selectedPlan.tier}`)}
            priceUsd={
              interval === "yearly"
                ? selectedPlan.displayPriceYearlyUsd
                : selectedPlan.displayPriceUsd
            }
            interval={interval}
            features={[...includedMarketingFeatures(selectedPlan.tier, TIERS)]}
            current={currentTier === selectedPlan.tier && !subLoading}
            recommended={selectedPlan.tier === HIGHLIGHTED}
            upgrading={upgrading}
            onUpgrade={
              selectedPlan.tier === "free" || !BILLING_ENABLED
                ? null
                : () => upgrade(selectedPlan.tier)
            }
            billingConfigured={BILLING_ENABLED}
            unavailablePlanLabel={unavailablePlanLabel}
          />
        </section>

        <div
          data-testid="desktop-plan-grid"
          className="hidden items-stretch gap-5 xl:grid xl:grid-cols-[280px_minmax(0,1fr)]"
        >
          <Card className="flex flex-col p-3">
            <Eyebrow className="px-2 pt-2">{t("billing.plans")}</Eyebrow>
            <div className="mt-3 flex flex-1 flex-col gap-2">
              {TIERS.map((tier) => {
                const selected = selectedTier === tier.tier;
                const current = currentTier === tier.tier && !subLoading;
                const price =
                  interval === "yearly" ? tier.displayPriceYearlyUsd : tier.displayPriceUsd;

                return (
                  <button
                    key={tier.tier}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedTier(tier.tier)}
                    className={cn(
                      "flex flex-1 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary/50 bg-primary/5"
                        : "border-transparent hover:border-border hover:bg-secondary/40",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-sm">{tier.name}</span>
                        {current ? (
                          <Badge variant="muted" className="text-[9px] uppercase tracking-wider">
                            {t("billing.current")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
                        {t(`billing.planHint.${tier.tier}`)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium text-lg tabular-nums">${price}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {interval === "yearly" ? t("billing.perYear") : t("billing.perMonth")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <PlanCard
            name={selectedPlan.name}
            description={t(`billing.planHint.${selectedPlan.tier}`)}
            priceUsd={
              interval === "yearly"
                ? selectedPlan.displayPriceYearlyUsd
                : selectedPlan.displayPriceUsd
            }
            interval={interval}
            features={[...includedMarketingFeatures(selectedPlan.tier, TIERS)]}
            current={currentTier === selectedPlan.tier && !subLoading}
            recommended={selectedPlan.tier === HIGHLIGHTED}
            upgrading={upgrading}
            onUpgrade={
              selectedPlan.tier === "free" || !BILLING_ENABLED
                ? null
                : () => upgrade(selectedPlan.tier)
            }
            billingConfigured={BILLING_ENABLED}
            unavailablePlanLabel={unavailablePlanLabel}
            featured
          />
        </div>

        {error ? (
          <p role="alert" className="text-center text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {CREDIT_PACKS_ENABLED ? (
          <section className="border-border border-t pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Eyebrow>{t("billing.creditPacksTitle")}</Eyebrow>
                <h2 className="mt-2 font-medium text-xl tracking-tight">
                  {t("billing.creditPacksHeading")}
                </h2>
              </div>
              <p className="max-w-md text-muted-foreground text-sm sm:text-right">
                {t("billing.creditPacksHint")}
              </p>
            </div>
            <div className="mt-5 grid overflow-hidden rounded-2xl border border-border bg-secondary/20 md:grid-cols-3">
              {CREDIT_PACK_ORDER.map((pack, index) => (
                <CreditPackOption
                  key={pack}
                  pack={pack}
                  buying={busy?.kind === "credits" && busy.pack === pack}
                  disabled={busy !== null}
                  onBuy={() => void buyCredits(pack)}
                  className={cn(index > 0 && "border-border border-t md:border-t-0 md:border-l")}
                />
              ))}
            </div>
          </section>
        ) : null}

        {BILLING_ENABLED ? (
          <p className="text-center text-muted-foreground text-xs">
            {provider === "polar"
              ? t("billing.pricesViaPolar")
              : interval === "yearly"
                ? t("billing.pricesViaStripeYearly")
                : t("billing.pricesViaStripeMonthly")}
          </p>
        ) : null}
      </div>
    </ProductPageLayout>
  );
}

function CreditPackOption({
  pack,
  buying,
  disabled,
  onBuy,
  className,
}: {
  pack: OneTimePack;
  buying: boolean;
  disabled: boolean;
  onBuy: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const grant = ONE_TIME_GRANTS[pack];
  const lifetime = Boolean(grant.tier);
  const credits = (grant.credits ?? 0).toLocaleString();
  const title = lifetime ? t("billing.pack.lifetime.title") : `${credits} ${t("usage.credits")}`;
  const actionLabel = lifetime
    ? t("billing.pack.lifetime.action")
    : t("billing.pack.credits.action", { credits });

  return (
    <article aria-label={title} className={cn("flex min-w-0 flex-col p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-primary">
          {lifetime ? (
            <IconCrown className="size-5" aria-hidden />
          ) : (
            <IconBolt className="size-5" aria-hidden />
          )}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {lifetime ? t("billing.pack.permanent") : t("billing.pack.topUp")}
        </span>
      </div>
      <h3 className="mt-5 font-medium text-lg tracking-tight">{title}</h3>
      <p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">
        {lifetime ? t("billing.pack.lifetime.hint", { credits }) : t(`billing.pack.${pack}.hint`)}
      </p>
      <Button
        variant={lifetime ? "primary" : "secondary"}
        className="mt-5 h-11 w-full sm:h-9"
        disabled={disabled}
        onClick={onBuy}
      >
        {buying ? t("billing.loading") : actionLabel}
      </Button>
    </article>
  );
}

function PlanCard({
  name,
  description,
  priceUsd,
  interval,
  features,
  current,
  recommended,
  upgrading,
  onUpgrade,
  billingConfigured,
  unavailablePlanLabel,
  featured = false,
}: {
  name: string;
  description: string;
  priceUsd: number;
  interval: "monthly" | "yearly";
  features: string[];
  current: boolean;
  recommended: boolean;
  upgrading: boolean;
  onUpgrade: (() => void) | null;
  billingConfigured: boolean;
  unavailablePlanLabel: string;
  featured?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card
      role="article"
      aria-label={name}
      className={cn(
        "flex flex-col",
        recommended && "border-primary/60 bg-card",
        featured && "overflow-hidden",
      )}
    >
      <div className={cn(featured && "grid flex-1 grid-cols-[minmax(0,0.9fr)_minmax(22rem,1fr)]")}>
        <CardHeader className={cn("pb-4", featured && "justify-center border-border border-r p-8")}>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="font-medium text-base">{name}</CardTitle>
            <div className="flex flex-wrap justify-end gap-2">
              {current ? (
                <Badge variant="muted" className="text-[9px] uppercase tracking-wider">
                  {t("billing.current")}
                </Badge>
              ) : null}
              {recommended ? (
                <Badge variant="primary" className="text-[9px] uppercase tracking-wider">
                  {t("billing.recommended")}
                </Badge>
              ) : null}
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{description}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="font-medium text-4xl tabular-nums tracking-tighter">${priceUsd}</span>
            <span className="text-muted-foreground text-xs">
              {interval === "yearly" ? t("billing.perYear") : t("billing.perMonth")}
            </span>
          </div>
        </CardHeader>
        <CardContent className={cn("flex flex-1 flex-col", featured && "justify-center p-8")}>
          <Eyebrow className={cn("mb-4", !featured && "hidden")}>{t("billing.features")}</Eyebrow>
          <ul
            className={cn(
              "mb-8 flex-1 space-y-2.5 text-sm",
              featured && "grid flex-none grid-cols-2 gap-x-6 gap-y-3 space-y-0",
            )}
          >
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-foreground/90">
                <IconCheck className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />
                <span>{t(f)}</span>
              </li>
            ))}
          </ul>
          {onUpgrade ? (
            <Button
              onClick={onUpgrade}
              disabled={current || upgrading}
              className="h-11 w-full sm:h-9"
              variant={recommended ? "primary" : "secondary"}
            >
              {current
                ? t("billing.currentPlanButton")
                : upgrading
                  ? t("billing.loading")
                  : `${t("billing.choosePlan").replace("{plan}", name)}`}
            </Button>
          ) : (
            <Button disabled className="h-11 w-full sm:h-9" variant="secondary">
              {current
                ? t("billing.currentPlanButton")
                : billingConfigured
                  ? t("billing.default")
                  : unavailablePlanLabel}
            </Button>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
