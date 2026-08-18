import { useLingui } from "@lingui/react/macro";
import { Dropdown, type DropdownOption } from "../../../shared/ui/Dropdown";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";

type ModelPickerProps = {
  value: string;
  options: DropdownOption<string>[];
  onChange: (value: string) => void;
  fileSearchCopy?: boolean;
};

export const ImportModelPicker = ({
  value,
  options,
  onChange,
  fileSearchCopy = false,
}: ModelPickerProps) => {
  const { t } = useLingui();
  return (
    <div>
      <label className="ui-text-label text-content-muted">
        {t({ id: "library.import.model", message: "Model" })}
      </label>
      <div className="mt-1.5">
        <Dropdown
          value={value || null}
          onChange={onChange}
          options={options}
          placeholder={t({
            id: "library.import.select_model",
            message: "Select a model",
          })}
          searchable
          searchPlaceholder={
            fileSearchCopy
              ? t({
                  id: "library.import.search_models",
                  message: "Search installed models...",
                })
              : undefined
          }
        />
      </div>
    </div>
  );
};

type ImportToggleRowProps = {
  title: string;
  description?: string;
  enabled: boolean;
  ariaLabel: string;
  onToggle: () => void;
  disabled?: boolean;
  layout: "file" | "youtube" | "compact";
};

export const ImportToggleRow = ({
  title,
  description,
  enabled,
  ariaLabel,
  onToggle,
  disabled,
  layout,
}: ImportToggleRowProps) => (
  <div className="flex items-center justify-between gap-4">
    {layout === "compact" ? (
      <span className="ui-text-body-sm text-content-primary">{title}</span>
    ) : (
      <div className={layout === "file" ? "min-w-0" : undefined}>
        <div className="ui-text-body-sm text-content-primary">{title}</div>
        <div className="ui-text-meta text-content-disabled">{description}</div>
      </div>
    )}
    <ToggleSwitch
      enabled={enabled}
      onToggle={onToggle}
      ariaLabel={ariaLabel}
      disabled={disabled}
      size="md"
    />
  </div>
);
