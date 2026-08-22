// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { activationTimeline } from "../member-card-activation-timeline";
import { useCardActivationSequence } from "../useCardActivationSequence";

type SequenceInput = {
  activating: boolean;
  active: boolean;
  headline: string | null;
  ready: boolean;
  loading: boolean;
  attempt: number;
  complete: () => void;
};

const draftInput = (complete: () => void): SequenceInput => ({
  activating: false,
  active: false,
  headline: "Ada",
  ready: false,
  loading: false,
  attempt: 0,
  complete,
});

const useSequence = (input: SequenceInput) =>
  useCardActivationSequence(
    input.activating,
    input.active,
    input.headline,
    input.ready,
    input.loading,
    input.attempt,
    input.complete,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-16T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("member card activation policy", () => {
  test("keeps the established reveal deadlines", () => {
    expect(activationTimeline("Ada", 0)).toEqual([
      { stage: "stamp", delayMs: 750 },
      { stage: "name", delayMs: 1_820 },
      { stage: "email", delayMs: 2_442 },
      { stage: "details", delayMs: 3_242 },
      { stage: "coverage", delayMs: 4_422 },
      { stage: "done", delayMs: 6_400 },
    ]);
  });

  test("reveals every stage and completes once after a user activation", () => {
    const complete = vi.fn();
    const base = draftInput(complete);
    const { result, rerender } = renderHook(useSequence, {
      initialProps: base,
    });

    expect(result.current.stage).toBe("draft");
    rerender({ ...base, activating: true, attempt: 1 });
    expect(result.current.stage).toBe("wiping");
    expect(result.current.isUserActivationReveal).toBe(true);

    const licensed = {
      ...base,
      active: true,
      ready: true,
      attempt: 1,
    };
    rerender(licensed);

    const reach = (milliseconds: number, stage: string) => {
      act(() => vi.advanceTimersByTime(milliseconds));
      expect(result.current.stage).toBe(stage);
    };
    reach(749, "wiping");
    reach(1, "stamp");
    reach(1_070, "name");
    reach(622, "email");
    reach(800, "details");
    reach(1_180, "coverage");
    reach(1_978, "done");

    expect(complete).toHaveBeenCalledTimes(1);
    rerender(licensed);
    act(() => vi.advanceTimersByTime(10_000));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test("waits for identity data and cancels all deadlines on unmount", () => {
    const complete = vi.fn();
    const base = draftInput(complete);
    const { result, rerender, unmount } = renderHook(useSequence, {
      initialProps: base,
    });

    rerender({ ...base, activating: true, attempt: 1 });
    rerender({ ...base, active: true, attempt: 1 });
    expect(result.current.stage).toBe("wiping");
    expect(vi.getTimerCount()).toBe(0);

    rerender({ ...base, active: true, ready: true, attempt: 1 });
    expect(vi.getTimerCount()).toBe(6);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(7_000));
    expect(complete).not.toHaveBeenCalled();
  });

  test("shows an already-active server license without replaying the sequence", () => {
    const complete = vi.fn();
    const { result } = renderHook(useSequence, {
      initialProps: {
        ...draftInput(complete),
        active: true,
        ready: true,
      },
    });

    expect(result.current.stage).toBe("done");
    expect(result.current.cinematic).toBe(false);
    expect(result.current.showStamp).toBe(true);
    expect(result.current.isUserActivationReveal).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });
});
