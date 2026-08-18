import { useLingui } from "@lingui/react/macro";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { useMountEffect } from "../hooks/useMountEffect";
import { DropdownMenu, DropdownTrigger, classNames } from "./dropdownParts";
import { filterDropdownOptions, widestButtonLabels } from "./dropdownOptions";
import type {
  DropdownEditableInput,
  DropdownOption,
  DropdownValue,
} from "./dropdownTypes";

export type { DropdownOption } from "./dropdownTypes";

interface DropdownProps<T extends DropdownValue> {
  value: T | null;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  label?: string;
  icon?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  valueClassName?: string;
  optionClassName?: string;
  optionLabelClassName?: string;
  onOpen?: () => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  truncate?: boolean;
  fitButtonToWidestOption?: boolean;
  hideChevron?: boolean;
  editableInput?: DropdownEditableInput;
}

export function Dropdown<T extends DropdownValue>({
  value,
  onChange,
  options,
  placeholder,
  label,
  icon,
  searchable = false,
  searchPlaceholder,
  className = "",
  buttonClassName,
  menuClassName = "",
  valueClassName = "",
  optionClassName = "",
  optionLabelClassName = "ui-text-body-sm-strong",
  onOpen,
  onOpenChange,
  disabled = false,
  truncate = true,
  fitButtonToWidestOption = false,
  hideChevron = false,
  editableInput,
}: DropdownProps<T>) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const changeOpen = useCallback((next: boolean) => {
    if (openRef.current === next) return;
    openRef.current = next;
    setOpen(next);
    if (!next) setSearchQuery("");
    onOpenChangeRef.current?.(next);
  }, []);
  const close = useCallback(() => changeOpen(false), [changeOpen]);

  useClickOutside(containerRef, close, open && !disabled);
  useMountEffect(() => {
    onOpenChangeRef.current?.(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  useLayoutEffect(() => {
    if (disabled && open) {
      close();
      return;
    }
    if (!open || !containerRef.current) return;

    const bounds = containerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - bounds.bottom;
    setOpenUpward(spaceBelow < menuHeight && bounds.top > spaceBelow);
  }, [close, disabled, open]);

  const resolvedPlaceholder =
    placeholder ?? t({ id: "dropdown.placeholder", message: "Select..." });
  const resolvedSearchPlaceholder =
    searchPlaceholder ??
    t({ id: "dropdown.search_placeholder", message: "Search..." });
  const selected = options.find((option) => option.value === value);
  const filteredOptions = searchable
    ? filterDropdownOptions(options, searchQuery)
    : options;
  const widthLabels = fitButtonToWidestOption
    ? widestButtonLabels(options, resolvedPlaceholder, value === null)
    : [];

  const toggle = () => {
    if (disabled) return;
    if (openRef.current) {
      close();
      return;
    }
    onOpen?.();
    changeOpen(true);
  };
  const select = (next: T) => {
    onChange(next);
    close();
  };

  return (
    <div
      ref={containerRef}
      className={classNames("relative", open && "z-dropdown-open", className)}
    >
      <DropdownTrigger
        open={open}
        disabled={disabled}
        toggle={toggle}
        toggleLabel={t({
          id: "dropdown.toggle_menu",
          message: "Toggle options",
        })}
        selected={selected}
        placeholder={resolvedPlaceholder}
        label={label}
        icon={icon}
        editableInput={editableInput}
        buttonClassName={buttonClassName}
        valueClassName={valueClassName}
        truncate={truncate}
        fitButtonToWidestOption={fitButtonToWidestOption}
        widthLabels={widthLabels}
        hideChevron={hideChevron}
      />
      <DropdownMenu
        open={open}
        openUpward={openUpward}
        menuRef={menuRef}
        menuClassName={menuClassName}
        searchable={searchable}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchPlaceholder={resolvedSearchPlaceholder}
        searchAriaLabel={t({
          id: "dropdown.search_aria",
          message: "Search options",
        })}
        options={filteredOptions}
        value={value}
        onSelect={select}
        noOptionsLabel={t({
          id: "dropdown.no_options",
          message: "No options found",
        })}
        optionClassName={optionClassName}
        optionLabelClassName={optionLabelClassName}
        truncate={truncate}
      />
    </div>
  );
}
