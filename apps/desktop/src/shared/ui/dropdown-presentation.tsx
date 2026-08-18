import {
  Check,
  CaretDown as ChevronDown,
  MagnifyingGlass as Search,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode, RefObject } from "react";
import type {
  DropdownEditableInput,
  DropdownOption,
  DropdownValue,
} from "./dropdownTypes";

export function classNames(
  ...classes: Array<string | false | null | undefined>
) {
  return classes.filter(Boolean).join(" ");
}

function DropdownBadges<T extends DropdownValue>({
  badges,
  fixedSlots,
}: {
  badges?: DropdownOption<T>["badges"];
  fixedSlots?: boolean;
}) {
  if (!badges?.length) return null;
  return (
    <span className="flex items-center gap-1 ui-text-uppercase-micro font-medium">
      {badges.map((badge, index) => {
        if (!fixedSlots && badge.visible === false) return null;
        const color =
          badge.visible === false
            ? "text-transparent"
            : badge.highlighted
              ? "text-[var(--color-interactive)]"
              : "text-content-disabled";
        return (
          <span
            key={`${badge.label}-${index}`}
            className={classNames(fixedSlots && "w-4 text-right", color)}
          >
            {badge.label}
          </span>
        );
      })}
    </span>
  );
}

type TriggerProps<T extends DropdownValue> = {
  open: boolean;
  disabled: boolean;
  toggle: () => void;
  toggleLabel: string;
  selected?: DropdownOption<T>;
  placeholder: string;
  label?: string;
  icon?: ReactNode;
  editableInput?: DropdownEditableInput;
  buttonClassName?: string;
  valueClassName: string;
  truncate: boolean;
  fitButtonToWidestOption: boolean;
  widthLabels: string[];
  hideChevron: boolean;
};

function TriggerPrefix({
  icon,
  label,
}: Pick<TriggerProps<string>, "icon" | "label">) {
  return (
    <>
      {icon ? (
        <span className="text-content-muted shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label ? (
        <span className="text-content-muted shrink-0">{label}</span>
      ) : null}
    </>
  );
}

function EditableDropdownTrigger<T extends DropdownValue>(
  props: TriggerProps<T>,
) {
  const input = props.editableInput;
  if (!input) return null;
  return (
    <div
      className={`w-full flex items-center justify-between rounded-lg bg-surface-surface border border-border-primary hover:border-border-secondary focus-within:border-border-hover transition-colors ${props.buttonClassName || "py-2 px-3 ui-text-body-sm"}`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <TriggerPrefix icon={props.icon} label={props.label} />
        <input
          type="text"
          value={input.value}
          onChange={(event) => input.onChange(event.target.value)}
          placeholder={input.placeholder}
          aria-label={input.ariaLabel}
          className={classNames(
            "min-w-0 flex-1 bg-transparent text-content-primary placeholder-content-disabled focus:outline-none",
            props.valueClassName,
          )}
        />
      </div>
      <button
        type="button"
        onClick={props.toggle}
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={props.open}
        aria-label={props.toggleLabel}
        className="shrink-0 ml-2 inline-flex items-center justify-center rounded text-content-muted transition-colors hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)] disabled:opacity-60"
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 ${props.open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

function TriggerValue<T extends DropdownValue>(props: TriggerProps<T>) {
  const tone = props.selected ? "text-content-primary" : "text-content-muted";
  if (!props.fitButtonToWidestOption) {
    return (
      <span
        className={classNames(
          props.truncate && "truncate",
          tone,
          props.valueClassName,
        )}
      >
        {props.selected?.label ?? props.placeholder}
      </span>
    );
  }
  return (
    <span className={classNames("inline-grid", tone, props.valueClassName)}>
      {props.widthLabels.map((text, index) => (
        <span
          key={`${text}-${index}`}
          className="invisible col-start-1 row-start-1 whitespace-nowrap"
          aria-hidden="true"
        >
          {text}
        </span>
      ))}
      <span className="col-start-1 row-start-1 whitespace-nowrap">
        {props.selected?.label ?? props.placeholder}
      </span>
    </span>
  );
}

function ButtonDropdownTrigger<T extends DropdownValue>(
  props: TriggerProps<T>,
) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.toggle}
      aria-haspopup="listbox"
      aria-expanded={props.open}
      aria-disabled={props.disabled}
      className={`w-full flex items-center justify-between rounded-lg bg-surface-surface border border-border-primary text-left hover:border-border-secondary focus:border-border-hover focus:outline-hidden transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border-primary ${props.buttonClassName || "py-2 px-3 ui-text-body-sm"}`}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <TriggerPrefix icon={props.icon} label={props.label} />
        <TriggerValue {...props} />
      </span>
      <span
        className={classNames(
          "flex items-center gap-2 shrink-0",
          !props.hideChevron && "ml-2",
        )}
      >
        <DropdownBadges
          badges={props.selected?.badges}
          fixedSlots={props.selected?.fixedBadgeSlots}
        />
        {!props.hideChevron ? (
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`text-content-muted transition-transform duration-200 ${props.open ? "rotate-180" : ""}`}
          />
        ) : null}
      </span>
    </button>
  );
}

