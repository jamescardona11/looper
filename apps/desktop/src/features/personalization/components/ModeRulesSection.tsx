import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import ToggleSwitch from "../../../shared/ui/ToggleSwitch";
import { Dropdown } from "../../../shared/ui/Dropdown";
import type {
  ModeRule,
  ModeRuleTrigger,
  WorkflowEngine,
  WorkflowField,
  WorkflowInput,
} from "../../../contracts";
import { TRANSFORM_PRESETS, type TransformPreset } from "../../../contracts";
import * as personalizationApi from "../../../data/personalization";
import type { InstalledApp } from "../../../data/personalization";
import {
  personalizationKeys,
  setModeRulesCache,
  useModeRules,
} from "../queries";
import { AppIconBadge } from "./PersonalityModal";
import { createId } from "./personalization-utils";

// Sentinel used in the preset dropdown for "no preset" (`transform_preset:
// null` - Selection Mode follows the spoken instruction verbatim).
const NO_PRESET = "__none__" as const;
type PresetOptionValue = TransformPreset | typeof NO_PRESET;

type AppTriggerDropdownProps = {
  apps: InstalledApp[];
  value: string;
  onChange: (value: string) => void;
};

const AppTriggerDropdown = ({
  apps,
  value,
  onChange,
}: AppTriggerDropdownProps) => {
  const { t } = useLingui();
  const options = useMemo(() => {
    const next = apps.map((app) => ({
      value: app.identifier,
      label: app.name,
      description: app.identifier,
      icon: <AppIconBadge appName={app.name} iconPath={app.icon_path} />,
    }));

    if (value && !next.some((option) => option.value === value)) {
      next.unshift({
        value,
        label: value,
        description: t({
          id: "personalization.smart_modes.trigger.legacy_app",
          message: "Saved app identifier",
        }),
        icon: <AppIconBadge appName={value} />,
      });
    }
    return next;
  }, [apps, t, value]);

  return (
    <Dropdown
      value={value || null}
      onChange={onChange}
      options={options}
      placeholder={t({
        id: "personalization.smart_modes.trigger.choose_app",
        message: "Choose an app",
      })}
      searchable
      searchPlaceholder={t({
        id: "personalization.smart_modes.trigger.search_apps",
        message: "Search installed apps",
      })}
      className="min-w-[200px] flex-1"
      buttonClassName="h-8 py-1.5 px-2.5 ui-text-body-sm"
      menuClassName="max-h-72 overflow-y-auto"
    />
  );
};

function defaultRule(): ModeRule {
  return {
    id: createId(),
    name: "Workflow",
    enabled: true,
    trigger: { type: "bundle_id", bundle_id: "" },
    input: "dictation",
    engine: "auto",
    language: null,
    transform_preset: null,
    custom_prompt: null,
    deterministic_only: false,
    output: { type: "insert" },
    auto_send_on_insert: false,
  };
}

const WORKFLOW_TEMPLATES: Array<Omit<ModeRule, "id">> = [
  {
    ...defaultRule(),
    name: "Email",
    trigger: { type: "field", field: "email" },
    transform_preset: "email",
  },
  {
    ...defaultRule(),
    name: "Chat",
    trigger: { type: "field", field: "chat" },
    transform_preset: "chat",
  },
  {
    ...defaultRule(),
    name: "IDE",
    trigger: { type: "manual" },
    transform_preset: "literal",
    deterministic_only: true,
  },
  {
    ...defaultRule(),
    name: "Prompt",
    trigger: { type: "field", field: "prompt" },
    transform_preset: "prompt_better",
  },
  {
    ...defaultRule(),
    name: "Form",
    trigger: { type: "field", field: "form" },
    transform_preset: "literal",
    deterministic_only: true,
  },
];

/**
 * Smart Modes (F5): a simple list of rules mapping a trigger (app bundle ID
 * or website pattern) to a default Selection Mode transform preset and an
 * optional auto-send-on-insert behavior. Follows the same debounced-persist
 * pattern as `PersonalizationView`'s `Personality` list - see
 * `persistPersonalities` there.
 */
