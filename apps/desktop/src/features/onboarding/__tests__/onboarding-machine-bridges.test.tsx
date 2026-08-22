// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetectedApp } from "../../../contracts";
import type { OnboardingEvent } from "../machine";
import { OnboardingMachineBridges } from "../onboarding-machine-bridges";

type LlmListeners = {
  progress: (event: { percent: number }) => void;
  complete: () => void;
  error: () => void;
  cancelled: () => void;
};

const mocks = vi.hoisted(() => ({
  llmListeners: null as LlmListeners | null,
  cleanupLlmListener: vi.fn(),
  trackStep: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../data/models/local-llm", () => ({
  listenLocalLlmDownloads: vi.fn((listeners: LlmListeners) => {
    mocks.llmListeners = listeners;
    return Promise.resolve(mocks.cleanupLlmListener);
  }),
}));
vi.mock("../../../data/settings", () => ({
  trackOnboardingStepViewed: mocks.trackStep,
}));

const initialApps: DetectedApp[] = [{ id: "source", name: "Source" }];

function Harness(props: {
  apps: DetectedApp[] | undefined;
  meetingAiAccess: boolean;
  unavailable: boolean;
  localSelected: boolean;
  step: string;
  dispatch: (event: OnboardingEvent) => void;
}) {
  const [download, setDownload] = useState({ downloading: false, percent: 0 });
  return (
    <>
      <output data-testid="llm-download">
        {String(download.downloading)}:{download.percent}
      </output>
      <OnboardingMachineBridges
        importableApps={props.apps}
        meetingAiAccess={props.meetingAiAccess}
        localModelUnavailable={props.unavailable}
        localModeSelected={props.localSelected}
        currentStep={props.step}
        dispatch={props.dispatch}
        onLocalLlmChange={setDownload}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.llmListeners = null;
});

describe("OnboardingMachineBridges", () => {
  it("synchronizes external resources into machine events", async () => {
    const dispatch = vi.fn();
    render(
      <Harness
        apps={initialApps}
        meetingAiAccess
        unavailable
        localSelected
        step="model"
        dispatch={dispatch}
      />,
    );

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_IMPORTABLE",
        apps: initialApps,
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: "SET_MEETING_AI_ACCESS",
        value: true,
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: "SELECT_MODE",
        mode: "cloud",
      });
    });
    expect(mocks.trackStep).toHaveBeenCalledWith("model");
  });

  it("projects local LLM lifecycle events and disposes its subscription", async () => {
    const view = render(
      <Harness
        apps={undefined}
        meetingAiAccess={false}
        unavailable={false}
        localSelected={false}
        step="welcome"
        dispatch={vi.fn()}
      />,
    );
    await waitFor(() => expect(mocks.llmListeners).not.toBeNull());

    act(() => mocks.llmListeners?.progress({ percent: 42 }));
    expect(screen.getByTestId("llm-download").textContent).toBe("true:42");
    act(() => mocks.llmListeners?.complete());
    expect(screen.getByTestId("llm-download").textContent).toBe("false:100");
    act(() => mocks.llmListeners?.error());
    expect(screen.getByTestId("llm-download").textContent).toBe("false:100");

    view.unmount();
    await waitFor(() =>
      expect(mocks.cleanupLlmListener).toHaveBeenCalledOnce(),
    );
  });
});
