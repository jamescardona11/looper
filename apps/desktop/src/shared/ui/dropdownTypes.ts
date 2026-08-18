import type { ReactNode } from "react";

export type DropdownValue = string | number;

export interface DropdownOption<T extends DropdownValue> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
  badges?: Array<{
    label: string;
    highlighted?: boolean;
    visible?: boolean;
  }>;
  fixedBadgeSlots?: boolean;
  isHeader?: boolean;
  prominentHeader?: boolean;
  locked?: boolean;
}

export type DropdownEditableInput = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
};
