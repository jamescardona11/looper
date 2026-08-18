import { useTranslation } from "@looper/i18n/react";
import { IconKey } from "@tabler/icons-react";
import { ApiKeyPanel } from "@/features/api-keys";
import { SectionHeader } from "../components/section-header";

export function ApiKeysTab() {
  const { t } = useTranslation();
  return (
    <div>
      <SectionHeader
        title={t("settings.apiKeys")}
        hint={t("settings.apiKeysHint")}
        icon={<IconKey />}
      />
      <ApiKeyPanel />
    </div>
  );
}
