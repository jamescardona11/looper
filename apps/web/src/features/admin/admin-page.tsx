// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import {
  type AdminUser,
  useAdmin,
  useAdminActions,
  useAdminUserDetails,
  useIsAdmin,
} from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import {
  IconArrowRight,
  IconChartBar,
  IconCoin,
  IconCpu,
  IconCrown,
  IconMessage2,
  IconShieldLock,
  IconUserCheck,
  IconUsers,
} from "@tabler/icons-react";
import { Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { cn } from "@/lib/cn";
import { useConfirm } from "@/shared/components/confirm-dialog";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { Badge, Select } from "@/shared/components/ui";
import { Button, buttonVariants, Card } from "@/shared/components/ui";

export function AdminPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const isAdmin = useIsAdmin();

  if (isLoading || isAdmin === undefined) return <Loader />;
  if (!isAuthenticated) return <Navigate to="/sign-in" replace />;
  if (!isAdmin) return <AccessDenied />;

  return <AdminDashboard />;
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const admin = useAdmin();
  const { userCount, activeCount, users } = admin;
  const { usageStats, usageByUser } = admin;
  const { subStats } = admin;

  return (
    <ProductPageLayout>
      <ProductPageHeader
        eyebrow={t("admin.title")}
        title={t("admin.overview")}
        description={t("admin.overviewHint")}
      />

      <section className="grid divide-y divide-border border-border border-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <MetricCell
          icon={<IconUsers className="size-5" />}
          label={t("admin.totalUsers")}
          value={userCount ?? "—"}
        />
        <MetricCell
          icon={<IconUserCheck className="size-5" />}
          label={t("admin.active7d")}
          value={activeCount ?? "—"}
        />
        <MetricCell
          icon={<IconCrown className="size-5" />}
          label={t("admin.proSubscribers")}
          value={subStats?.pro ?? "—"}
        />
        <MetricCell
          icon={<IconChartBar className="size-5" />}
          label={t("admin.ultraSubscribers")}
          value={subStats?.ultra ?? "—"}
        />
      </section>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <Eyebrow>{t("admin.usageAndSpend")}</Eyebrow>
          <span className="text-muted-foreground text-xs">{t("admin.thisMonthEstimated")}</span>
        </div>
        <div className="mt-3 grid divide-y divide-border border-border border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <MetricCell
            icon={<IconCoin className="size-5" />}
            label={t("admin.estAiCost")}
            value={usageStats ? fmtUsd(usageStats.estimatedCostUsd) : "—"}
          />
          <MetricCell
            icon={<IconCpu className="size-5" />}
            label={t("admin.totalTokens")}
            value={usageStats ? fmtTokens(usageStats.totalTokens) : "—"}
          />
          <MetricCell
            icon={<IconMessage2 className="size-5" />}
            label={t("admin.aiMessages")}
            value={usageStats?.messages ?? "—"}
          />
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-border border-b px-6 py-4">
            <h3 className="font-medium text-sm tracking-tight">{t("admin.topSpenders")}</h3>
          </div>
          {usageByUser === undefined ? (
            <TableSkeleton columns={4} />
          ) : usageByUser.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground text-sm">
              {t("admin.noUsageThisMonth")}
            </p>
          ) : (
            <section aria-label={t("admin.topSpenders")}>
              <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,8rem)] border-border border-b px-6 py-3 font-mono text-[11px] text-muted-foreground uppercase tracking-wide md:grid">
                <span>{t("admin.nameEmail")}</span>
                <span className="text-right">{t("admin.messages")}</span>
                <span className="text-right">{t("admin.tokens")}</span>
                <span className="text-right">{t("admin.estCost")}</span>
              </div>
              <ul className="list-none">
                {usageByUser.map((u) => (
                  <li
                    key={u.userId}
                    className="grid gap-4 border-border border-b px-5 py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_repeat(3,8rem)] md:items-center md:px-6"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-sm">{u.name ?? "—"}</div>
                      <div className="truncate text-muted-foreground text-xs">
                        {u.email ?? u.userId}
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-3 md:contents">
                      <AdminDatum label={t("admin.messages")} value={String(u.messages)} />
                      <AdminDatum label={t("admin.tokens")} value={fmtTokens(u.totalTokens)} />
                      <AdminDatum
                        label={t("admin.estCost")}
                        value={fmtUsd(u.estimatedCostUsd)}
                        emphasized
                      />
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Card>
      </section>

      <Card className="mt-10 overflow-hidden">
        <div className="border-border border-b px-6 py-4">
          <h2 className="font-medium text-sm tracking-tight">{t("admin.allUsers")}</h2>
        </div>

        {users === undefined ? (
          <TableSkeleton columns={5} />
        ) : users.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground text-sm">{t("admin.noUsersYet")}</p>
        ) : (
          <section aria-label={t("admin.allUsers")}>
            <div className="hidden grid-cols-[minmax(12rem,1.3fr)_7rem_7rem_8rem_minmax(18rem,1fr)] border-border border-b px-6 py-3 font-mono text-[11px] text-muted-foreground uppercase tracking-wide lg:grid">
              <span>{t("admin.nameEmail")}</span>
              <span>{t("admin.tier")}</span>
              <span>{t("admin.status")}</span>
              <span>{t("admin.joined")}</span>
              <span>{t("admin.actions")}</span>
            </div>
            <ul className="list-none">
              {users.map((user: AdminUser) => (
                <UserRow key={user.id} user={user} />
              ))}
            </ul>
          </section>
        )}
      </Card>
    </ProductPageLayout>
  );
}

const TIERS_ORDER = ["free", "pro", "ultra"] as const;

function UserRow({ user }: { user: AdminUser }) {
  const { t, locale } = useTranslation();
  const actions = useAdminActions();
  const { promote, demote } = actions;
  const { grantTier } = actions;
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  // Read-only "view details" (impersonateUser returns profile + sub, not a token);
  // fetched on demand by toggling `viewing`.
  const details = useAdminUserDetails(user.id, viewing);

  const userId = user.id;
  const displayName = user.name ?? user.email ?? `${user.id.slice(0, 8)}…`;
  const joinedDate = new Date(user.joinedAt).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onTierChange = async (tier: "free" | "pro" | "ultra") => {
    if (tier === user.tier) return;
    const ok = await confirm({
      title: t("admin.confirmGrantTier", { tier }),
      confirmLabel: t("common.confirm"),
    });
    if (!ok) return;
    void run(() => grantTier(userId, tier));
  };

  return (
    <li className="border-border border-b last:border-0">
      <div className="grid gap-4 px-5 py-4 transition-colors hover:bg-secondary/30 sm:grid-cols-3 lg:grid-cols-[minmax(12rem,1.3fr)_7rem_7rem_8rem_minmax(18rem,1fr)] lg:items-center lg:px-6">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <p className="truncate font-medium tracking-tight">{displayName}</p>
          {user.email && user.name ? (
            <p className="truncate text-muted-foreground text-xs">{user.email}</p>
          ) : null}
        </div>
        <div>
          <span className="mb-1 block font-mono text-[10px] text-muted-foreground uppercase lg:hidden">
            {t("admin.tier")}
          </span>
          <TierBadge tier={user.tier} />
        </div>
        <div>
          <span className="mb-1 block font-mono text-[10px] text-muted-foreground uppercase lg:hidden">
            {t("admin.status")}
          </span>
          <span
            className={
              user.isActive ? "font-medium text-primary text-xs" : "text-muted-foreground text-xs"
            }
          >
            {user.isActive ? t("admin.active") : t("admin.inactive")}
          </span>
        </div>
        <div>
          <span className="mb-1 block font-mono text-[10px] text-muted-foreground uppercase lg:hidden">
            {t("admin.joined")}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">{joinedDate}</span>
        </div>
        <div className="sm:col-span-3 lg:col-span-1">
          <span className="mb-2 block font-mono text-[10px] text-muted-foreground uppercase lg:hidden">
            {t("admin.actions")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t("admin.setTier")}
              value={user.tier}
              disabled={busy}
              onValueChange={(tier) => void onTierChange(tier)}
              items={TIERS_ORDER.map((tier) => ({ value: tier, label: tier }))}
              className="h-8 w-auto text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t("admin.confirmPromote"),
                  confirmLabel: t("admin.makeAdmin"),
                });
                if (!ok) return;
                void run(() => promote(userId));
              }}
            >
              {t("admin.makeAdmin")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t("admin.confirmDemote"),
                  confirmLabel: t("admin.removeAdmin"),
                  destructive: true,
                });
                if (!ok) return;
                void run(() => demote(userId));
              }}
            >
              {t("admin.removeAdmin")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setViewing((v) => !v)}>
              {viewing ? t("admin.hide") : t("admin.view")}
            </Button>
          </div>
        </div>
      </div>
      {viewing && details ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-border border-t bg-secondary/20 px-5 py-4 text-xs sm:grid-cols-4 lg:px-6">
          <div>
            <dt className="text-muted-foreground">{t("admin.nameEmail")}</dt>
            <dd>{details.email ?? details.name ?? t("admin.anonymous")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("admin.tier")}</dt>
            <dd>{details.tier}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("admin.status")}</dt>
            <dd>{details.subscriptionStatus}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("admin.joined")}</dt>
            <dd>{new Date(details.joinedAt).toLocaleDateString(locale)}</dd>
          </div>
        </dl>
      ) : null}
    </li>
  );
}

