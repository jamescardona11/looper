import { Minus, Square, X } from "@phosphor-icons/react";
import { getPlatformCapabilities } from "../../platform/service";
import { performWindowAction, type WindowAction } from "../../data/window";

const BUTTON_CLASS =
  "flex h-8 w-11 items-center justify-center text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary";

const CONTROLS: readonly {
  action: WindowAction;
  label: string;
  icon: React.ReactNode;
  className?: string;
}[] = [
  {
    action: "minimize",
    label: "Minimize",
    icon: <Minus size={14} aria-hidden="true" />,
  },
  {
    action: "maximize",
    label: "Maximize",
    icon: <Square size={12} aria-hidden="true" />,
  },
  {
    action: "close",
    label: "Close",
    icon: <X size={15} aria-hidden="true" />,
    className: "hover:bg-red-500 hover:text-white",
  },
];

function WindowControlButtons() {
  return (
    <div className="fixed right-0 top-0 z-50 flex h-8" data-window-controls>
      {CONTROLS.map(({ action, label, icon, className = "" }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          className={`${BUTTON_CLASS} ${className}`}
          onClick={() => void performWindowAction(action)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function WindowControls() {
  if (!getPlatformCapabilities().usesCustomWindowControls) return null;
  return <WindowControlButtons />;
}
