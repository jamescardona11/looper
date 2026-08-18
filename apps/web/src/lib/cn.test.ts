import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    expect(
      cn(
        "px-2 py-1",
        false && "hidden",
        ["font-medium"],
        {
          "text-red-500": true,
          "opacity-50": false,
        },
        "px-4",
      ),
    ).toBe("py-1 font-medium text-red-500 px-4");
  });
});
