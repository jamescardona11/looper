import { X as CloseIcon } from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import { motion as Animated, type MotionProps } from "framer-motion";
import type { MouseEventHandler, RefCallback } from "react";
import type { FAQScrollEdges } from "./faq-scroll-edges";
import { FAQContent } from "./faq-content";

const BACKDROP_MOTION: MotionProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
const PANEL_MOTION: MotionProps = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
  transition: { type: "spring", stiffness: 400, damping: 30 },
};
const dialogClass = {
  backdrop:
    "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs",
  panel:
    "relative w-full max-w-lg h-[85vh] bg-surface-tertiary rounded-2xl border border-border-secondary shadow-2xl shadow-black/50 overflow-hidden flex flex-col",
  header: "flex items-center justify-between px-7 pt-6 pb-4 shrink-0",
  close:
    "p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-elevated transition-colors outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
  viewport: "relative flex-1 min-h-0 overflow-hidden",
  scroller: "h-full overflow-y-auto settings-scroll px-7 pb-8",
} as const;

const fadeClass = (edge: "top" | "bottom", visible: boolean) =>
  [
    "pointer-events-none absolute left-0 right-3 z-10 transition-opacity duration-150",
    edge === "top" ? "top-0 h-6" : "bottom-0 h-8",
    visible ? "opacity-100" : "opacity-0",
  ].join(" ");

const ScrollFade = (props: { edge: "top" | "bottom"; visible: boolean }) => (
  <div
    className={fadeClass(props.edge, props.visible)}
    style={{
      background: `linear-gradient(to ${props.edge === "top" ? "bottom" : "top"}, var(--color-bg-tertiary), transparent)`,
    }}
    aria-hidden="true"
  />
);

export function FAQDialog(props: {
  edges: FAQScrollEdges;
  scrollRef: RefCallback<HTMLDivElement>;
  onClose: () => void;
  onPanelClick: MouseEventHandler<HTMLDivElement>;
}) {
  const { t } = useLingui();
  return (
    <Animated.div
      {...BACKDROP_MOTION}
      className={dialogClass.backdrop}
      onClick={props.onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-title"
    >
      <Animated.div
        {...PANEL_MOTION}
        onClick={props.onPanelClick}
        className={dialogClass.panel}
      >
        <div className={dialogClass.header}>
          <div>
            <h2
              id="faq-title"
              className="ui-text-display font-normal ui-color-primary tracking-tight"
            >
              {t({
                id: "faq.title",
                message: "Frequently Asked Questions",
              })}
            </h2>
            <p className="ui-text-meta ui-color-muted mt-1">
              {t({
                id: "faq.subtitle",
                message: "How Looper works, privacy, and AI writing",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className={dialogClass.close}
            aria-label={t({ id: "faq.close_aria", message: "Close FAQ" })}
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <div className={dialogClass.viewport}>
          <ScrollFade edge="top" visible={props.edges.top} />
          <ScrollFade edge="bottom" visible={props.edges.bottom} />
          <div ref={props.scrollRef} className={dialogClass.scroller}>
            <FAQContent />
          </div>
        </div>
      </Animated.div>
    </Animated.div>
  );
}
