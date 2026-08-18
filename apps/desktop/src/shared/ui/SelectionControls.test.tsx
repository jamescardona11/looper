// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import SegmentedControl from "./SegmentedControl";
import ToggleSwitch from "./ToggleSwitch";

beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(cleanup);

describe("selection controls", () => {
  test("exposes segmented options as a single-select radio group", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="local"
        ariaLabel="Processing mode"
        options={[
          { value: "local", label: "Local" },
          { value: "cloud", label: "Cloud" },
        ]}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Processing mode" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Local" }).getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Cloud" }));
    expect(onChange).toHaveBeenCalledWith("cloud");
  });

  test("keeps switch geometry and reports the next toggle", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ToggleSwitch
        enabled={false}
        onToggle={onToggle}
        ariaLabel="Live transcript"
        size="md"
      />,
    );
    const toggle = screen.getByRole("switch", { name: "Live transcript" });
    const thumb = toggle.firstElementChild as HTMLElement;

    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.style.width).toBe("40px");
    expect(thumb.style.transform).toBe("translateX(0px)");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <ToggleSwitch
        enabled
        onToggle={onToggle}
        ariaLabel="Live transcript"
        size="md"
      />,
    );
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(thumb.style.transform).toBe("translateX(20px)");
  });

  test("does not toggle while disabled", () => {
    const onToggle = vi.fn();
    render(
      <ToggleSwitch
        enabled={false}
        onToggle={onToggle}
        ariaLabel="Unavailable option"
        disabled
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Unavailable option" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
