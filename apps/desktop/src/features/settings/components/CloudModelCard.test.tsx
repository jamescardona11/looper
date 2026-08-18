// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import CloudModelCard from "./CloudModelCard";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

const renderCard = (modelLabel: string | null, onClick?: () => void) =>
  render(
    <I18nProvider i18n={i18n}>
      <CloudModelCard
        providerLabel="OpenAI"
        modelLabel={modelLabel}
        onClick={onClick}
      />
    </I18nProvider>,
  );

describe("CloudModelCard", () => {
  test("shows the provider and configured model as one navigation target", () => {
    const onClick = vi.fn();
    renderCard("gpt-4o-mini-transcribe", onClick);

    const card = screen.getByRole("button", {
      name: "OpenAI cloud model, manage in Providers",
    });
    expect(screen.getByText("OpenAI")).toBeTruthy();
    expect(screen.getByText("gpt-4o-mini-transcribe")).toBeTruthy();
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("keeps a useful fallback when the provider chooses its own model", () => {
    renderCard(null);
    expect(screen.getByText("Cloud transcription")).toBeTruthy();
  });
});
