import { useLingui } from "@lingui/react/macro";
import { Check, Copy } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { useCopyToClipboard } from "../../../shared/hooks/useCopyToClipboard";
import type { SettingsTab } from "../preferences/settings-navigation";

type ErrorTab = Exclude<SettingsTab, "account" | "sync">;

type SettingsErrorBannerProps = {
  error: string | null;
  sourceTab: ErrorTab | null;
  onOpenTab: (tab: ErrorTab) => void;
};

export function SettingsErrorBanner({
  error,
  sourceTab,
  onOpenTab,
}: SettingsErrorBannerProps) {
  const { t } = useLingui();
  const reduceMotion = useReducedMotion();
  const { copied, copy } = useCopyToClipboard(1500);
  const initial = reduceMotion ? false : { opacity: 0, y: 4 };
  const exit = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 };

  return (
    <AnimatePresence initial={false}>
      {error ? (
        <motion.div
          initial={initial}
          animate={{ opacity: 1, y: 0 }}
          exit={exit}
          transition={{ duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }}
          className="flex items-center justify-between gap-3 rounded-lg border border-error/20 bg-error/5 px-3 py-2"
          role="alert"
          aria-live="assertive"
          data-notification-position="main-top"
        >
          <p className="min-w-0 ui-text-meta ui-color-error leading-snug">
            {error}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {sourceTab ? (
              <button
                type="button"
                onClick={() => onOpenTab(sourceTab)}
                className="rounded-md px-2 py-1 ui-text-meta font-medium ui-color-error transition-colors hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
              >
                {t({ id: "settings.error.review", message: "Review error" })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => copy(error)}
              className="grid h-7 w-7 place-items-center rounded-md text-error/60 transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
              aria-label={t({
                id: "settings.error.copy",
                message: "Copy error",
              })}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
