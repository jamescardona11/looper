import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "../select";

describe("Select", () => {
  it("uses a full mobile touch target without increasing desktop density", () => {
    render(
      <Select
        aria-label="Language"
        value="en"
        onValueChange={() => undefined}
        items={[
          { value: "en", label: "English" },
          { value: "es", label: "Español" },
        ]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Language" })).toHaveClass("h-11", "sm:h-10");
  });
});
