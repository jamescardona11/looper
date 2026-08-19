import { AnimatePresence } from "framer-motion";

import SyncTab from "../../sync/components/SyncTab";
import type { useSettingsForm } from "../useSettingsForm";
import type { SettingsSection } from "../settings-navigation";
import AboutTab from "./tabs/AboutTab";
import { AccountTab } from "./AccountView";
import AppTab from "./tabs/AppTab";
import GeneralTab from "./tabs/GeneralTab";
import ModelsTab from "./tabs/ModelsTab";
import ProvidersTab from "./tabs/ProvidersTab";

type SettingsFormContract = ReturnType<typeof useSettingsForm>;

type SettingsTabContentProps = {
  form: SettingsFormContract;
  activeSection: SettingsSection;
};

const instantTabTransition = {
  hidden: { opacity: 1, x: 0 },
  visible: { opacity: 1, x: 0, transition: { duration: 0 } },
  exit: { opacity: 1, x: 0, transition: { duration: 0 } },
};

export function SettingsTabContent({
  form,
  activeSection,
}: SettingsTabContentProps) {
  const { navigation, tabs } = form;
  const selectTab = navigation.selectTab;

  const content = (() => {
    switch (navigation.activeTab) {
      case "account":
        return <AccountTab key="account" variants={instantTabTransition} />;
      case "sync":
        return <SyncTab key="sync" variants={instantTabTransition} />;
      case "general":
        return (
          <GeneralTab
            key="general"
            variants={instantTabTransition}
            {...tabs.general}
            onOpenModelsTab={() => selectTab("models")}
            onOpenProvidersTab={() => selectTab("providers")}
            onOpenAccountTab={() => selectTab("account")}
            activeSection={generalSection(activeSection)}
          />
        );
      case "models":
        return (
          <ModelsTab
            key="models"
            variants={instantTabTransition}
            {...tabs.models}
            onOpenGeneralTab={() => selectTab("general")}
            onOpenProvidersTab={() => selectTab("providers")}
          />
        );
      case "providers":
        return (
          <ProvidersTab
            key="providers"
            variants={instantTabTransition}
            {...tabs.providers}
          />
        );
      case "app":
        return (
          <AppTab
            key="app"
            variants={instantTabTransition}
            {...tabs.app}
            activeSection={appSection(activeSection)}
          />
        );
      case "about":
        return (
          <AboutTab
            key="about"
            variants={instantTabTransition}
            {...tabs.about}
          />
        );
    }
  })();

  return <AnimatePresence mode="wait">{content}</AnimatePresence>;
}

function generalSection(section: SettingsSection) {
  return section === "microphone" ||
    section === "shortcuts" ||
    section === "behavior"
    ? section
    : "processing";
}

function appSection(section: SettingsSection) {
  return section === "calendar" ||
    section === "privacy" ||
    section === "storage"
    ? section
    : "appearance";
}
