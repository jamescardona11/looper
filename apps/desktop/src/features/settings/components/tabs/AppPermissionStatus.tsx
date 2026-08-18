import { useLingui } from "@lingui/react/macro";
import { Check, CircleNotch as Loader2 } from "@phosphor-icons/react";

type PermissionStatus = "checking" | "enabled" | "disabled";

export function permissionStatus(granted: boolean | null): PermissionStatus {
  if (granted === null) return "checking";
  return granted ? "enabled" : "disabled";
}

export function AppPermissionStatus({ granted }: { granted: boolean | null }) {
  const { t } = useLingui();
  const status = permissionStatus(granted);

  const label = {
    checking: t({
      id: "settings.app.permission.checking",
      message: "Checking permission",
    }),
    enabled: t({
      id: "settings.app.permission.enabled",
      message: "Enabled",
    }),
    disabled: t({ id: "settings.app.permission.off", message: "off" }),
  }[status];

  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1 ui-text-meta ${
        status === "enabled"
          ? "ui-color-success"
          : status === "disabled"
            ? "ui-color-warning"
            : "ui-color-muted"
      }`}
    >
      {status === "checking" && (
        <Loader2 size={10} className="animate-spin" aria-hidden="true" />
      )}
      {status === "enabled" && <Check size={10} aria-hidden="true" />}
      {status === "disabled" && label}
    </span>
  );
}
