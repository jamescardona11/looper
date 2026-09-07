import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleGroup } from "../toggle-group";

describe("ToggleGroup", () => {
  it("keeps every adjacent option at a usable touch target size", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup
        aria-label="Feedback type"
        value="idea"
        onValueChange={onValueChange}
        size="sm"
        items={[
          { value: "idea", label: "Idea" },
          { value: "bug", label: "Bug" },
        ]}
      />,
    );

    for (const option of screen.getAllByRole("button")) {
      expect(option).toHaveClass("h-11", "sm:h-10");
    }

    fireEvent.click(screen.getByRole("button", { name: "Bug" }));
    expect(onValueChange).toHaveBeenCalledWith("bug");
  });
});
