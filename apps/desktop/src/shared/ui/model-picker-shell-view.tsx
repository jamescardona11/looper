import {
  Check,
  Funnel,
  MagnifyingGlass as Search,
  X,
} from "@phosphor-icons/react";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState, type MouseEvent } from "react";
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

const PICKER_STYLE = {
  panel: "flex min-h-0 flex-col",
  searchArea: "px-2 pb-3 pt-0.5",
  searchBar:
    "flex items-center gap-2 rounded-lg bg-[var(--surface-interactive)] px-3 py-1.5 transition-colors focus-within:bg-[var(--surface-interactive-strong)]",
  searchIcon: "shrink-0 text-content-muted",
  searchInput:
    "min-w-0 flex-1 bg-transparent ui-text-body-sm ui-color-primary placeholder-content-muted outline-none",
  filterAnchor: "relative shrink-0",
  filterMenu:
    "ui-surface-menu absolute right-0 top-full z-30 mt-1.5 min-w-[160px] py-1",
  filterOption:
    "flex w-full items-center justify-between gap-3 px-3 py-1 ui-text-body-sm transition-colors",
  filterSelected: "ui-color-primary bg-[var(--surface-interactive-strong)]",
  filterIdle:
    "ui-color-secondary hover:bg-[var(--surface-interactive)] hover:text-content-primary",
  checkSlot: "flex w-3 items-center justify-center shrink-0",
  viewportShell: "relative min-h-0 flex-1",
  viewport: "h-full overflow-y-auto py-3 pl-2 pr-3",
  empty: "py-10 text-center ui-text-body-sm text-content-muted",
  sections: "flex flex-col",
  section: "flex flex-col",
  heading: "flex items-center gap-3 px-1 pb-1.5 pt-3 first:pt-0",
  headingText: "ui-text-body-sm-strong ui-color-secondary shrink-0",
  divider: "ui-divider-trailing flex-1",
  fadeTop: "pointer-events-none absolute left-0 right-3 top-0 h-5",
  fadeBottom: "pointer-events-none absolute left-0 right-3 bottom-0 h-5",
  overlay:
    "fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 backdrop-blur-xs",
  dialog:
    "flex h-[34rem] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border-primary bg-surface-tertiary ui-shadow-modal-deep",
  dialogHeader: "flex items-center justify-between px-5 pt-4",
  dialogTitle: "ui-text-body-lg font-semibold text-content-primary",
  close:
    "flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-elevated hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
} as const;

const FILTER_MOTION = {
  initial: { opacity: 0, scale: 0.98, y: -2 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -2 },
  transition: { duration: 0.12 },
} as const;
const OVERLAY_MOTION = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;
const DIALOG_MOTION = {
  initial: { scale: 0.97, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.97, opacity: 0 },
  transition: { duration: 0.18 },
} as const;

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

export function ModelPickerPanel(props: ModelPickerPanelProps) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const [variantByFamily, setVariantByFamily] = useState<
    Record<string, string>
  >({});
  const [category, setCategory] = useState<string | null>(null);
  const shiftHeld = useShiftHeld();
  const groups = useMemo(
    () =>
      groupModelCatalog(
        props.catalog.filter(
          (model) => model.downloadable || props.isInstalled(model.key),
        ),
      ),
    [props.catalog, props.isInstalled],
  );
  const categories = useMemo(() => availableCategories(groups), [groups]);
  const filtered = useMemo(
    () => filterModelGroups(groups, search, category),
    [category, groups, search],
  );
  const sections = useMemo(() => sectionModelGroups(filtered), [filtered]);
  const categoryName = (value: string) => categoryLabel(value, t);
  const selectVariant = (family: string, key: string) => {
    setVariantByFamily((current) => ({ ...current, [family]: key }));
  };

  return (
    <div className={`${PICKER_STYLE.panel} ${props.className ?? ""}`}>
      <PickerSearch
        value={search}
        onChange={setSearch}
        categories={categories}
        category={category}
        onCategoryChange={setCategory}
        categoryLabel={categoryName}
      />
      <div className={PICKER_STYLE.viewportShell}>
        <div className={PICKER_STYLE.viewport}>
          {filtered.length ? (
            <ModelSections
              sections={sections}
              selections={variantByFamily}
              shiftHeld={shiftHeld}
              data={props}
              categoryLabel={categoryName}
              onSelectVariant={selectVariant}
            />
          ) : (
            <p className={PICKER_STYLE.empty}>
              {t({
                id: "model_picker.no_results",
                message: "No models match your search.",
              })}
            </p>
          )}
        </div>
        <FadeEdges color={props.fadeColor ?? "var(--color-bg-tertiary)"} />
      </div>
    </div>
  );
}

type PickerSearchProps = {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  category: string | null;
  onCategoryChange: (value: string | null) => void;
  categoryLabel: (value: string) => string;
};

function PickerSearch(props: PickerSearchProps) {
  const { t } = useLingui();
  return (
    <div className={PICKER_STYLE.searchArea}>
      <div className={PICKER_STYLE.searchBar}>
        <Search size={14} className={PICKER_STYLE.searchIcon} />
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          placeholder={t({
            id: "model_picker.search",
            message: "Search models",
          })}
          aria-label={t({
            id: "model_picker.search_aria",
            message: "Search models",
          })}
          className={PICKER_STYLE.searchInput}
        />
        <CategoryFilter {...props} />
      </div>
    </div>
  );
}

