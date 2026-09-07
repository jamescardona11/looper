import { useState } from "react";
import { useLingui } from "@lingui/react/macro";

import FAQModal from "../../../shared/ui/FAQModal";
import Shimmer from "../../../shared/ui/Shimmer";
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
  "relative h-full w-full min-h-0 overflow-hidden bg-[var(--desktop-paper)]";
const mainClass = "flex h-full min-w-0 flex-col bg-[var(--desktop-paper)]";
const scrollBaseClass =
  "h-full min-w-0 overflow-x-hidden px-10 pb-8 pt-10 settings-scroll";

function SettingsRoute({
  isOpen,
  onClose,
  initialTab = "general",
  transcriptionMode,
}: SettingsRouteProps) {
  const { t } = useLingui();
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
            <div className="mx-auto grid h-full w-full max-w-[1040px] grid-rows-[auto_minmax(0,1fr)]">
              <header>
                <p className="ui-text-uppercase-micro font-semibold uppercase tracking-[0.11em] ui-color-accent">
                  {t({ id: "settings.route.eyebrow", message: "Setup" })}
                </p>
                <h1 className="mt-1 font-display ui-text-screen-title font-semibold tracking-normal ui-color-primary">
                  {t({
                    id: "settings.route.description",
                    message: "Looper, tuned to this Mac.",
                  })}
                </h1>
              </header>
              <div className="mt-[22px] grid min-h-0 grid-cols-1 gap-6 min-[1081px]:grid-cols-[194px_minmax(0,1fr)]">
                <SettingsSidebar
                  activeSection={activeSection}
                  loading={form.navigation.loading}
                  onSelect={selectSection}
                />
                {form.navigation.loading ? (
                  <SettingsContentSkeleton />
                ) : (
                  <div className="min-w-0 w-full max-w-[630px]">
                    <SettingsTabContent
                      form={form}
                      activeSection={activeSection}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
      {faq}
    </>
  );
}

function SettingsContentSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading settings"
      className="min-w-0 w-full max-w-[630px]"
    >
      <Shimmer className="h-8 w-44" />
      <Shimmer className="mt-3 h-4 w-3/5 max-w-md" />
      <div className="mt-8 divide-y divide-border-primary border-y border-border-primary">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-6 py-5"
          >
            <div className="min-w-0 flex-1">
              <Shimmer className="h-4 w-32" />
              <Shimmer className="mt-2 h-3 w-3/4 max-w-sm" />
            </div>
            <Shimmer className="h-7 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function scrollMode(
  tab: ReturnType<typeof useSettingsForm>["navigation"]["activeTab"],
) {
  return tab === "models" ? "overflow-y-hidden" : "overflow-y-scroll";
}

export default SettingsRoute;
