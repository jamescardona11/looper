import { useLingui } from "@lingui/react/macro";
import { AnimatePresence as Presence, motion } from "framer-motion";

import ActivityDots from "../../../shared/ui/ActivityDots";

const BACKDROP = [
  "fixed inset-0 z-[100] flex items-center justify-center",
  "bg-black/60 px-6 backdrop-blur-xs",
].join(" ");
const DIALOG = [
  "flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl",
  "border border-border-primary bg-surface-tertiary px-8 py-7",
  "text-center ui-shadow-modal-deep",
].join(" ");
const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
const SCALE = {
  initial: { scale: 0.97, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.97, opacity: 0 },
  transition: { duration: 0.18 },
};
const ACTIVITY_DOTS = {
  color: "var(--color-local)",
  dotSize: 4,
  gap: 3,
};

export function AneCompileDialog({
  modelLabel,
}: Record<"modelLabel", string | null>) {
  const { t } = useLingui();
  return (
    <Presence>
      {modelLabel ? (
        <motion.div key="ane-compile" {...FADE} className={BACKDROP}>
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ane-compile-title"
            {...SCALE}
            className={DIALOG}
          >
            <ActivityDots {...ACTIVITY_DOTS} />
            <h2
              id="ane-compile-title"
              className="ui-text-body-lg font-semibold text-content-primary"
            >
              {t({
                id: "ane_compile.title",
                message: `Optimizing for the Neural Engine`,
              })}
            </h2>
            <p className="ui-text-body-sm text-content-muted">
              {t({
                id: "ane_compile.body",
                message: `macOS is compiling ${modelLabel} for the Apple Neural Engine. This happens once and can take a few minutes.`,
              })}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </Presence>
  );
}
