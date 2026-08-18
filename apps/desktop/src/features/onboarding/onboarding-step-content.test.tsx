// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderOnboardingStep,
  type OnboardingStepViews,
} from "./onboarding-step-content";

vi.mock("../import/components/ImportStep", () => ({
  ImportStep: () => <div>import-view</div>,
}));
vi.mock("./steps/IntelligenceStep", () => ({
  IntelligenceStep: () => <div>intelligence-view</div>,
}));
vi.mock("./steps/ModeStep", () => ({
  ModeStep: () => <div>mode-view</div>,
}));
vi.mock("./steps/ModelStep", () => ({
  ModelStep: () => <div>model-view</div>,
}));
vi.mock("./steps/PermissionsStep", () => ({
  PermissionsStep: () => <div>permissions-view</div>,
}));
vi.mock("./steps/ReadyStep", () => ({
  ReadyStep: () => <div>done-view</div>,
}));
vi.mock("./steps/WelcomeStep", () => ({
  WelcomeStep: () => <div>welcome-view</div>,
}));

const views = {
  welcome: {},
  mode: {},
  model: {},
  import: {},
  intelligence: {},
  permissions: {},
  done: {},
} as unknown as OnboardingStepViews;

afterEach(cleanup);

describe("renderOnboardingStep", () => {
  it.each([
    ["welcome", "welcome-view"],
    ["mode", "mode-view"],
    ["model", "model-view"],
    ["import", "import-view"],
    ["intelligence", "intelligence-view"],
    ["permissions", "permissions-view"],
    ["done", "done-view"],
  ])("maps %s to its stable presentation", (current, expected) => {
    render(renderOnboardingStep(current, views));
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("does not invent content for an unknown machine state", () => {
    const { container } = render(renderOnboardingStep("unknown", views));
    expect(container.childElementCount).toBe(0);
  });
});
