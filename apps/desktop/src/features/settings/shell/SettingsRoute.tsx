import { useState } from "react";

import FAQModal from "../../../shared/ui/FAQModal";
import {
  initialSettingsSection,
  settingsSectionTab,
  type SettingsSection,
} from "../preferences/settings-navigation";
import { useSettingsForm } from "../preferences/useSettingsForm";
import { SettingsErrorBanner } from "./SettingsErrorBanner";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsTabContent } from "./SettingsTabContent";

export { SettingsErrorBanner } from "./SettingsErrorBanner";

type SettingsRouteProps = Parameters<typeof useSettingsForm>[0] & {
  isOpen: boolean;
};

const pageFrameClass =
  "relative flex h-full w-full min-h-0 overflow-hidden bg-surface-overlay";
const mainClass = "flex min-w-0 flex-1 flex-col min-h-0 bg-surface-overlay";
const scrollBaseClass =
  "flex-1 min-h-0 min-w-0 overflow-x-hidden px-6 pt-8 pb-5 settings-scroll";

function SettingsRoute({
  isOpen,
  onClose,
  initialTab = "general",
  transcriptionMode,
}: SettingsRouteProps) {
  const form = useSettingsForm({
    isOpen,
    onClose,
    initialTab,
    transcriptionMode,
  });
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    initialSettingsSection[initialTab],
  );

  const selectSection = (section: SettingsSection) => {
    setActiveSection(section);
    form.navigation.selectTab(settingsSectionTab[section]);
  };

  const openErrorTab = (
    tab: "general" | "models" | "providers" | "about" | "app",
  ) => {
    form.navigation.selectTab(tab);
    setActiveSection(initialSettingsSection[tab]);
  };

  const faq = <FAQModal isOpen={form.faq.isOpen} onClose={form.faq.close} />;

  if (!isOpen) return faq;

  return (
    <>
      <div className={pageFrameClass} data-settings-route>
        <SettingsSidebar
          activeSection={activeSection}
          loading={form.navigation.loading}
          onSelect={selectSection}
        />
        <main className={mainClass}>
          {form.navigation.error ? (
            <div className="shrink-0 px-6 pt-3">
              <SettingsErrorBanner
                error={form.navigation.error.message}
                sourceTab={form.navigation.error.sourceTab}
                onOpenTab={openErrorTab}
              />
            </div>
          ) : null}
          <div
            className={`${scrollBaseClass} ${scrollMode(form.navigation.activeTab)}`}
            style={{ scrollbarGutter: "stable" }}
          >
            {form.navigation.loading ? null : (
              <SettingsTabContent form={form} activeSection={activeSection} />
            )}
          </div>
        </main>
      </div>
      {faq}
    </>
  );
}

function scrollMode(
  tab: ReturnType<typeof useSettingsForm>["navigation"]["activeTab"],
) {
  return tab === "models" ? "overflow-y-hidden" : "overflow-y-scroll";
}

export default SettingsRoute;