function CategoryFilter(props: PickerSearchProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useClickOutside(anchor, () => setOpen(false), open);
  if (props.categories.length <= 1) return null;
  const options = [
    {
      value: "all",
      label: t({ id: "model_picker.filter.all", message: "All models" }),
    },
    ...props.categories.map((value) => ({
      value,
      label: props.categoryLabel(value),
    })),
  ];
  const choose = (value: string) => {
    props.onCategoryChange(value === "all" ? null : value);
    setOpen(false);
  };
  return (
    <div className={PICKER_STYLE.filterAnchor} ref={anchor}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t({
          id: "model_picker.filter.aria",
          message: "Filter models by category",
        })}
        className={`ui-button-ghost h-6 w-6 ${props.category ? "text-content-primary" : ""}`}
      >
        <Funnel
          size={13}
          weight={props.category ? "fill" : "regular"}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            {...FILTER_MOTION}
            className={PICKER_STYLE.filterMenu}
          >
            {options.map((option) => (
              <CategoryOption
                key={option.value}
                value={option.value}
                label={option.label}
                selected={option.value === (props.category ?? "all")}
                onSelect={choose}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CategoryOption({
  value,
  label,
  selected,
  onSelect,
}: {
  value: string;
  label: string;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={`${PICKER_STYLE.filterOption} ${
        selected ? PICKER_STYLE.filterSelected : PICKER_STYLE.filterIdle
      }`}
    >
      <span>{label}</span>
      <span className={PICKER_STYLE.checkSlot}>
        {selected ? <Check size={12} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

type ModelSectionsProps = {
  sections: ReturnType<typeof sectionModelGroups>;
  selections: Record<string, string>;
  shiftHeld: boolean;
  data: ModelPickerData;
  categoryLabel: (value: string) => string;
  onSelectVariant: (family: string, key: string) => void;
};

function ModelSections(props: ModelSectionsProps) {
  return (
    <div className={PICKER_STYLE.sections}>
      {props.sections.map((section) => (
        <div key={section.category} className={PICKER_STYLE.section}>
          <div className={PICKER_STYLE.heading}>
            <span className={PICKER_STYLE.headingText}>
              {props.categoryLabel(section.category)}
            </span>
            <div className={PICKER_STYLE.divider} aria-hidden="true" />
          </div>
          {section.groups.map((group) => (
            <GroupRow key={group.id} group={group} {...props} />
          ))}
        </div>
      ))}
    </div>
  );
}

function GroupRow({
  group,
  ...props
}: ModelSectionsProps & { group: ModelGroup }) {
  const selectedKey =
    props.selections[group.id] ??
    preferredVariantKey(group, props.data.activeKey);
  const selected =
    group.variants.find((variant) => variant.key === selectedKey) ??
    group.variants[0];
  if (!selected) return null;
  const data = props.data;
  return (
    <ModelPickerRow
      group={group}
      selected={selected}
      active={selected.key === data.activeKey}
      installed={data.isInstalled(selected.key)}
      aneInstalled={data.isAneInstalled?.(selected.key) ?? false}
      isVariantInstalled={data.isInstalled}
      shiftHeld={props.shiftHeld}
      progress={data.progressFor(selected.key)}
      onSelectVariant={(key) => props.onSelectVariant(group.id, key)}
      onUse={() => data.onUse(selected.key)}
      onDownload={(ane) => data.onDownload(selected.key, ane)}
      onDelete={() => data.onDelete(selected.key)}
      onCancel={() => data.onCancel(selected.key)}
    />
  );
}

function FadeEdges({ color }: { color: string }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={PICKER_STYLE.fadeTop}
        style={{
          background: `linear-gradient(to bottom, ${color}, transparent)`,
        }}
      />
      <div
        aria-hidden="true"
        className={PICKER_STYLE.fadeBottom}
        style={{ background: `linear-gradient(to top, ${color}, transparent)` }}
      />
    </>
  );
}

type ModelPickerModalProps = ModelPickerData & {
  open: boolean;
  onClose: () => void;
  title?: string;
};

export default function ModelPickerModal(props: ModelPickerModalProps) {
  const { t } = useLingui();
  const { open, onClose, title, ...data } = props;
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="model-picker"
          {...OVERLAY_MOTION}
          className={PICKER_STYLE.overlay}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-picker-title"
            {...DIALOG_MOTION}
            className={PICKER_STYLE.dialog}
            onClick={stopPropagation}
          >
            <div className={PICKER_STYLE.dialogHeader}>
              <h2 id="model-picker-title" className={PICKER_STYLE.dialogTitle}>
                {title ??
                  t({ id: "model_picker.title", message: "Choose a model" })}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className={PICKER_STYLE.close}
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

function availableCategories(groups: ModelGroup[]): string[] {
  const present = new Set(groups.map((group) => group.category));
  return MODEL_CATEGORY_ORDER.filter((candidate) => present.has(candidate));
}

function categoryLabel(
  value: string,
  t: ReturnType<typeof useLingui>["t"],
): string {
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
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}
