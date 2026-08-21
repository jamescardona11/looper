import { motion } from "framer-motion";
import type { GeneralTabProps } from "./GeneralTab.types";
import { GeneralFeatureSection } from "./GeneralFeatureSection";
import { GeneralInputSection } from "./GeneralInputSection";
import { GeneralProcessingSection } from "./GeneralProcessingSection";
import { GeneralShortcutSection } from "./GeneralShortcutSection";

export default function GeneralTab(props: GeneralTabProps) {
  return (
    <motion.div
      key="general"
      variants={props.variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="space-y-6"
    >
      <GeneralProcessingSection {...props} />
      <GeneralInputSection {...props} />
      <div
        className={
          props.activeSection
            ? "grid grid-cols-1 gap-3"
            : "grid grid-cols-2 gap-3"
        }
      >
        <GeneralShortcutSection {...props} />
        <GeneralFeatureSection {...props} />
      </div>
    </motion.div>
  );
}
