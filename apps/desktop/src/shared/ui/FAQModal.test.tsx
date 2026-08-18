// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import FAQModal from "./FAQModal";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

function renderModal(isOpen = true) {
  const onClose = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <FAQModal isOpen={isOpen} onClose={onClose} />
    </I18nProvider>,
  );
  return onClose;
}

afterEach(cleanup);

describe("FAQModal", () => {
  test("renders the product FAQ only while open", () => {
    const { rerender } = render(
      <I18nProvider i18n={i18n}>
        <FAQModal isOpen={false} onClose={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <I18nProvider i18n={i18n}>
        <FAQModal isOpen onClose={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("dialog", { name: "Frequently Asked Questions" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
  });

  test("closes from the button, backdrop, and Escape", () => {
    const onClose = renderModal();
    const dialog = screen.getByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Close FAQ" }));
    fireEvent.click(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("does not close when interacting with the content panel", () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByText("How does Looper work?"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
