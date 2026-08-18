import { describe, expect, test } from "vitest";
import { filterDropdownOptions, widestButtonLabels } from "./dropdownOptions";
import type { DropdownOption } from "./dropdownTypes";

const options: DropdownOption<string>[] = [
  { value: "local-header", label: "Local", isHeader: true },
  { value: "parakeet", label: "Parakeet", description: "On device" },
  { value: "cloud-header", label: "Cloud", isHeader: true },
  { value: "remote", label: "Remote", description: "Hosted model" },
];

describe("dropdown option helpers", () => {
  test("retains only headers that own a matching option", () => {
    expect(
      filterDropdownOptions(options, "hosted").map((option) => option.value),
    ).toEqual(["cloud-header", "remote"]);
  });

  test("builds width labels from selectable options and placeholder", () => {
    expect(widestButtonLabels(options, "Select...", true)).toEqual([
      "Parakeet",
      "Remote",
      "Select...",
    ]);
  });
});
