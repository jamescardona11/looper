// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MeetingReviewPanel,
  type MeetingReviewView,
} from "./MeetingReviewPanel";

vi.mock("./MeetingDetail", () => ({
  default: ({ view }: { view: string }) => <div>Meeting detail: {view}</div>,
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderPanel = (view: MeetingReviewView = "notes") => {
  const onViewChange = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <MeetingReviewPanel
        id="meeting-1"
        title="Design review"
        createdAtLabel="Today"
        durationSeconds={1800}
        modelLabel="Parakeet"
        tags={["design"]}
        speakerCount={3}
        view={view}
        onViewChange={onViewChange}
        segments={[]}
        audioAvailable
        onPlayNote={vi.fn()}
        transcriptPanel={<div>Original conversation</div>}
      />
    </I18nProvider>,
  );
  return onViewChange;
};

describe("MeetingReviewPanel", () => {
  test("opens the note as the primary document and keeps sources as modes", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Design review" }).isConnected,
    ).toBe(true);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Note",
      "Moments",
      "Transcript",
    ]);
    expect(screen.getByText("Meeting detail: notes").isConnected).toBe(true);
  });

  test("renders transcript in the same document instead of a side panel", () => {
    renderPanel("transcript");

    expect(screen.getByText("Original conversation").isConnected).toBe(true);
    expect(
      screen.getByText("Original conversation").closest("article")?.dataset
        .layout,
    ).toBe("conversation");
    expect(
      screen
        .getByRole("tab", { name: "Transcript" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("routes Moments to the existing marked-moment view", () => {
    const onViewChange = renderPanel("notes");

    fireEvent.click(screen.getByRole("tab", { name: "Moments" }));

    expect(onViewChange).toHaveBeenCalledWith("moments");
  });

  test("keeps summary as an on-demand review action", () => {
    const onViewChange = renderPanel("notes");

    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));

    expect(onViewChange).toHaveBeenCalledWith("enhanced");
  });
});
