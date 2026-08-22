import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

type HeaderMenuSurfaceProps = {
  open: boolean;
  children: ReactNode;
  className: string;
  motionStyle: "drop" | "popover";
};

const MOTION = {
  drop: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: { duration: 0.1 },
  },
  popover: {
    initial: { opacity: 0, scale: 0.98, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: -4 },
    transition: { duration: 0.12 },
  },
} as const;

export function HeaderMenuSurface({
  open,
  children,
  className,
  motionStyle,
}: HeaderMenuSurfaceProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div {...MOTION[motionStyle]} className={className}>
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
