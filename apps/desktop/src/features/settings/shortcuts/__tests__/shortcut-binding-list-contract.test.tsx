// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutBindingList } from "../ShortcutBindingList";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("ShortcutBindingList", () => {
  it("preserves capture, validation, expansion and disabled-cleanup states", () => {
    const onCapture = vi.fn();
    const onToggleExpand = vi.fn();
    const onUpdate = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ShortcutBindingList
          mode="smart"
          bindings={[
            {
              shortcut: "Command+A",
              temporary: false,
              cleanup_enabled: true,
            },
            {
              shortcut: "Command+B",
              temporary: false,
              cleanup_enabled: false,
            },
          ]}
          invalidDrafts={{ 0: "Already assigned" }}
          enabled
          expanded={false}
          activeCapture={{ mode: "smart", index: 0 }}
          capturePreview="Command+Shift+A"
          onCapture={onCapture}
          onToggleExpand={onToggleExpand}
          onUpdate={onUpdate}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          cleanupDisabled
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Command+Shift+A")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("Already assigned");
    expect(
      (screen.getByRole("button", { name: "Cleanup" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show shortcuts" }));
    fireEvent.click(screen.getByRole("button", { name: "Command+Shift+A" }));
    fireEvent.click(screen.getByRole("button", { name: "Temporary" }));

    expect(onToggleExpand).toHaveBeenCalledOnce();
    expect(onCapture).toHaveBeenCalledWith(0);
    expect(onUpdate).toHaveBeenCalledWith("smart", 0, { temporary: true });
  });
});
