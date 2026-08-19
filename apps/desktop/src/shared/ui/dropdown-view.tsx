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
import {
  DropdownMenu,
  DropdownTrigger,
  classNames,
} from "./dropdown-presentation";
import { filterDropdownOptions, widestButtonLabels } from "./dropdownOptions";
import type {
  DropdownEditableInput,
  DropdownOption,
  DropdownValue,
} from "./dropdownTypes";

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

function useDropdownController(
  disabled: boolean,
  onOpen: (() => void) | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [upward, setUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const changeListener = useRef(onOpenChange);
  useLayoutEffect(() => {
    changeListener.current = onOpenChange;
  }, [onOpenChange]);

  const changeOpen = useCallback((next: boolean) => {
    if (openRef.current === next) return;
    openRef.current = next;
    setOpen(next);
    if (!next) setQuery("");
    changeListener.current?.(next);
  }, []);
  const close = useCallback(() => changeOpen(false), [changeOpen]);
  const toggle = useCallback(() => {
    if (disabled) return;
    if (openRef.current) return close();
    onOpen?.();
    changeOpen(true);
  }, [changeOpen, close, disabled, onOpen]);

  useClickOutside(containerRef, close, open && !disabled);
  useMountEffect(() => {
    changeListener.current?.(false);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });
  useLayoutEffect(() => {
    if (disabled && open) return close();
    if (!open || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - bounds.bottom;
    setUpward(spaceBelow < menuHeight && bounds.top > spaceBelow);
  }, [close, disabled, open]);

  return {
    close,
    containerRef,
    menuRef,
    open,
    query,
    setQuery,
    toggle,
    upward,
  };
}

export function Dropdown<T extends DropdownValue>(props: DropdownProps<T>) {
  const { t } = useLingui();
  const searchable = props.searchable ?? false;
  const disabled = props.disabled ?? false;
  const truncate = props.truncate ?? true;
  const fitWidest = props.fitButtonToWidestOption ?? false;
  const hideChevron = props.hideChevron ?? false;
  const control = useDropdownController(
    disabled,
    props.onOpen,
    props.onOpenChange,
  );
  const placeholder =
    props.placeholder ??
    t({ id: "dropdown.placeholder", message: "Select..." });
  const searchPlaceholder =
    props.searchPlaceholder ??
    t({ id: "dropdown.search_placeholder", message: "Search..." });
  const selected = props.options.find((option) => option.value === props.value);
  const options = searchable
    ? filterDropdownOptions(props.options, control.query)
    : props.options;
  const widthLabels = fitWidest
    ? widestButtonLabels(props.options, placeholder, props.value === null)
    : [];
  const select = (value: T) => {
    props.onChange(value);
    control.close();
  };

  return (
    <div
      ref={control.containerRef}
      className={classNames(
        "relative",
        control.open && "z-dropdown-open",
        props.className ?? "",
      )}
    >
      <DropdownTrigger
        open={control.open}
        disabled={disabled}
        toggle={control.toggle}
        toggleLabel={t({
          id: "dropdown.toggle_menu",
          message: "Toggle options",
        })}
        selected={selected}
        placeholder={placeholder}
        label={props.label}
        icon={props.icon}
        editableInput={props.editableInput}
        buttonClassName={props.buttonClassName}
        valueClassName={props.valueClassName ?? ""}
        truncate={truncate}
        fitButtonToWidestOption={fitWidest}
        widthLabels={widthLabels}
        hideChevron={hideChevron}
      />
      <DropdownMenu
        open={control.open}
        openUpward={control.upward}
        menuRef={control.menuRef}
        menuClassName={props.menuClassName ?? ""}
        searchable={searchable}
        searchQuery={control.query}
        setSearchQuery={control.setQuery}
        searchPlaceholder={searchPlaceholder}
        searchAriaLabel={t({
          id: "dropdown.search_aria",
          message: "Search options",
        })}
        options={options}
        value={props.value}
        onSelect={select}
        noOptionsLabel={t({
          id: "dropdown.no_options",
          message: "No options found",
        })}
        optionClassName={props.optionClassName ?? ""}
        optionLabelClassName={
          props.optionLabelClassName ?? "ui-text-body-sm-strong"
        }
        truncate={truncate}
      />
    </div>
  );
}
