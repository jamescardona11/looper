import { useSubscription } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconArrowUpRight, IconCreditCard } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { Eyebrow } from "@/shared/components/eyebrow";
import { buttonVariants, Card } from "@/shared/components/ui";
import { SectionHeader } from "../components/section-header";

export function SubscriptionTab() {
  const { t } = useTranslation();
  const { tier, status, isLoading } = useSubscription();
  const planLabel = isLoading ? "—" : tier.charAt(0).toUpperCase() + tier.slice(1);
  const statusLabel = getSubscriptionStatusLabel({ isLoading, status, tier, t });

  return (
    <div>
      <SectionHeader
        title={t("settings.subscription")}
        hint={t("settings.subscriptionHint")}
        icon={<IconCreditCard />}
      />
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-medium text-base tracking-tight">
            {planLabel} {t("billing.currentPlan")}
          </h3>
          <Eyebrow>{statusLabel}</Eyebrow>
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            {tier === "free" ? t("settings.upgradeHint") : t("settings.manageBillingHint")}
          </p>
          <Link to="/billing" className={buttonVariants()}>
            {tier === "free" ? t("settings.seePlans") : t("billing.manageBilling")}
            <IconArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function getSubscriptionStatusLabel({
  isLoading,
  status,
  tier,
  t,
}: {
  isLoading: boolean;
  status: string;
  tier: string;
  t: (id: string) => string;
}) {
  if (isLoading) return "—";
  if (status === "active" || (tier === "free" && status === "none")) {
    return t("settings.active");
  }
  if (status === "trialing") return t("settings.trialing");
  if (status === "past_due") return t("settings.pastDue");
  if (status === "canceled") return t("settings.canceled");
  if (status === "expired") return t("settings.expired");
  return t("settings.inactive");
}
