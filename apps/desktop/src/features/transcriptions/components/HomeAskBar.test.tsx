// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import HomeAskBar from "./HomeAskBar";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderComposer = (onAsk = vi.fn()) => {
  const view = render(
    <I18nProvider i18n={i18n}>
      <HomeAskBar onAsk={onAsk} />
    </I18nProvider>,
  );
  return { ...view, onAsk };
};

describe("HomeAskBar", () => {
  test("stays docked and exposes pointer, focus and press feedback", () => {
    const { container } = renderComposer();
    const dock = container.querySelector('[data-ui-dock="home-memory"]');
    const submit = screen.getByRole("button", { name: "Search Memory" });

    expect(dock?.className).toContain("sticky");
    expect(dock?.className).toContain("bottom-0");
    expect(submit.className).toContain("hover:");
    expect(submit.className).toContain("focus-visible:");
    expect(submit.className).toContain("active:");
  });

  test("submits trimmed text and ignores an empty question", () => {
    const { onAsk } = renderComposer();
    const input = screen.getByRole("textbox", { name: "Ask Memory" });

    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(onAsk).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  pricing decision  " } });
    fireEvent.submit(input.closest("form")!);
    expect(onAsk).toHaveBeenCalledWith("pricing decision");
    expect((input as HTMLInputElement).value).toBe("");
  });
});