export function DropdownTrigger<T extends DropdownValue>(
  props: TriggerProps<T>,
) {
  return props.editableInput ? (
    <EditableDropdownTrigger {...props} />
  ) : (
    <ButtonDropdownTrigger {...props} />
  );
}

type MenuProps<T extends DropdownValue> = {
  open: boolean;
  openUpward: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  menuClassName: string;
  searchable: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  options: DropdownOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  noOptionsLabel: string;
  optionClassName: string;
  optionLabelClassName: string;
  truncate: boolean;
};

function DropdownSearch<T extends DropdownValue>(props: MenuProps<T>) {
  if (!props.searchable) return null;
  return (
    <div className="flex items-center gap-2 px-3 border-b border-border-secondary shrink-0">
      <Search
        size={13}
        className="shrink-0 text-content-disabled"
        aria-hidden="true"
      />
      <input
        type="text"
        value={props.searchQuery}
        onChange={(event) => props.setSearchQuery(event.target.value)}
        placeholder={props.searchPlaceholder}
        aria-label={props.searchAriaLabel}
        autoFocus
        className="w-full bg-transparent border-0 py-2.5 ui-text-body-sm text-content-primary placeholder-content-disabled focus:outline-none"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

function DropdownHeader<T extends DropdownValue>({
  option,
  index,
}: {
  option: DropdownOption<T>;
  index: number;
}) {
  return (
    <div
      key={`header-${index}-${option.value}`}
      role="presentation"
      className={classNames(
        "mt-1 first:mt-0",
        option.prominentHeader
          ? "px-2.5 pt-2 pb-1.5 ui-text-label-strong ui-color-secondary"
          : "px-2.5 py-1.5 ui-text-uppercase-meta font-semibold ui-color-disabled",
      )}
    >
      {option.label}
      {option.description ? (
        <p className="ui-text-meta ui-color-disabled font-normal normal-case mt-0.5">
          {option.description}
        </p>
      ) : null}
    </div>
  );
}

function DropdownOptionRow<T extends DropdownValue>({
  option,
  index,
  menu,
}: {
  option: DropdownOption<T>;
  index: number;
  menu: MenuProps<T>;
}) {
  const selected = menu.value === option.value;
  const stateClass = option.locked
    ? "text-content-disabled cursor-default"
    : selected
      ? "bg-[var(--color-interactive-10)] text-[var(--color-interactive)]"
      : "text-content-secondary hover:bg-surface-elevated hover:text-content-primary";
  return (
    <button
      key={`opt-${index}-${option.value}`}
      type="button"
      role="option"
      aria-selected={selected}
      disabled={option.locked}
      onClick={() => menu.onSelect(option.value)}
      className={classNames(
        "w-full text-left rounded-md px-2.5 py-2 transition-colors duration-100 flex items-center justify-between group outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
        stateClass,
        menu.optionClassName,
      )}
    >
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span
          className={classNames(
            "flex min-w-0 items-center gap-2",
            menu.optionLabelClassName,
          )}
        >
          {option.icon ? (
            <span aria-hidden="true" className="shrink-0">
              {option.icon}
            </span>
          ) : null}
          <span className={classNames(menu.truncate && "truncate")}>
            {option.label}
          </span>
        </span>
        {option.description ? (
          <span
            className={`ui-text-meta truncate ${
              selected
                ? "text-[var(--color-interactive)] opacity-75"
                : "ui-color-disabled group-hover:text-content-muted"
            }`}
          >
            {option.description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 ml-2 flex items-center gap-2">
        <DropdownBadges
          badges={option.badges}
          fixedSlots={option.fixedBadgeSlots}
        />
        <span className="h-3 w-3 flex items-center justify-center">
          {!option.locked && selected ? (
            <Check size={12} aria-hidden="true" />
          ) : null}
        </span>
      </span>
    </button>
  );
}

function DropdownOptions<T extends DropdownValue>(props: MenuProps<T>) {
  return (
    <div
      className="overflow-y-scroll min-h-[40px] py-1.5 pl-1.5 pr-0 flex flex-col gap-1"
      role="listbox"
    >
      {props.options.length ? (
        props.options.map((option, index) =>
          option.isHeader ? (
            <DropdownHeader
              key={`header-${index}-${option.value}`}
              option={option}
              index={index}
            />
          ) : (
            <DropdownOptionRow
              key={`opt-${index}-${option.value}`}
              option={option}
              index={index}
              menu={props}
            />
          ),
        )
      ) : (
        <div className="px-3 py-4 ui-text-body-sm ui-color-muted text-center">
          {props.noOptionsLabel}
        </div>
      )}
    </div>
  );
}

export function DropdownMenu<T extends DropdownValue>(props: MenuProps<T>) {
  const offset = props.openUpward ? 4 : -4;
  const placement = props.openUpward ? "bottom-full mb-1" : "top-full mt-1";
  return (
    <AnimatePresence>
      {props.open ? (
        <motion.div
          ref={props.menuRef}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          transition={{ duration: 0.15 }}
          className={`ui-surface-menu absolute left-0 right-0 flex flex-col max-h-[280px] ${placement} ${props.menuClassName}`}
        >
          <DropdownSearch {...props} />
          <DropdownOptions {...props} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
