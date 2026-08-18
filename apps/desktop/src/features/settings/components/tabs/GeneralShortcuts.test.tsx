// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ShortcutRow } from "./GeneralShortcuts";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("ShortcutRow", () => {
  test("keeps binding flags, additions, removals and the mode toggle connected", () => {
    const onToggle = vi.fn();
    const onUpdate = vi.fn();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ShortcutRow
          mode="smart"
          label="Dictation"
          description="hold to dictate"
          bindings={[
            {
              shortcut: "Command+A",
              temporary: false,
              cleanup_enabled: false,
            },
            {
              shortcut: "Command+B",
              temporary: true,
              cleanup_enabled: false,
            },
          ]}
          enabled
          isExpanded
          captureActive={null}
          capturePreview=""
          onToggle={onToggle}
          onCapture={vi.fn()}
          onToggleExpand={vi.fn()}
          onUpdateBinding={onUpdate}
          onAddBinding={onAdd}
          onRemoveBinding={onRemove}
          canDisable
          cleanupDisabled={false}
        />
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Toggle Dictation shortcut" }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Temporary" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Cleanup" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Remove shortcut" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add shortcut" }));

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenNthCalledWith(1, "smart", 0, {
      temporary: true,
    });
    expect(onUpdate).toHaveBeenNthCalledWith(2, "smart", 1, {
      cleanup_enabled: true,
    });
    expect(onRemove).toHaveBeenCalledWith("smart", 1);
    expect(onAdd).toHaveBeenCalledWith("smart");
  });
});
