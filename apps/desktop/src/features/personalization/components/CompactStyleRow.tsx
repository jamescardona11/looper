import { useLingui } from "@lingui/react/macro";
import { motion } from "framer-motion";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import type { Personality } from "../../../contracts";
import { voiceListAnatomy } from "../../voice/components/voice-list-anatomy";
import { formatWebsitePreview } from "./personalization-utils";

type CompactStyleRowProps = {
  personality: Personality;
  onEdit: () => void;
  onSelect: () => void;
  onToggle: () => void;
};

export default function CompactStyleRow({
  personality,
  onEdit,
  onSelect,
  onToggle,
}: CompactStyleRowProps) {
  const { t } = useLingui();
  const scope = [
    ...personality.apps.map((app) => app.name),
    ...personality.websites.map(formatWebsitePreview),
  ];

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={`${voiceListAnatomy.row} gap-4`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block ui-text-body-sm-strong ui-color-primary">
          {personality.name}
        </span>
        <span className="mt-0.5 block truncate ui-text-meta ui-color-muted">
          <span>
            {personality.instructions[0] ??
              t({ id: "personalization.no_notes", message: "No notes yet" })}
          </span>
          <span>
            {" — "}
            {scope.length > 0
              ? scope.slice(0, 3).join(", ")
              : t({
                  id: "personalization.applies_everywhere",
                  message: "Applies everywhere",
                })}
          </span>
        </span>
      </button>
      <ToggleSwitch
        enabled={personality.enabled}
        onToggle={onToggle}
        ariaLabel={`${personality.name} style ${
          personality.enabled ? "enabled" : "disabled"
        }`}
      />
      <button
        type="button"
        onClick={onEdit}
        className="rounded-lg border border-border-primary px-2.5 py-1.5 ui-text-button ui-color-secondary hover:bg-surface-secondary"
      >
        {t({ id: "personalization.edit", message: "Edit" })}
      </button>
    </motion.div>
  );
}
