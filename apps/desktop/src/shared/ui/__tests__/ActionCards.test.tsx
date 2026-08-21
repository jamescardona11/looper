// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import ActionCardButton from "../ActionCardButton";
import HoldActionCardButton from "../HoldActionCardButton";

let frameSequence = 0;
let frames = new Map<number, FrameRequestCallback>();

function runNextFrame(timestamp: number) {
  const next = frames.entries().next().value as
    [number, FrameRequestCallback] | undefined;
  if (!next) throw new Error("No animation frame is pending");
  frames.delete(next[0]);
  act(() => next[1](timestamp));
}

beforeEach(() => {
  frameSequence = 0;
  frames = new Map();
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frameSequence += 1;
    frames.set(frameSequence, callback);
    return frameSequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (frameId: number) => {
    frames.delete(frameId);
  });
  vi.spyOn(performance, "now").mockReturnValue(1000);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("action cards", () => {
  test("forwards native button behavior and resolves accent variables", () => {
    const onClick = vi.fn();
    render(
      <ActionCardButton
        title="Open settings"
        description="Configure capture"
        accentPreset="cloud"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole("button", { name: /Open settings/ });

    expect(button.style.getPropertyValue("--action-card-border")).toBe(
      "var(--color-cloud-30)",
    );
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("confirms only after the full hold duration", () => {
    const onConfirm = vi.fn();
    render(
      <HoldActionCardButton
        title="Reset app"
        ariaLabel="Hold to reset app"
        onConfirm={onConfirm}
      />,
    );
    const button = screen.getByRole("button", { name: "Hold to reset app" });

    fireEvent.pointerDown(button, { button: 0 });
    expect(button.dataset.holding).toBe("true");
    runNextFrame(2000);
    expect(button.dataset.ready).toBeUndefined();
    fireEvent.pointerUp(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.pointerDown(button, { button: 0 });
    runNextFrame(3000);
    expect(button.dataset.ready).toBe("true");
    fireEvent.pointerUp(button);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test("cancels an active hold when the pointer leaves", () => {
    const onConfirm = vi.fn();
    render(<HoldActionCardButton title="Delete" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: "Delete" });

    fireEvent.pointerDown(button, { button: 0 });
    runNextFrame(1500);
    fireEvent.pointerLeave(button);
    fireEvent.pointerUp(button);

    expect(button.dataset.holding).toBeUndefined();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
