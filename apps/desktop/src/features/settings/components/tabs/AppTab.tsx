import { motion } from "framer-motion";
import type { AppTabProps } from "./AppTab.types";
import { AppAppearanceSection } from "./AppAppearanceSection";
import { AppAutomationSection } from "./AppAutomationSection";
import { AppCalendarSection } from "./AppCalendarSection";
import { AppConfirmationDialogs } from "./AppConfirmationDialogs";
import { AppPrivacySection } from "./AppPrivacySection";
import { AppStorageSection } from "./AppStorageSection";
import { useAppTabControls } from "./useAppTabControls";

export default function AppTab(props: AppTabProps) {
  const controls = useAppTabControls(props);

  return (
    <>
      <motion.div
        key="app"
        variants={props.variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="space-y-6"
      >
        <AppAppearanceSection {...props} controls={controls} />
        <AppCalendarSection {...props} controls={controls} />
        <div
          className={
            props.activeSection
              ? "grid grid-cols-1 items-stretch gap-3"
              : "grid grid-cols-2 items-stretch gap-3"
          }
        >
          <AppPrivacySection {...props} controls={controls} />
          <AppAutomationSection {...props} controls={controls} />
        </div>
        <AppStorageSection {...props} controls={controls} />
      </motion.div>
      <AppConfirmationDialogs controls={controls} />
    </>
  );
}
