import { useLingui } from "@lingui/react/macro";
import { Broom as BrushCleaning, Ghost } from "@phosphor-icons/react";

const HELP_ITEMS = [
  {
    Icon: Ghost,
    id: "settings.general.shortcuts.help_temporary",
    message:
      "Makes a shortcut temporary. It will not save audio, transcript, or history.",
  },
  {
    Icon: BrushCleaning,
    id: "settings.general.shortcuts.help_cleanup",
    message: "Runs Cleanup for that shortcut only.",
  },
] as const;

type ShortcutHelpItem = (typeof HELP_ITEMS)[number];

function helpPlacementClass(visible: boolean): string {
  return [
    "absolute left-0 bottom-full z-tooltip mb-1",
    visible ? "block" : "hidden",
  ].join(" ");
}

function HelpItem({ item, first }: { item: ShortcutHelpItem; first: boolean }) {
  const { t } = useLingui();
  const { Icon, id, message } = item;
  return (
    <p className={first ? undefined : "mt-1"}>
      <Icon
        size={10}
        className="mr-1 inline-block align-[-1px]"
        aria-hidden="true"
      />
      {t({ id, message })}
    </p>
  );
}

export function ShortcutHelp({ visible }: { visible: boolean }) {
  return (
    <div
      id="shortcuts-help-tooltip"
      role="tooltip"
      className={helpPlacementClass(visible)}
    >
      <div className="w-56 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 ui-text-micro ui-color-secondary shadow-lg leading-tight">
        {HELP_ITEMS.map((item, index) => (
          <HelpItem key={item.id} item={item} first={index === 0} />
        ))}
      </div>
    </div>
  );
}
