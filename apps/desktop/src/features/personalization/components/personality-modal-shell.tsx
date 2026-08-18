import { AnimatePresence, motion } from "framer-motion";
import type { MouseEvent, ReactNode } from "react";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};
const lift = {
  initial: { opacity: 0, scale: 0.96, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 20 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;
const dialogClasses = {
  backdrop: [
    "fixed inset-0 z-[90] flex items-center justify-center",
    "bg-black/70 backdrop-blur-xs",
  ].join(" "),
  panel: [
    "relative w-[540px] h-[640px] max-w-[92vw] max-h-[92vh]",
    "bg-surface-overlay border border-border-secondary rounded-2xl shadow-2xl",
    "flex flex-col overflow-hidden",
  ].join(" "),
};

export function PersonalityModalShell({
  close,
  children,
}: {
  close: () => void;
  children: ReactNode;
}) {
  const keepOpen = (event: MouseEvent) => event.stopPropagation();
  return (
    <AnimatePresence>
      <motion.div
        {...fade}
        className={dialogClasses.backdrop}
        onClick={close}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <motion.div
          {...lift}
          className={dialogClasses.panel}
          onClick={keepOpen}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
