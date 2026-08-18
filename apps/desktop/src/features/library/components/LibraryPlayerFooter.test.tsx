// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LibraryPlayerFooter, playbackRateMotion } from "./LibraryPlayerFooter";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

const renderFooter = (overrides = {}) => {
  const props = {
    audioReady: true,
    audioError: null,
    isPlaying: false,
    onTogglePlayback: vi.fn(),
    audioCurrentTime: 12,
    audioDuration: 60,
    scrubberMax: 60,
    scrubberValue: 12,
    scrubberPercent: 20,
    onScrubChange: vi.fn(),
    onScrubStart: vi.fn(),
    onScrubEnd: vi.fn(),
    playbackRate: 1,
    onPlaybackRateStep: vi.fn(),
    canDecreasePlaybackRate: true,
    canIncreasePlaybackRate: true,
    onRateScrubStart: vi.fn(),
    canShowTimestamps: true,
    showTimestamps: true,
    setShowTimestamps: vi.fn(),
    showSegmentView: true,
    followTimestampsActive: false,
    onFollowTimestampsChange: vi.fn(),
    onUpdate: vi.fn(),
    ...overrides,
  };
  const view = render(
    <I18nProvider i18n={i18n}>
      <LibraryPlayerFooter {...props} />
    </I18nProvider>,
  );
  return { ...view, props };
};

describe("LibraryPlayerFooter", () => {
  test("keeps playback controls in a bottom dock", () => {
    const { container } = renderFooter();
    const dock = container.querySelector('[data-ui-dock="meeting-player"]');

    expect(dock?.className).toBe(
      "sticky bottom-0 z-20 shrink-0 border-t border-[var(--color-border-primary)] bg-surface-overlay px-4 pt-2.5 pb-1",
    );
    expect(dock?.firstElementChild?.className).toBe("flex items-center gap-4");
  });

  test("connects the visible playback controls to their actions", () => {
    const { props } = renderFooter();

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease speed" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase speed" }));
    fireEvent.change(screen.getByRole("slider", { name: "Audio scrubber" }), {
      target: { value: "24" },
    });

    expect(props.onTogglePlayback).toHaveBeenCalledTimes(1);
    expect(props.onPlaybackRateStep.mock.calls).toEqual([[-1], [1]]);
    expect(props.onScrubChange).toHaveBeenCalledWith("24");
  });

  test("forwards mouse and touch scrub boundaries without changing the DOM", () => {
    const { props } = renderFooter();
    const slider = screen.getByRole("slider", { name: "Audio scrubber" });
    const rate = screen.getByText("1x");

    expect(slider.getAttribute("style")).toBe(
      "background: linear-gradient(to right, var(--color-toggle-on) 0%, var(--color-toggle-on) 20%, var(--color-border-secondary) 20%, var(--color-border-secondary) 100%);",
    );
    fireEvent.mouseDown(slider);
    fireEvent.touchStart(slider);
    fireEvent.mouseUp(slider);
    fireEvent.touchEnd(slider);
    fireEvent.mouseDown(rate);
    fireEvent.touchStart(rate);

    expect(props.onScrubStart).toHaveBeenCalledTimes(2);
    expect(props.onScrubEnd).toHaveBeenCalledTimes(2);
    expect(props.onRateScrubStart).toHaveBeenCalledTimes(2);
  });

  test("removes travel from the speed transition with reduced motion", () => {
    expect(playbackRateMotion(true)).toEqual({
      initial: false,
      exit: undefined,
      transition: { duration: 0 },
    });
    expect(playbackRateMotion(false).initial).toEqual({
      opacity: 0,
      y: -2,
      scale: 0.92,
    });
  });

  test("disables audio actions and replaces the scrubber with its error", () => {
    renderFooter({ audioReady: false, audioError: "Audio unavailable" });

    const play = screen.getByRole("button", { name: "Play audio" });
    expect(play.hasAttribute("disabled")).toBe(true);
    expect(play.className).toContain("opacity-50 cursor-not-allowed");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText("Audio unavailable").className).toBe(
      "ui-text-meta text-content-disabled",
    );
    expect(
      screen
        .getByRole("button", { name: "Decrease speed" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Increase speed" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("turns timestamps off, stops following, and persists the patch", () => {
    const { props } = renderFooter({
      showTimestamps: true,
      followTimestampsActive: true,
    });

    fireEvent.click(screen.getByRole("switch", { name: "Timestamps" }));

    expect(props.setShowTimestamps).toHaveBeenCalledWith(false);
    expect(props.onFollowTimestampsChange).toHaveBeenCalledWith(false);
    expect(props.onUpdate).toHaveBeenCalledWith({ show_timestamps: false });
  });

  test("guards unavailable timestamps and toggles following functionally", () => {
    const unavailable = renderFooter({ canShowTimestamps: false });
    fireEvent.click(screen.getByRole("switch", { name: "Timestamps" }));
    expect(unavailable.props.setShowTimestamps).not.toHaveBeenCalled();
    expect(unavailable.props.onUpdate).not.toHaveBeenCalled();
    unavailable.unmount();

    const available = renderFooter();
    fireEvent.click(screen.getByRole("switch", { name: "Follow timestamp" }));
    const update = available.props.onFollowTimestampsChange.mock.calls[0][0];
    expect(update(false)).toBe(true);
    expect(update(true)).toBe(false);
  });
});
