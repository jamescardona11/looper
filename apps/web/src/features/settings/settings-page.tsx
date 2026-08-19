// biome-ignore-all assist/source/organizeImports: module markers keep optional imports removable.
import { useTranslation } from "@looper/i18n/react";
import { IconCreditCard, IconKey, IconLanguage, IconPalette, IconUser } from "@tabler/icons-react";
import { useRequireAuth } from "@/features/auth";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/shared/components/eyebrow";
import { ProductPageHeader } from "@/shared/components/product-page-header";
import { ProductPageLayout } from "@/shared/components/product-page-layout";
import { Select } from "@/shared/components/ui";
import { SHOW_SUBSCRIPTION_SETTINGS, type SettingsTab } from "./settings-tabs";
import { AppearanceTab } from "./tabs/appearance-tab";
import { ApiKeysTab } from "./tabs/api-keys-tab";
import { LanguageTab } from "./tabs/language-tab";
import { ProfileTab } from "./tabs/profile-tab";
import { SubscriptionTab } from "./tabs/subscription-tab";

type SettingsNavigationItem = {
  key: SettingsTab;
  label: string;
  icon: React.ReactNode;
};

export function SettingsPage({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const { t } = useTranslation();
  const authGate = useRequireAuth();
  const currentTab = visibleActiveTab(activeTab);
  const navigationItems: SettingsNavigationItem[] = [
    { key: "profile", label: t("settings.profile"), icon: <IconUser className="size-4" /> },
    ...(SHOW_SUBSCRIPTION_SETTINGS
      ? [
          {
            key: "subscription" as const,
            label: t("settings.subscription"),
            icon: <IconCreditCard className="size-4" />,
          },
        ]
      : []),
    { key: "keys", label: t("settings.apiKeys"), icon: <IconKey className="size-4" /> },
    {
      key: "language",
      label: t("settings.language"),
      icon: <IconLanguage className="size-4" />,
    },
    {
      key: "appearance",
      label: t("settings.appearance"),
      icon: <IconPalette className="size-4" />,
    },
  ];

  const navigationGroups = createNavigationGroups({
    items: navigationItems,
    accountLabel: t("settings.account"),
    workspaceLabel: t("nav.workspace"),
    preferencesLabel: t("settings.preferences"),
  });

  if (authGate) return authGate;

  return (
    <ProductPageLayout compactTop>
      <h1 className="sr-only md:hidden">{t("settings.title")}</h1>
      <div className="hidden md:block">
        <ProductPageHeader
          eyebrow={t("nav.account")}
          title={t("settings.title")}
          description={t("settings.subtitle")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[232px_minmax(0,1fr)] md:gap-10">
        <aside className="min-w-0 md:sticky md:top-6 md:self-start md:border-border md:border-r md:pr-6">
          <Select
            aria-label={t("settings.section")}
            value={currentTab}
            onValueChange={(nextTab) => onTabChange(nextTab as SettingsTab)}
            items={navigationItems.map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            className="md:hidden"
          />
          <nav aria-label={t("settings.section")} className="hidden gap-1 md:flex md:flex-col">
            {navigationGroups.map((group, index) => (
              <div key={group.label} className={cn(index > 0 && "mt-5")}>
                <Eyebrow className="mb-2 px-3 text-muted-foreground">{group.label}</Eyebrow>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-current={currentTab === item.key ? "page" : undefined}
                      onClick={() => onTabChange(item.key)}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        currentTab === item.key
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "text-muted-foreground",
                          currentTab === item.key && "text-primary",
                        )}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">{item.label}</span>
                      {currentTab === item.key ? (
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <ActiveSettingsTab activeTab={currentTab} />
        </div>
      </div>
    </ProductPageLayout>
  );
}

function visibleActiveTab(activeTab: SettingsTab): SettingsTab {
  return !SHOW_SUBSCRIPTION_SETTINGS && activeTab === "subscription" ? "profile" : activeTab;
}

function ActiveSettingsTab({ activeTab }: { activeTab: SettingsTab }) {
  switch (activeTab) {
    case "profile":
      return <ProfileTab />;
    case "subscription":
      return <SubscriptionTab />;
    case "keys":
      return <ApiKeysTab />;
    case "language":
      return <LanguageTab />;
    case "appearance":
      return <AppearanceTab />;
  }
}

function createNavigationGroups({
  items,
  accountLabel,
  workspaceLabel,
  preferencesLabel,
}: {
  items: SettingsNavigationItem[];
  accountLabel: string;
  workspaceLabel: string;
  preferencesLabel: string;
}) {
  const itemsByKey = new Map(items.map((item) => [item.key, item]));
  const groupDefinitions = [
    {
      label: accountLabel,
      keys: ["profile", "subscription"] satisfies SettingsTab[],
    },
    {
      label: workspaceLabel,
      keys: ["keys"] satisfies SettingsTab[],
    },
    {
      label: preferencesLabel,
      keys: ["language", "appearance"] satisfies SettingsTab[],
    },
  ];

  const groups: Array<{ label: string; items: SettingsNavigationItem[] }> = [];
  for (const group of groupDefinitions) {
    const groupItems: SettingsNavigationItem[] = [];
    for (const key of group.keys) {
      const item = itemsByKey.get(key);
      if (item) groupItems.push(item);
    }
    if (groupItems.length > 0) groups.push({ label: group.label, items: groupItems });
  }
  return groups;
}
