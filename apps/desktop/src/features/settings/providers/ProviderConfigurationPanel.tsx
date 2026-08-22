import type { ReactNode } from "react";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import { Dropdown, type DropdownOption } from "../../../shared/ui/Dropdown";

export type ProviderPanelCopy = {
  title: string;
  description: string;
  toggleAria: string;
  providerLabel: string;
  providerPlaceholder: string;
  providerSearch: string;
  endpointPlaceholder: string;
  endpointAria: string;
  apiKeyLabel: string;
  apiKeyOptionalHint: string;
  apiKeyRequiredPlaceholder: string;
  apiKeyOptionalPlaceholder: string;
  apiKeyAria: string;
  modelLabel: string;
  modelPlaceholder: string;
  modelSearch: string;
};

type ProviderConfigurationPanelProps<TProvider extends string> = {
  copy: ProviderPanelCopy;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  provider: TProvider;
  onProviderChange: (provider: TProvider) => void;
  providerOptions: DropdownOption<TProvider>[];
  customProvider: TProvider;
  endpoint: string;
  onEndpointChange: (endpoint: string) => void;
  apiKey: string;
  onApiKeyChange: (apiKey: string) => void;
  apiKeyRequired: boolean;
  model: string;
  onModelChange: (model: string) => void;
  modelOptions: DropdownOption<string>[];
  onModelsOpen?: () => void;
  footer?: ReactNode;
};

const dropdownButtonClass =
  "!rounded-none !border-0 !border-b !border-border-secondary !bg-transparent !px-0.5 !py-1 ui-text-body-sm hover:!border-content-primary focus:!border-content-primary";

const ProviderConfigurationPanel = <TProvider extends string>({
  copy,
  enabled,
  onEnabledChange,
  provider,
  onProviderChange,
  providerOptions,
  customProvider,
  endpoint,
  onEndpointChange,
  apiKey,
  onApiKeyChange,
  apiKeyRequired,
  model,
  onModelChange,
  modelOptions,
  onModelsOpen,
  footer,
}: ProviderConfigurationPanelProps<TProvider>) => (
  <section className="rounded-xl border border-border-primary bg-surface-surface p-4">
    <header className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <h3 className="ui-text-label-strong ui-color-primary">{copy.title}</h3>
        <p className="mt-1 max-w-[46ch] ui-text-meta ui-color-muted">
          {copy.description}
        </p>
      </div>
      <ToggleSwitch
        enabled={enabled}
        onToggle={() => onEnabledChange(!enabled)}
        ariaLabel={copy.toggleAria}
        size="md"
      />
    </header>

    <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
      <ProviderField label={copy.providerLabel} className="sm:col-span-2">
        <Dropdown
          value={provider}
          onChange={onProviderChange}
          options={providerOptions}
          editableInput={
            provider === customProvider
              ? {
                  value: endpoint,
                  onChange: onEndpointChange,
                  placeholder: copy.endpointPlaceholder,
                  ariaLabel: copy.endpointAria,
                }
              : undefined
          }
          placeholder={copy.providerPlaceholder}
          searchable
          searchPlaceholder={copy.providerSearch}
          buttonClassName={dropdownButtonClass}
          menuClassName="min-w-[260px]"
        />
      </ProviderField>

      <ProviderField
        label={copy.apiKeyLabel}
        hint={apiKeyRequired ? undefined : copy.apiKeyOptionalHint}
      >
        <input
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder={
            apiKeyRequired
              ? copy.apiKeyRequiredPlaceholder
              : copy.apiKeyOptionalPlaceholder
          }
          aria-label={copy.apiKeyAria}
          className="w-full border-b border-border-secondary bg-transparent px-0.5 py-1 ui-text-body-sm ui-color-primary placeholder-content-disabled transition-colors focus:border-content-primary focus:outline-none"
        />
      </ProviderField>

      <ProviderField label={copy.modelLabel}>
        <Dropdown
          value={model}
          onChange={onModelChange}
          onOpen={onModelsOpen}
          options={modelOptions}
          placeholder={copy.modelPlaceholder}
          searchable
          searchPlaceholder={copy.modelSearch}
          buttonClassName={dropdownButtonClass}
          menuClassName="min-w-[260px]"
        />
      </ProviderField>
    </div>
    {footer}
  </section>
);

const ProviderField = ({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={className}>
    <div className="mb-2 flex items-baseline gap-1.5">
      <span className="ui-text-label-strong ui-color-primary">{label}</span>
      {hint && <span className="ui-text-meta ui-color-disabled">{hint}</span>}
    </div>
    {children}
  </div>
);

export function uniqueModelNames(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  );
}

export default ProviderConfigurationPanel;
