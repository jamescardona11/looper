import { useLingui } from "@lingui/react/macro";
import type { Dispatch, SetStateAction } from "react";

import type { LibraryItemPatch } from "../../../types";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";

type LibraryPlayerTogglesProps = {
  canShowTimestamps: boolean;
  showTimestamps: boolean;
  setShowTimestamps: Dispatch<SetStateAction<boolean>>;
  showSegmentView: boolean;
  followTimestampsActive: boolean;
  onFollowTimestampsChange: Dispatch<SetStateAction<boolean>>;
  onUpdate: (patch: LibraryItemPatch) => void;
};

export function LibraryPlayerToggles({
  canShowTimestamps,
  showTimestamps,
  setShowTimestamps,
  showSegmentView,
  followTimestampsActive,
  onFollowTimestampsChange,
  onUpdate,
}: LibraryPlayerTogglesProps) {
  const { t } = useLingui();
  const timestampsLabel = t({
    id: "library.modal.timestamps",
    message: "Timestamps",
  });
  const followLabel = t({
    id: "library.modal.follow_timestamp",
    message: "Follow timestamp",
  });

  const toggleTimestamps = () => {
    if (!canShowTimestamps) return;
    const nextValue = !showTimestamps;
    setShowTimestamps(nextValue);
    if (!nextValue) onFollowTimestampsChange(false);
    onUpdate({ show_timestamps: nextValue });
  };

  const toggleFollowing = () => {
    if (showSegmentView) onFollowTimestampsChange((value) => !value);
  };

  return (
    <>
      <div
        className="h-4 w-px bg-[var(--color-border-primary)] shrink-0"
        aria-hidden="true"
      />
      <FooterToggle
        label={timestampsLabel}
        textEnabled={canShowTimestamps}
        enabled={showTimestamps}
        disabled={!canShowTimestamps}
        onToggle={toggleTimestamps}
      />
      <FooterToggle
        label={followLabel}
        textEnabled={showSegmentView}
        enabled={followTimestampsActive}
        disabled={!showSegmentView}
        onToggle={toggleFollowing}
      />
    </>
  );
}

function FooterToggle({
  label,
  textEnabled,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  textEnabled: boolean;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const labelTone = textEnabled
    ? "text-content-secondary"
    : "text-content-disabled";

  return (
    <div className="flex items-center gap-2 shrink-0 translate-y-[2px]">
      <span className={`ui-text-meta ${labelTone}`}>{label}</span>
      <ToggleSwitch
        enabled={enabled}
        onToggle={onToggle}
        ariaLabel={label}
        disabled={disabled}
        size="sm"
      />
    </div>
  );
}
