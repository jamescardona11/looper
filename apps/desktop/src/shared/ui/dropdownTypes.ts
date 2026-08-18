import type { ReactNode } from "react";

export type DropdownValue = string | number;

type OptionalFields<Names extends PropertyKey, Value> = {
  [Field in Names]?: Value;
};

type DropdownBadge = {
  label: string;
} & OptionalFields<"highlighted" | "visible", boolean>;

type DropdownOptionFlags =
  "fixedBadgeSlots" | "isHeader" | "prominentHeader" | "locked";

export type DropdownOption<T extends DropdownValue> = {
  value: T;
  label: string;
} & OptionalFields<"description", string> &
  OptionalFields<"icon", ReactNode> &
  OptionalFields<"badges", DropdownBadge[]> &
  OptionalFields<DropdownOptionFlags, boolean>;

export type DropdownEditableInput = { value: string } & OptionalFields<
  "placeholder" | "ariaLabel",
  string
> & {
    onChange: (value: string) => void;
  };
