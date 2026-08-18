import { useLingui } from "@lingui/react/macro";
import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import FAQModal from "../../../shared/ui/FAQModal";
import {
  initialSettingsSection,
  settingsSectionTab,
  type SettingsSection,
} from "../settings-navigation";
import { useSettingsForm } from "../useSettingsForm";
import { SettingsErrorBanner } from "./SettingsErrorBanner";
import { SettingsSidebar } from "./SettingsSidebar";
import { SettingsTabContent } from "./SettingsTabContent";

export { SettingsErrorBanner } from "./SettingsErrorBanner";

type SettingsModalProps = Parameters<typeof useSettingsForm>[0] & {
  variant?: "modal" | "page";
};

const backdropMotion = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const compactDialog = { opacity: 0, scale: 0.97, y: 6 };
const dialogMotion = {
  hidden: compactDialog,
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { damping: 30, stiffness: 400, type: "spring" as const },
  },
  exit: { ...compactDialog, transition: { duration: 0.12 } },
};

const pageFrameClass = [
  "relative flex h-full w-full min-h-0 overflow-hidden rounded-xl",
  "border border-border-primary bg-surface-overlay shadow-sm",
].join(" ");

const dialogClass = [
  "relative flex h-[700px] w-[920px]",
  "max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] overflow-hidden",
  "rounded-2xl border border-border-secondary bg-surface-overlay",
  "shadow-2xl shadow-black/50",
].join(" ");

const mainClass = "flex flex-1 flex-col min-h-0 bg-surface-overlay";
const scrollBaseClass = "flex-1 min-h-0 px-6 pt-8 pb-5 settings-scroll";

function SettingsModal({
  isOpen,
  onClose,
  initialTab = "general",
  transcriptionMode,
  variant = "modal",
}: SettingsModalProps) {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const form = useSettingsForm({
    isOpen,
    onClose,
    initialTab,
    transcriptionMode,
  });
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    initialSettingsSection[initialTab],
  );

  useEffect(() => {
    if (isOpen) setActiveSection(initialSettingsSection[initialTab]);
  }, [initialTab, isOpen]);

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

  const settingsBody = (
    <>
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
    </>
  );

  const faq = <FAQModal isOpen={form.faq.isOpen} onClose={form.faq.close} />;

  if (variant === "page") {
    return (
      <>
        {isOpen ? <div className={pageFrameClass}>{settingsBody}</div> : null}
        {faq}
      </>
    );
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="settings-modal"
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
          exit="hidden"
        >
          <SettingsBackdrop reduceMotion={reduceMotion} onDismiss={onClose} />
          <motion.div
            className={dialogClass}
            variants={reduceMotion ? undefined : dialogMotion}
            onClick={(event) => event.stopPropagation()}
            {...{ role: "dialog", "aria-modal": true }}
            aria-label={t({
              id: "settings.modal.dialog_label",
              message: "Settings",
            })}
          >
            <CloseSettingsButton
              onClose={onClose}
              label={t({
                id: "settings.modal.close_button",
                message: "Close settings",
              })}
            />
            {settingsBody}
          </motion.div>
        </motion.div>
      ) : null}
      {faq}
    </AnimatePresence>
  );
}

function scrollMode(
  tab: ReturnType<typeof useSettingsForm>["navigation"]["activeTab"],
) {
  return tab === "models" ? "overflow-hidden" : "overflow-y-scroll";
}

function SettingsBackdrop({
  reduceMotion,
  onDismiss,
}: {
  reduceMotion: boolean | null;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      className="absolute inset-0 bg-black/60 backdrop-blur-xs"
      variants={reduceMotion ? undefined : backdropMotion}
      onClick={onDismiss}
    />
  );
}

function CloseSettingsButton({
  onClose,
  label,
}: {
  onClose: () => void;
  label: string;
}) {
  const buttonClass = [
    "absolute right-2 top-3 z-20 flex h-7 w-7 items-center justify-center",
    "rounded-lg text-content-muted transition-colors",
    "hover:bg-surface-elevated hover:text-content-secondary",
  ].join(" ");

  return (
    <motion.button
      type="button"
      onClick={onClose}
      className={buttonClass}
      whileTap={{ scale: 0.95 }}
      aria-label={label}
    >
      <X aria-hidden="true" size={14} />
    </motion.button>
  );
}

export default SettingsModal;
