import { motion } from "framer-motion";
import type { MouseEvent, ReactNode } from "react";

type LibraryImportModalFrameProps = {
  children: ReactNode;
  panelWidth: "440" | "460";
  onCancel: () => void;
  labelledBy?: string;
};

const overlayClass = [
  "fixed inset-0 z-[95] flex items-center justify-center",
  "bg-black/60 px-6 backdrop-blur-xs",
].join(" ");

const panelClass: Record<LibraryImportModalFrameProps["panelWidth"], string> = {
  "440":
    "relative w-[440px] max-w-[92vw] rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
  "460":
    "relative w-[460px] max-w-[92vw] rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
};

const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

const panelMotion = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 12 },
  transition: { duration: 0.2, ease: "easeOut" },
} as const;

export const LibraryImportModalFrame = ({
  children,
  panelWidth,
  onCancel,
  labelledBy,
}: LibraryImportModalFrameProps) => (
  <motion.div
    {...backdropMotion}
    className={overlayClass}
    onClick={onCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby={labelledBy}
  >
    <motion.div
      {...panelMotion}
      className={panelClass[panelWidth]}
      onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
    >
      {children}
    </motion.div>
  </motion.div>
);
