import { useLingui } from "@lingui/react/macro";

const helpClass = {
  frame: "absolute right-0 bottom-full z-tooltip mb-1",
  requirement: "mt-1 text-warning",
  surface:
    "w-44 rounded-lg border border-border-secondary bg-surface-overlay px-2.5 py-1.5 ui-text-micro ui-color-secondary shadow-lg leading-tight",
} as const;

export function EditModeHelp({
  visible,
  requiresAccount,
}: {
  visible: boolean;
  requiresAccount: boolean;
}) {
  const { t } = useLingui();
  const visibilityClass = visible ? "block" : "hidden";
  return (
    <div
      id="edit-mode-help-tooltip"
      role="tooltip"
      className={`${helpClass.frame} ${visibilityClass}`}
    >
      <div className={helpClass.surface}>
        <p>
          {t({
            id: "settings.general.edit_mode.help",
            message:
              'Select text in any app, and speak a command like "make this formal" or "fix my grammar".',
          })}
        </p>
        {!visible && <RequirementNote requiresAccount={requiresAccount} />}
      </div>
    </div>
  );
}

function RequirementNote({ requiresAccount }: { requiresAccount: boolean }) {
  const { t } = useLingui();
  const requirement = requiresAccount
    ? t({
        id: "settings.general.edit_mode.help_license_requirement",
        message: "Requires a Looper license.",
      })
    : t({
        id: "settings.general.edit_mode.help_requirement",
        message: "Requires an enabled and configured writing provider.",
      });
  return <p className={helpClass.requirement}>{requirement}</p>;
}