const ModeRulesSection = ({
  isActive = true,
  installedApps,
  compact = false,
}: {
  isActive?: boolean;
  installedApps: InstalledApp[];
  compact?: boolean;
}) => {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const persistVersionRef = useRef(0);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastPendingRulesRef = useRef<ModeRule[] | null>(null);
  const mountedRef = useRef(true);

  const modeRulesQuery = useModeRules(isActive);
  const rules = modeRulesQuery.data ?? [];
  const loading = isActive && modeRulesQuery.isLoading;
  const errorMessage =
    error ??
    (modeRulesQuery.error instanceof Error
      ? modeRulesQuery.error.message
      : null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const pending = lastPendingRulesRef.current;
        if (pending !== null) {
          void personalizationApi.setModeRules(pending).catch((err) => {
            console.error("Failed to flush pending mode rules", err);
          });
        }
      }
    };
  }, []);

  const persistRules = useCallback(
    (next: ModeRule[]) => {
      const persistVersion = persistVersionRef.current + 1;
      persistVersionRef.current = persistVersion;
      lastPendingRulesRef.current = next;
      setModeRulesCache(queryClient, next);

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(async () => {
        saveTimeoutRef.current = null;
        setError(null);
        try {
          const cleaned = await personalizationApi.setModeRules(next);
          if (
            !mountedRef.current ||
            persistVersion !== persistVersionRef.current
          ) {
            return;
          }
          setModeRulesCache(queryClient, cleaned ?? next);
        } catch (err) {
          if (
            !mountedRef.current ||
            persistVersion !== persistVersionRef.current
          ) {
            return;
          }
          console.error(err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }, 500);
    },
    [queryClient],
  );

  const updateRules = useCallback(
    (updater: (prev: ModeRule[]) => ModeRule[]) => {
      const current =
        queryClient.getQueryData<ModeRule[]>(personalizationKeys.modeRules()) ??
        rules;
      persistRules(updater(current));
    },
    [persistRules, rules, queryClient],
  );

  const updateRule = useCallback(
    (id: string, patch: Partial<ModeRule>) => {
      updateRules((prev) =>
        prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      );
    },
    [updateRules],
  );

  const handleAddRule = () => {
    updateRules((prev) => [defaultRule(), ...prev]);
  };

  const handleAddTemplate = (template: Omit<ModeRule, "id">) => {
    updateRules((prev) => [{ ...template, id: createId() }, ...prev]);
  };

  const handleDeleteRule = (id: string) => {
    updateRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const triggerTypeOptions = [
    {
      value: "bundle_id" as const,
      label: t({
        id: "personalization.smart_modes.trigger.app",
        message: "App",
      }),
    },
    {
      value: "url_pattern" as const,
      label: t({
        id: "personalization.smart_modes.trigger.website",
        message: "Website",
      }),
    },
    { value: "field" as const, label: "Field" },
    { value: "hotkey" as const, label: "Hotkey" },
    { value: "manual" as const, label: "Manual" },
  ];

  const fieldOptions: { value: WorkflowField; label: string }[] = [
    { value: "email", label: "Email" },
    { value: "chat", label: "Chat" },
    { value: "document", label: "Document" },
    { value: "prompt", label: "AI prompt" },
    { value: "code", label: "Code" },
    { value: "form", label: "Form" },
  ];
  const inputOptions: { value: WorkflowInput; label: string }[] = [
    { value: "dictation", label: "Dictation" },
    { value: "selection", label: "Selection" },
    { value: "clipboard", label: "Clipboard" },
  ];
  const engineOptions: { value: WorkflowEngine; label: string }[] = [
    { value: "auto", label: "Auto engine" },
    { value: "local", label: "Local engine" },
    { value: "cloud", label: "Cloud engine" },
  ];
  const outputOptions = [
    { value: "insert" as const, label: "Insert" },
    { value: "replace" as const, label: "Replace" },
    { value: "copy" as const, label: "Copy" },
  ];

  const triggerForType = (type: ModeRuleTrigger["type"]): ModeRuleTrigger => {
    switch (type) {
      case "bundle_id":
        return { type, bundle_id: "" };
      case "url_pattern":
        return { type, url_pattern: "" };
      case "field":
        return { type, field: "email" };
      case "hotkey":
        return { type, shortcut: "" };
      case "manual":
        return { type };
    }
  };

  if (compact) {
    const triggerLabel = (trigger: ModeRuleTrigger) => {
      switch (trigger.type) {
        case "bundle_id":
          return (
            installedApps.find((app) => app.identifier === trigger.bundle_id)
              ?.name ||
            trigger.bundle_id ||
            "Any app"
          );
        case "url_pattern":
          return trigger.url_pattern || "Any website";
        case "field":
          return trigger.field;
        case "hotkey":
          return trigger.shortcut || "Shortcut";
        case "manual":
          return "Manual";
      }
    };

    const flowDescription = (rule: ModeRule) => {
      const preset = rule.transform_preset
        ? rule.transform_preset.replaceAll("_", " ")
        : t({
            id: "personalization.smart_modes.custom_transform",
            message: "custom transform",
          });
      return t({
        id: "personalization.smart_modes.flow_description",
        message: `${triggerLabel(rule.trigger)} · ${rule.input} → ${preset} → ${rule.output.type}`,
      });
    };
    const localCount = rules.filter(
      (rule) => rule.engine === "local" || rule.deterministic_only,
    ).length;
    const cloudCount = rules.filter(
      (rule) => rule.engine === "cloud" && !rule.deterministic_only,
    ).length;
    const automaticCount = rules.length - localCount - cloudCount;

    return (
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-[18px] border-b border-border-primary pb-4">
          <div className="min-w-0">
            <h2 className="ui-text-title-strong ui-color-primary text-balance">
              {t({
                id: "voice.flows.title",
                message: "Context-aware flows",
              })}
            </h2>
            <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
              {t({
                id: "voice.flows.description",
                message:
                  "Change behavior only when the saved trigger matches. Each flow keeps its own engine and output.",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              handleAddRule();
              setShowEditor(true);
            }}
            className="h-9 shrink-0 rounded-[11px] bg-[var(--color-accent)] px-4 ui-text-button font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-30)]"
          >
            {t({ id: "voice.flows.new", message: "New flow" })}
          </button>
        </div>
        <ul className="mt-1">
          <AnimatePresence initial={false}>
            {rules.map((rule) => (
              <motion.li
                layout
                key={rule.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex min-h-16 items-center gap-3 border-b border-border-primary py-3 last:border-b-0"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-accent-10)] ui-text-body-sm-strong text-[var(--color-accent)]"
                >
                  {flowGlyph(rule.trigger)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="ui-text-body-sm-strong ui-color-primary">
                    {rule.name}
                  </p>
                  <p className="mt-0.5 ui-text-meta ui-color-muted text-pretty">
                    {flowDescription(rule)}
                  </p>
                </div>
                {rule.trigger.type === "hotkey" &&
                rule.trigger.shortcut.trim() !== "" ? (
                  <div
                    className="flex shrink-0 items-center gap-1"
                    aria-label={rule.trigger.shortcut}
                  >
                    {rule.trigger.shortcut.split("+").map((key) => (
                      <kbd
                        className="rounded-md border border-border-primary bg-surface-secondary px-2 py-1 ui-text-micro ui-color-secondary"
                        key={key}
                      >
                        {key}
                      </kbd>
                    ))}
                  </div>
                ) : (
                  <span className="max-w-32 truncate rounded-lg border border-border-primary bg-surface-secondary px-2.5 py-1.5 ui-text-micro ui-color-muted">
                    {triggerLabel(rule.trigger)}
                  </span>
                )}
                <ToggleSwitch
                  enabled={rule.enabled}
                  onToggle={() =>
                    updateRule(rule.id, { enabled: !rule.enabled })
                  }
                  ariaLabel={`${rule.name} automation ${
                    rule.enabled ? "enabled" : "disabled"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowEditor((current) => !current)}
                  className="rounded-lg border border-border-primary px-2.5 py-1.5 ui-text-button ui-color-secondary hover:bg-surface-secondary"
                >
                  {t({
                    id: "personalization.smart_modes.edit",
                    message: "Edit",
                  })}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {loading ? (
          <p className="py-5 ui-text-body-sm ui-color-muted" role="status">
            {t({ id: "voice.flows.loading", message: "Loading flows…" })}
          </p>
        ) : rules.length === 0 ? (
          <p className="border-b border-border-primary py-5 ui-text-body-sm ui-color-muted">
            {t({
              id: "voice.flows.empty",
              message:
                "No flows yet. Add one to bind a real trigger and output.",
            })}
          </p>
        ) : null}
        <p className="mt-4 flex items-center gap-2 border-t border-border-primary pt-4 ui-text-meta ui-color-muted">
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-[var(--color-accent)]"
          />
          <strong className="ui-color-primary">
            {t({
              id: "voice.flows.engine_summary",
              message: "Saved per flow.",
            })}
          </strong>
          {t({
            id: "voice.flows.engine_counts",
            message: `${localCount} local · ${automaticCount} automatic · ${cloudCount} cloud`,
          })}
        </p>
        {showEditor ? (
          <div className="mt-5 border-t border-border-primary pt-5">
            <ModeRulesSection
              isActive={isActive}
              installedApps={installedApps}
            />
          </div>
        ) : null}
        {errorMessage ? (
          <p className="mt-3 ui-text-body-sm ui-color-error-soft">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  const presetOptions: { value: PresetOptionValue; label: string }[] = [
    {
      value: NO_PRESET,
      label: t({
        id: "personalization.smart_modes.preset.none",
        message: "No preset",
      }),
    },
    ...TRANSFORM_PRESETS.map(({ preset, label }) => ({
      value: preset,
      label: t(label),
    })),
  ];

  return (
    <div className="mt-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="ui-text-title-strong ui-color-primary text-balance">
            {t({
              id: "personalization.smart_modes.title",
              message: "Workflows",
            })}
          </p>
          <p className="mt-1 ui-text-body-sm ui-color-muted text-pretty">
            {t({
              id: "personalization.smart_modes.description",
              message:
                "Choose what triggers a workflow, what it reads, how it transforms text, and where the result goes.",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddRule}
          aria-label={t({
            id: "personalization.smart_modes.add_rule",
            message: "Add rule",
          })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-accent-20)] bg-[var(--color-accent-10)] px-3 py-1.5 ui-text-button text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent-30)] hover:bg-[var(--color-accent-20)]"
        >
          <Plus
            size={13}
            aria-hidden="true"
            className="text-[var(--color-accent)]"
          />
          {t({
            id: "personalization.smart_modes.add_rule",
            message: "Add rule",
          })}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {WORKFLOW_TEMPLATES.map((template) => (
          <button
            key={template.name}
            type="button"
            onClick={() => handleAddTemplate(template)}
            className="rounded-lg border border-border-primary bg-surface-secondary px-2.5 py-1.5 ui-text-body-sm ui-color-secondary hover:border-border-hover"
          >
            + {template.name}
          </button>
        ))}
      </div>

      {loading ? null : rules.length === 0 ? (
        <div className="mt-4 rounded-xl border border-border-primary bg-surface-secondary px-6 py-8 ui-color-muted">
          <p className="ui-text-body-lg-strong">
            {t({
              id: "personalization.smart_modes.empty.title",
              message: "No rules yet",
            })}
          </p>
          <p className="ui-text-body-sm ui-color-muted">
            {t({
              id: "personalization.smart_modes.empty.description",
              message:
                "Start from Email, Chat, IDE, Prompt or Form, or add a custom workflow.",
            })}
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="ui-card-liftable flex flex-col gap-3 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ToggleSwitch
                  enabled={rule.enabled}
                  onToggle={() =>
                    updateRule(rule.id, { enabled: !rule.enabled })
                  }
                  ariaLabel={
                    rule.enabled ? "Disable workflow" : "Enable workflow"
                  }
                />
                <input
                  value={rule.name}
                  onChange={(event) =>
                    updateRule(rule.id, { name: event.target.value })
                  }
                  aria-label="Workflow name"
                  className="h-8 min-w-[150px] flex-1 rounded-lg border border-border-primary bg-surface-surface px-2.5 ui-text-body-sm ui-color-primary outline-hidden focus:border-border-hover"
                />
                <div className="w-[120px]">
                  <Dropdown
                    value={rule.trigger.type}
                    onChange={(type) =>
                      updateRule(rule.id, { trigger: triggerForType(type) })
                    }
                    options={triggerTypeOptions}
                    buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                  />
                </div>
                {rule.trigger.type === "bundle_id" && (
                  <AppTriggerDropdown
                    apps={installedApps}
                    value={rule.trigger.bundle_id}
                    onChange={(bundleId) =>
                      updateRule(rule.id, {
                        trigger: { type: "bundle_id", bundle_id: bundleId },
                      })
                    }
                  />
                )}
                {rule.trigger.type === "url_pattern" && (
                  <input
                    value={rule.trigger.url_pattern}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        trigger: {
                          type: "url_pattern",
                          url_pattern: event.target.value,
                        },
                      })
                    }
                    placeholder="github.com"
                    aria-label="Website pattern"
                    className="h-8 min-w-[190px] flex-1 rounded-lg border border-border-primary bg-surface-surface px-2.5 ui-text-body-sm ui-color-primary outline-hidden focus:border-border-hover"
                  />
                )}
                {rule.trigger.type === "field" && (
                  <div className="w-[150px]">
                    <Dropdown
                      value={rule.trigger.field}
                      onChange={(field) =>
                        updateRule(rule.id, {
                          trigger: { type: "field", field },
                        })
                      }
                      options={fieldOptions}
                      buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                    />
                  </div>
                )}
                {rule.trigger.type === "hotkey" && (
                  <input
                    value={rule.trigger.shortcut}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        trigger: {
                          type: "hotkey",
                          shortcut: event.target.value,
                        },
                      })
                    }
                    placeholder="CmdOrCtrl+Shift+1"
                    aria-label="Workflow hotkey"
                    className="h-8 min-w-[190px] flex-1 rounded-lg border border-border-primary bg-surface-surface px-2.5 ui-text-body-sm ui-color-primary outline-hidden focus:border-border-hover"
                  />
                )}
                {rule.trigger.type === "manual" && (
                  <span className="ui-text-meta ui-color-muted">
                    Run manually from the workflow picker
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  aria-label="Delete workflow"
                  className="ml-auto inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-content-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <Dropdown
                  value={rule.input}
                  onChange={(input) => updateRule(rule.id, { input })}
                  options={inputOptions}
                  buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                />
                <Dropdown
                  value={rule.engine}
                  onChange={(engine) => updateRule(rule.id, { engine })}
                  options={engineOptions}
                  buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                />
                <Dropdown<PresetOptionValue>
                  value={rule.transform_preset ?? NO_PRESET}
                  onChange={(value) =>
                    updateRule(rule.id, {
                      transform_preset: value === NO_PRESET ? null : value,
                    })
                  }
                  options={presetOptions}
                  buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                />
                <Dropdown
                  value={rule.output.type}
                  onChange={(type) => updateRule(rule.id, { output: { type } })}
                  options={outputOptions}
                  buttonClassName="py-1.5 px-2.5 ui-text-body-sm"
                />
                <input
                  value={rule.language ?? ""}
                  onChange={(event) =>
                    updateRule(rule.id, {
                      language: event.target.value || null,
                    })
                  }
                  placeholder="Language: auto"
                  aria-label="Workflow language"
                  className="h-8 rounded-lg border border-border-primary bg-surface-surface px-2.5 ui-text-body-sm ui-color-primary outline-hidden focus:border-border-hover"
                />
              </div>

              <textarea
                value={rule.custom_prompt ?? ""}
                onChange={(event) =>
                  updateRule(rule.id, {
                    custom_prompt: event.target.value || null,
                  })
                }
                placeholder="Optional transformation prompt. The transcript remains data; it is never executed as instructions."
                aria-label="Workflow prompt"
                rows={2}
                disabled={rule.deterministic_only}
                className="w-full resize-y rounded-lg border border-border-primary bg-surface-surface px-2.5 py-2 ui-text-body-sm ui-color-primary outline-hidden focus:border-border-hover disabled:opacity-50"
              />

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 ui-text-meta ui-color-muted">
                  <ToggleSwitch
                    enabled={rule.deterministic_only}
                    onToggle={() =>
                      updateRule(rule.id, {
                        deterministic_only: !rule.deterministic_only,
                      })
                    }
                    ariaLabel="Use deterministic transformations only"
                  />
                  Deterministic only
                </label>
                <label className="flex items-center gap-1.5 ui-text-meta ui-color-muted">
                  <ToggleSwitch
                    enabled={rule.auto_send_on_insert}
                    onToggle={() =>
                      updateRule(rule.id, {
                        auto_send_on_insert: !rule.auto_send_on_insert,
                      })
                    }
                    ariaLabel="Auto-send after insert"
                  />
                  Auto-send after insert
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 ui-text-body-sm ui-color-error-soft">
          {errorMessage}
        </div>
      )}
    </div>
  );
};

function flowGlyph(trigger: ModeRuleTrigger): string {
  switch (trigger.type) {
    case "bundle_id":
      return "A";
    case "url_pattern":
      return "↗";
    case "field":
      return trigger.field === "email" ? "@" : "⌁";
    case "hotkey":
      return "⌘";
    case "manual":
      return "↺";
  }
}

export default ModeRulesSection;
