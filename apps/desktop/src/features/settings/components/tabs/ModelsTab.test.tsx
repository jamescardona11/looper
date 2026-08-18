// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./ModelsOverview", () => ({
  ModelsOverview: ({ onBrowse }: { onBrowse: () => void }) => (
    <button type="button" onClick={onBrowse}>
      Browse models
    </button>
  ),
}));

vi.mock("./ModelBrowser", () => ({
  ModelBrowser: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      Back to overview
    </button>
  ),
}));

import ModelsTab from "./ModelsTab";

afterEach(cleanup);

describe("ModelsTab", () => {
  test("moves between the overview and model browser", () => {
    render(
      <ModelsTab
        variants={{ hidden: {}, visible: {}, exit: {} }}
        modelCatalog={[]}
        modelStatus={{}}
        downloadState={{}}
        localModel=""
        transcriptionMode="local"
        remoteSpeechEnabled={false}
        remoteSpeechProvider="openai"
        remoteSpeechModel=""
        setLocalModel={vi.fn()}
        handleDownload={vi.fn()}
        handleDelete={vi.fn()}
        handleCancelDownload={vi.fn()}
        onOpenGeneralTab={vi.fn()}
        onOpenProvidersTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse models" }));
    expect(
      screen.getByRole("button", { name: "Back to overview" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByRole("button", { name: "Browse models" })).toBeTruthy();
  });
});
