// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dropdown, type DropdownOption } from "./Dropdown";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const options: DropdownOption<string>[] = [
  { value: "local-header", label: "Local", isHeader: true },
  { value: "parakeet", label: "Parakeet", description: "On device" },
  { value: "cloud-header", label: "Cloud", isHeader: true },
  { value: "remote", label: "Remote", description: "Hosted model" },
];

function renderDropdown(
  props: Partial<React.ComponentProps<typeof Dropdown<string>>> = {},
) {
  const onChange = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <Dropdown<string>
        value={null}
        onChange={onChange}
        options={options}
        {...props}
      />
    </I18nProvider>,
  );
  return onChange;
}

afterEach(cleanup);

describe("Dropdown", () => {
  test("opens, selects an option, and closes the list", () => {
    const onChange = renderDropdown();
    const trigger = screen.getByRole("button", { name: "Select..." });

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Parakeet/ }));

    expect(onChange).toHaveBeenCalledWith("parakeet");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("filters searchable options together with their header", () => {
    renderDropdown({ searchable: true });
    fireEvent.click(screen.getByRole("button", { name: "Select..." }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search options" }), {
      target: { value: "hosted" },
    });

    expect(screen.queryByRole("option", { name: /Parakeet/ })).toBeNull();
    expect(screen.getByText("Cloud")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Remote/ })).toBeTruthy();
  });

  test("closes on Escape and does not open while disabled", () => {
    const { rerender } = render(
      <I18nProvider i18n={i18n}>
        <Dropdown value={null} onChange={vi.fn()} options={options} />
      </I18nProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Select..." });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <I18nProvider i18n={i18n}>
        <Dropdown value={null} onChange={vi.fn()} options={options} disabled />
      </I18nProvider>,
    );
    const disabledTrigger = screen.getByRole("button", { name: "Select..." });
    fireEvent.click(disabledTrigger);
    expect(disabledTrigger).toHaveProperty("disabled", true);
    expect(disabledTrigger.getAttribute("aria-expanded")).toBe("false");
  });
});