function AdminDatum({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="min-w-0 md:text-right">
      <dt className="font-mono text-[10px] text-muted-foreground uppercase md:hidden">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate font-mono text-sm tabular-nums md:mt-0",
          !emphasized && "text-muted-foreground",
          emphasized && "font-medium text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function fmtUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function TierBadge({ tier }: { tier: "free" | "pro" | "ultra" }) {
  const variant = {
    free: "muted",
    pro: "outline",
    ultra: "primary",
  } as const;
  return (
    <Badge
      variant={variant[tier]}
      className={`text-[10px] uppercase tracking-wide ${tier === "pro" ? "text-primary" : ""}`}
    >
      {tier}
    </Badge>
  );
}

function MetricCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 font-medium text-3xl tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4"] as const;
const SKELETON_COLUMNS = ["column-1", "column-2", "column-3", "column-4", "column-5"] as const;

function TableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-0" aria-hidden>
      {SKELETON_ROWS.map((row) => (
        <div
          key={row}
          className="grid gap-6 border-border border-b px-6 py-4 last:border-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {SKELETON_COLUMNS.slice(0, columns).map((column) => (
            <div
              key={column}
              className="h-3 animate-pulse rounded-full bg-secondary"
              style={{ width: column === "column-1" ? "70%" : "45%" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function AccessDenied() {
  const { t } = useTranslation();
  return (
    <ProductPageLayout>
      <section className="overflow-hidden rounded-2xl border border-border bg-card lg:grid lg:min-h-[420px] lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <span
            aria-hidden
            className="grid size-12 place-items-center rounded-xl border border-border bg-background text-primary"
          >
            <IconShieldLock className="size-6" />
          </span>
          <Eyebrow className="mt-8 text-primary">{t("admin.title")}</Eyebrow>
          <h1 className="mt-4 max-w-xl font-bold font-display text-4xl leading-[0.95] tracking-tighter sm:text-5xl">
            {t("admin.accessDenied")}
          </h1>
          <p className="mt-5 max-w-xl text-muted-foreground leading-relaxed">
            {t("admin.accessDeniedHint")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/home"
              className={buttonVariants({
                variant: "primary",
                className: "rounded-lg",
              })}
            >
              {t("admin.backToApp")}
              <IconArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/settings"
              className={buttonVariants({
                variant: "secondary",
                className: "rounded-lg",
              })}
            >
              {t("admin.reviewAccount")}
            </Link>
          </div>
        </div>
        <aside className="flex flex-col justify-center border-border border-t bg-secondary/25 p-7 sm:p-10 lg:border-t-0 lg:border-l">
          <Eyebrow className="text-muted-foreground">{t("admin.accessBoundary")}</Eyebrow>
          <h2 className="mt-4 font-display font-semibold text-2xl tracking-tight">
            {t("admin.workspaceAvailable")}
          </h2>
          <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
            {t("admin.accessDeniedActionHint")}
          </p>
          <div className="mt-8 border-border border-t pt-6">
            <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
              {t("admin.requiredRole")}
            </p>
            <p className="mt-2 font-medium">{t("admin.administrator")}</p>
          </div>
        </aside>
      </section>
    </ProductPageLayout>
  );
}

function Loader() {
  return (
    <ProductPageLayout>
      <div className="h-3 w-20 animate-pulse rounded-full bg-secondary" />
      <div className="mt-4 h-10 w-56 animate-pulse rounded-lg bg-secondary" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-full bg-secondary" />
      <div className="mt-10 h-40 animate-pulse rounded-xl border border-border bg-secondary/30" />
    </ProductPageLayout>
  );
}
