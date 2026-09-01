import { useAccountData, useCurrentUser } from "@looper/data";
import { useTranslation } from "@looper/i18n/react";
import { IconUser } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { UpgradeFromAnonymousForm } from "@/features/auth";
import { reportError } from "@/lib/errors";
import { useConfirm } from "@/shared/components/confirm-dialog";
import { Button } from "@/shared/components/ui";
import { SectionHeader } from "../components/section-header";
import { SettingsField } from "../components/settings-field";

export function ProfileTab() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const email = user?.email ?? null;
  const isAnonymous = user?.isAnonymous ?? false;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("settings.profile")}
        hint={t("settings.profileHint")}
        icon={<IconUser />}
      />
      <div className="web-product-panel overflow-hidden rounded-xl">
        <section className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2 md:p-6">
          <SettingsField label={t("auth.email")} value={email ?? "—"} />
          <SettingsField
            label={t("settings.accountType")}
            value={isAnonymous ? t("settings.anonymous") : t("settings.verified")}
            hint={isAnonymous ? t("settings.anonHint") : t("settings.verifiedHint")}
          />
        </section>

        {isAnonymous ? (
          <section className="flex flex-col gap-4 border-border border-t p-5 md:p-6">
            <div>
              <p className="font-medium text-sm tracking-tight">{t("settings.keepDataTitle")}</p>
              <p className="mt-1 text-pretty text-muted-foreground text-xs">
                {t("settings.keepDataHint")}
              </p>
            </div>
            <UpgradeFromAnonymousForm />
          </section>
        ) : null}

        <DataPrivacySection />
      </div>
    </div>
  );
}

function DataPrivacySection() {
  const { t } = useTranslation();
  const { deleteAccount, exportMyData } = useAccountData();
  const confirm = useConfirm();
  const [isBusy, setIsBusy] = useState(false);

  const exportData = async () => {
    setIsBusy(true);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      toast.error(reportError(error, t("settings.exportFailed")));
    } finally {
      setIsBusy(false);
    }
  };

  const deleteUserAccount = async () => {
    const confirmed = await confirm({
      title: t("settings.deleteAccount"),
      description: t("settings.deleteConfirm"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!confirmed) return;

    setIsBusy(true);
    try {
      await deleteAccount();
      window.location.href = "/sign-in";
    } catch (error) {
      toast.error(reportError(error, t("settings.deleteFailed")));
      setIsBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 border-border border-t p-5 md:p-6">
      <div>
        <p className="font-medium text-sm tracking-tight">{t("settings.yourData")}</p>
        <p className="mt-1 text-muted-foreground text-xs">{t("settings.yourDataHint")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void exportData()}
          disabled={isBusy}
          className="min-h-11 sm:min-h-10"
        >
          {t("settings.exportMyData")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void deleteUserAccount()}
          disabled={isBusy}
          className="min-h-11 text-destructive hover:text-destructive sm:min-h-10"
        >
          {t("settings.deleteAccount")}
        </Button>
      </div>
    </section>
  );
}
