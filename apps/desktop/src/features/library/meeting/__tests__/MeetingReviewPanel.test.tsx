// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  MeetingReviewPanel,
  type MeetingReviewView,
} from "../MeetingReviewPanel";

vi.mock("../MeetingDetail", () => ({
  default: ({ view }: { view: string }) => <div>Meeting detail: {view}</div>,
}));

vi.mock("../../queries", () => ({
  useMeetingDetails: () => ({ data: { note_markers: [] } }),
}));

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderPanel = (view: MeetingReviewView = "enhanced") => {
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
  test("keeps the note document anatomy with the three reference modes", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Design review" }).isConnected,
    ).toBe(true);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Note",
      "Moments",
      "Transcript",
    ]);
    expect(screen.getByText("Meeting detail: summary").isConnected).toBe(true);
    expect(
      screen.getByRole("main", { name: "Recording document" }).className,
    ).toContain("overflow-hidden");
    expect(
      screen.getByRole("heading", { name: "Design review" }).className,
    ).toContain("ui-text-document-title");
    expect(screen.getByRole("tabpanel").className).toContain("min-h-[260px]");
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

    fireEvent.click(screen.getByRole("tab", { name: /Moments/ }));

    expect(onViewChange).toHaveBeenCalledWith("moments");
  });

  test("returns from the generated summary to the editable note", () => {
    const onViewChange = renderPanel("enhanced");

    fireEvent.click(screen.getByRole("button", { name: "Back to note" }));

    expect(onViewChange).toHaveBeenCalledWith("notes");
  });
});
