// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import ImportView from "../ImportView";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));

afterEach(() => {
  cleanup();
  mocks.open.mockReset();
});

describe("ImportView", () => {
  test("opens the native picker and routes its selected paths to the import flow", async () => {
    mocks.open.mockResolvedValue(["one.m4a", "one.m4a", "two.mp4"]);
    const onUpdatePaths = vi.fn();
    render(
      <ImportView
        onBack={vi.fn()}
        onReviewImport={vi.fn()}
        onUpdatePaths={onUpdatePaths}
        selectedPaths={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Choose files/ }));

    await vi.waitFor(() =>
      expect(onUpdatePaths).toHaveBeenCalledWith(["one.m4a", "two.mp4"]),
    );
    expect(screen.getByText("Bring in what you already recorded.")).toBeTruthy();
  });

  test("renders selected files as a removable import queue", () => {
    const onUpdatePaths = vi.fn();
    const onReviewImport = vi.fn();
    render(
      <ImportView
        onBack={vi.fn()}
        onReviewImport={onReviewImport}
        onUpdatePaths={onUpdatePaths}
        selectedPaths={["/tmp/customer-interview.m4a", "/tmp/design-review.mp4"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "2 files" })).toBeTruthy();
    expect(screen.getByText("customer-interview.m4a")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove design-review.mp4" }));
    expect(onUpdatePaths).toHaveBeenCalledWith(["/tmp/customer-interview.m4a"]);
    fireEvent.click(screen.getByRole("button", { name: "Review import" }));
    expect(onReviewImport).toHaveBeenCalledTimes(1);
  });
});
