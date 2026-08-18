// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dropdown } from "./Dropdown";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("dropdown presentation contract", () => {
  test("reports its complete open lifecycle and retains menu classes", () => {
    const onOpenChange = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <Dropdown
          value={null}
          onChange={vi.fn()}
          onOpenChange={onOpenChange}
          options={[{ value: "local", label: "Local" }]}
          className="contract-root"
          menuClassName="contract-menu"
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Select..." });
    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(trigger.parentElement?.className).toContain("contract-root");
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("listbox").parentElement?.className).toContain(
      "contract-menu",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  test("keeps editable text and menu actions independent", () => {
    const onEdit = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <Dropdown
          value={null}
          onChange={vi.fn()}
          options={[{ value: 1, label: "One" }]}
          editableInput={{
            value: "draft",
            onChange: onEdit,
            ariaLabel: "Custom value",
          }}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Custom value" }), {
      target: { value: "edited" },
    });
    expect(onEdit).toHaveBeenCalledWith("edited");
    const menuButton = screen.getByRole("button", { name: "Toggle options" });
    fireEvent.click(menuButton);
    expect(menuButton.getAttribute("aria-expanded")).toBe("true");
  });
});
