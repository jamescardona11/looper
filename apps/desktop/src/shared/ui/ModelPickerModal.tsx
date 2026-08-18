import {
  Check,
  Funnel,
  MagnifyingGlass as Search,
  X,
} from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { DownloadEvent, ModelInfo } from "../../types/models";
import { useClickOutside } from "../hooks/useClickOutside";
import { useShiftHeld } from "../hooks/useShiftHeld";
import { ModelPickerRow } from "./ModelPickerRow";
import {
  MODEL_CATEGORY_ORDER,
  filterModelGroups,
  groupModelCatalog,
  preferredVariantKey,
  sectionModelGroups,
  type ModelGroup,
} from "./modelPickerLogic";

type ModelPickerData = {
  catalog: ModelInfo[];
  activeKey: string;
  isInstalled: (key: string) => boolean;
  isAneInstalled?: (key: string) => boolean;
  progressFor: (key: string) => DownloadEvent | undefined;
  onUse: (key: string) => void;
  onDownload: (key: string, ane?: boolean) => void;
  onDelete: (key: string) => void;
  onCancel: (key: string) => void;
};

type ModelPickerPanelProps = ModelPickerData & {
  className?: string;
  fadeColor?: string;
};

export function ModelPickerPanel({
  catalog,
  activeKey,
  isInstalled,
  isAneInstalled,
  progressFor,
  onUse,
  onDownload,
  onDelete,
  onCancel,
  className,
  fadeColor = "var(--color-bg-tertiary)",
}: ModelPickerPanelProps) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const [variantByFamily, setVariantByFamily] = useState<
    Record<string, string>
  >({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const shiftHeld = useShiftHeld();
  useClickOutside(filterRef, () => setFilterOpen(false), filterOpen);

  const groups = useMemo(
    () =>
      groupModelCatalog(
        catalog.filter((model) => model.downloadable || isInstalled(model.key)),
      ),
    [catalog, isInstalled],
  );
  const availableCategories = useMemo(() => {
    const present = new Set(groups.map((group) => group.category));
    return MODEL_CATEGORY_ORDER.filter((candidate) => present.has(candidate));
  }, [groups]);
  const filteredGroups = useMemo(
    () => filterModelGroups(groups, search, category),
    [category, groups, search],
  );
  const sections = useMemo(
    () => sectionModelGroups(filteredGroups),
    [filteredGroups],
  );
  const categoryLabel = (value: string) => {
    if (value === "standard") {
      return t({ id: "model_picker.category.standard", message: "Standard" });
    }
    if (value === "experimental") {
      return t({
        id: "model_picker.category.experimental",
        message: "Experimental",
      });
    }
    if (value === "legacy") {
      return t({ id: "model_picker.category.legacy", message: "Legacy" });
    }
    return value;
  };
  const renderGroup = (group: ModelGroup) => {
    const selectedKey =
      variantByFamily[group.id] ?? preferredVariantKey(group, activeKey);
    const selected =
      group.variants.find((variant) => variant.key === selectedKey) ??
      group.variants[0];
    if (!selected) return null;

    return (
      <ModelPickerRow
        key={group.id}
        group={group}
        selected={selected}
        active={selected.key === activeKey}
        installed={isInstalled(selected.key)}
        aneInstalled={isAneInstalled?.(selected.key) ?? false}
        isVariantInstalled={isInstalled}
        shiftHeld={shiftHeld}
        progress={progressFor(selected.key)}
        onSelectVariant={(key) =>
          setVariantByFamily((current) => ({ ...current, [group.id]: key }))
        }
        onUse={() => onUse(selected.key)}
        onDownload={(ane) => onDownload(selected.key, ane)}
        onDelete={() => onDelete(selected.key)}
        onCancel={() => onCancel(selected.key)}
      />
    );
  };

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div className="px-2 pb-3 pt-0.5">
        <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-interactive)] px-3 py-1.5 transition-colors focus-within:bg-[var(--surface-interactive-strong)]">
          <Search size={14} className="shrink-0 text-content-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t({
              id: "model_picker.search",
              message: "Search models",
            })}
            aria-label={t({
              id: "model_picker.search_aria",
              message: "Search models",
            })}
            className="min-w-0 flex-1 bg-transparent ui-text-body-sm ui-color-primary placeholder-content-muted outline-none"
          />
          {availableCategories.length > 1 ? (
            <div className="relative shrink-0" ref={filterRef}>
              <button
                type="button"
                onClick={() => setFilterOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={filterOpen}
                aria-label={t({
                  id: "model_picker.filter.aria",
                  message: "Filter models by category",
                })}
                className={`ui-button-ghost h-6 w-6 ${category ? "text-content-primary" : ""}`}
              >
                <Funnel
                  size={13}
                  weight={category ? "fill" : "regular"}
                  aria-hidden="true"
                />
              </button>
              <AnimatePresence>
                {filterOpen ? (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, scale: 0.98, y: -2 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -2 }}
                    transition={{ duration: 0.12 }}
                    className="ui-surface-menu absolute right-0 top-full z-30 mt-1.5 min-w-[160px] py-1"
                  >
                    {[
                      {
                        value: "all",
                        label: t({
                          id: "model_picker.filter.all",
                          message: "All models",
                        }),
                      },
                      ...availableCategories.map((available) => ({
                        value: available,
                        label: categoryLabel(available),
                      })),
                    ].map((option) => {
                      const selected = option.value === (category ?? "all");
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          onClick={() => {
                            setCategory(
                              option.value === "all" ? null : option.value,
                            );
                            setFilterOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-1 ui-text-body-sm transition-colors ${
                            selected
                              ? "ui-color-primary bg-[var(--surface-interactive-strong)]"
                              : "ui-color-secondary hover:bg-[var(--surface-interactive)] hover:text-content-primary"
                          }`}
                        >
                          <span>{option.label}</span>
                          <span className="flex w-3 items-center justify-center shrink-0">
                            {selected ? (
                              <Check size={12} aria-hidden="true" />
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto py-3 pl-2 pr-3">
          {!filteredGroups.length ? (
            <p className="py-10 text-center ui-text-body-sm text-content-muted">
              {t({
                id: "model_picker.no_results",
                message: "No models match your search.",
              })}
            </p>
          ) : (
            <div className="flex flex-col">
              {sections.map((section) => (
                <div key={section.category} className="flex flex-col">
                  <div className="flex items-center gap-3 px-1 pb-1.5 pt-3 first:pt-0">
                    <span className="ui-text-body-sm-strong ui-color-secondary shrink-0">
                      {categoryLabel(section.category)}
                    </span>
                    <div
                      className="ui-divider-trailing flex-1"
                      aria-hidden="true"
                    />
                  </div>
                  {section.groups.map(renderGroup)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-3 top-0 h-5"
          style={{
            background: `linear-gradient(to bottom, ${fadeColor}, transparent)`,
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 right-3 bottom-0 h-5"
          style={{
            background: `linear-gradient(to top, ${fadeColor}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

type ModelPickerModalProps = ModelPickerData & {
  open: boolean;
  onClose: () => void;
  title?: string;
};

export default function ModelPickerModal({
  open,
  onClose,
  title,
  ...data
}: ModelPickerModalProps) {
  const { t } = useLingui();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="model-picker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-picker-title"
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex h-[34rem] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4">
              <h2
                id="model-picker-title"
                className="ui-text-body-lg font-semibold text-content-primary"
              >
                {title ??
                  t({ id: "model_picker.title", message: "Choose a model" })}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)]"
                aria-label={t({ id: "model_picker.close", message: "Close" })}
              >
                <X size={16} />
              </button>
            </div>
            <ModelPickerPanel
              {...data}
              className="flex-1 px-3 pt-3"
              fadeColor="var(--color-bg-tertiary)"
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
