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
        return (
          <span
            key={`${badge.label}-${index}`}
            className={classNames(
              fixedSlots && "w-4 text-right",
              badge.visible === false
                ? "text-transparent"
                : badge.highlighted
                  ? "text-[var(--color-interactive)]"
                  : "text-content-disabled",
            )}
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

export function DropdownTrigger<T extends DropdownValue>({
  open,
  disabled,
  toggle,
  toggleLabel,
  selected,
  placeholder,
  label,
  icon,
  editableInput,
  buttonClassName,
  valueClassName,
  truncate,
  fitButtonToWidestOption,
  widthLabels,
  hideChevron,
}: TriggerProps<T>) {
  if (editableInput) {
    return (
      <div
        className={`w-full flex items-center justify-between rounded-lg bg-surface-surface border border-border-primary hover:border-border-secondary focus-within:border-border-hover transition-colors ${buttonClassName || "py-2 px-3 ui-text-body-sm"}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon ? (
            <span className="text-content-muted shrink-0" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          {label ? (
            <span className="text-content-muted shrink-0">{label}</span>
          ) : null}
          <input
            type="text"
            value={editableInput.value}
            onChange={(event) => editableInput.onChange(event.target.value)}
            placeholder={editableInput.placeholder}
            aria-label={editableInput.ariaLabel}
            className={classNames(
              "min-w-0 flex-1 bg-transparent text-content-primary placeholder-content-disabled focus:outline-none",
              valueClassName,
            )}
          />
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={toggleLabel}
          className="shrink-0 ml-2 inline-flex items-center justify-center rounded text-content-muted transition-colors hover:text-content-primary outline-hidden focus-visible:[box-shadow:var(--focus-ring)] disabled:opacity-60"
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-disabled={disabled}
      className={`w-full flex items-center justify-between rounded-lg bg-surface-surface border border-border-primary text-left hover:border-border-secondary focus:border-border-hover focus:outline-hidden transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border-primary ${buttonClassName || "py-2 px-3 ui-text-body-sm"}`}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        {icon ? (
          <span className="text-content-muted shrink-0" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label ? (
          <span className="text-content-muted shrink-0">{label}</span>
        ) : null}
        {fitButtonToWidestOption ? (
          <span
            className={classNames(
              "inline-grid",
              selected ? "text-content-primary" : "text-content-muted",
              valueClassName,
            )}
          >
            {widthLabels.map((text, index) => (
              <span
                key={`${text}-${index}`}
                className="invisible col-start-1 row-start-1 whitespace-nowrap"
                aria-hidden="true"
              >
                {text}
              </span>
            ))}
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {selected?.label ?? placeholder}
            </span>
          </span>
        ) : (
          <span
            className={classNames(
              truncate && "truncate",
              selected ? "text-content-primary" : "text-content-muted",
              valueClassName,
            )}
          >
            {selected?.label ?? placeholder}
          </span>
        )}
      </span>
      <span
        className={classNames(
          "flex items-center gap-2 shrink-0",
          !hideChevron && "ml-2",
        )}
      >
        <DropdownBadges
          badges={selected?.badges}
          fixedSlots={selected?.fixedBadgeSlots}
        />
        {!hideChevron ? (
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`text-content-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        ) : null}
      </span>
    </button>
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

export function DropdownMenu<T extends DropdownValue>({
  open,
  openUpward,
  menuRef,
  menuClassName,
  searchable,
  searchQuery,
  setSearchQuery,
  searchPlaceholder,
  searchAriaLabel,
  options,
  value,
  onSelect,
  noOptionsLabel,
  optionClassName,
  optionLabelClassName,
  truncate,
}: MenuProps<T>) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: openUpward ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: openUpward ? 4 : -4 }}
          transition={{ duration: 0.15 }}
          className={`ui-surface-menu absolute left-0 right-0 flex flex-col max-h-[280px] ${openUpward ? "bottom-full mb-1" : "top-full mt-1"} ${menuClassName}`}
        >
          {searchable ? (
            <div className="flex items-center gap-2 px-3 border-b border-border-secondary shrink-0">
              <Search
                size={13}
                className="shrink-0 text-content-disabled"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchAriaLabel}
                autoFocus
                className="w-full bg-transparent border-0 py-2.5 ui-text-body-sm text-content-primary placeholder-content-disabled focus:outline-none"
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          ) : null}
          <div
            className="overflow-y-scroll min-h-[40px] py-1.5 pl-1.5 pr-0 flex flex-col gap-1"
            role="listbox"
          >
            {options.length ? (
              options.map((option, index) =>
                option.isHeader ? (
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
                ) : (
                  <button
                    key={`opt-${index}-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={value === option.value}
                    disabled={option.locked}
                    onClick={() => onSelect(option.value)}
                    className={classNames(
                      "w-full text-left rounded-md px-2.5 py-2 transition-colors duration-100 flex items-center justify-between group outline-hidden focus-visible:[box-shadow:var(--focus-ring)]",
                      option.locked
                        ? "text-content-disabled cursor-default"
                        : value === option.value
                          ? "bg-[var(--color-interactive-10)] text-[var(--color-interactive)]"
                          : "text-content-secondary hover:bg-surface-elevated hover:text-content-primary",
                      optionClassName,
                    )}
                  >
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span
                        className={classNames(
                          "flex min-w-0 items-center gap-2",
                          optionLabelClassName,
                        )}
                      >
                        {option.icon ? (
                          <span aria-hidden="true" className="shrink-0">
                            {option.icon}
                          </span>
                        ) : null}
                        <span className={classNames(truncate && "truncate")}>
                          {option.label}
                        </span>
                      </span>
                      {option.description ? (
                        <span
                          className={`ui-text-meta truncate ${
                            value === option.value
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
                        {!option.locked && value === option.value ? (
                          <Check size={12} aria-hidden="true" />
                        ) : null}
                      </span>
                    </span>
                  </button>
                ),
              )
            ) : (
              <div className="px-3 py-4 ui-text-body-sm ui-color-muted text-center">
                {noOptionsLabel}
              </div>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
