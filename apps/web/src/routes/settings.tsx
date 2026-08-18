import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { isSettingsTab, SettingsPage, type SettingsTab } from "@/features/settings";

type SettingsRouteComponentType = () => ReactNode;

const settingsRouteComponents: SettingsRouteComponentType[] = [SettingsRoute];
const SettingsRouteComponent = settingsRouteComponents.at(-1) ?? SettingsRoute;

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
    isSettingsTab(search.tab) ? { tab: search.tab } : {},
  component: SettingsRouteComponent,
});

function SettingsRoute() {
  const { tab: searchTab } = Route.useSearch();
  const activeTab = isSettingsTab(searchTab) ? searchTab : "profile";
  const navigate = Route.useNavigate();

  return (
    <SettingsPage
      activeTab={activeTab}
      onTabChange={(nextTab) => void navigate({ search: { tab: nextTab }, replace: true })}
    />
  );
}
