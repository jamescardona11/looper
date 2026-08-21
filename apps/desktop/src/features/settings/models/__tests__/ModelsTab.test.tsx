// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../ModelsOverview", () => ({
  ModelsOverview: ({
    onBrowse,
    onUse,
    onOpenGeneral,
  }: {
    onBrowse: () => void;
    onUse: (key: string) => void;
    onOpenGeneral: () => void;
  }) => (
    <>
      <button type="button" onClick={onBrowse}>
        Browse models
      </button>
      <button type="button" onClick={() => onUse("overview-model")}>
        Use overview model
      </button>
      <button type="button" onClick={onOpenGeneral}>
        Open general
      </button>
    </>
  ),
}));

vi.mock("../ModelBrowser", () => ({
  ModelBrowser: ({
    onBack,
    onDownload,
    onCancel,
  }: {
    onBack: () => void;
    onDownload: (key: string, ane?: boolean) => void;
    onCancel: (key: string) => void;
  }) => (
    <>
      <button type="button" onClick={onBack}>
        Back to overview
      </button>
      <button type="button" onClick={() => onDownload("browser-model", true)}>
        Download ANE model
      </button>
      <button type="button" onClick={() => onCancel("browser-model")}>
        Cancel model
      </button>
    </>
  ),
}));

import ModelsTab from "../ModelsTab";

afterEach(cleanup);

describe("ModelsTab", () => {
  test("moves between the overview and model browser", () => {
    const setLocalModel = vi.fn();
    const handleDownload = vi.fn();
    const handleCancelDownload = vi.fn();
    const onOpenGeneralTab = vi.fn();
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
        setLocalModel={setLocalModel}
        handleDownload={handleDownload}
        handleDelete={vi.fn()}
        handleCancelDownload={handleCancelDownload}
        onOpenGeneralTab={onOpenGeneralTab}
        onOpenProvidersTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use overview model" }));
    expect(setLocalModel).toHaveBeenCalledWith("overview-model");
    fireEvent.click(screen.getByRole("button", { name: "Open general" }));
    expect(onOpenGeneralTab).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Browse models" }));
    expect(
      screen.getByRole("button", { name: "Back to overview" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download ANE model" }));
    expect(handleDownload).toHaveBeenCalledWith("browser-model", true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel model" }));
    expect(handleCancelDownload).toHaveBeenCalledWith("browser-model");

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(screen.getByRole("button", { name: "Browse models" })).toBeTruthy();
  });
});
