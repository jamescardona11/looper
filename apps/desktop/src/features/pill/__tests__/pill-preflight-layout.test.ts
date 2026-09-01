import { describe, expect, test } from "vitest";
import {
  languageMenuPlacement,
  resolveDockLayout,
} from "../pill-preflight-layout";

describe("preflight dock layout", () => {
  test.each([
    ["floating", "top_center", "left-0 top-0"],
    ["floating", "bottom_center", "bottom-0 left-0"],
    ["dock", "left_center", "bottom-0 left-0"],
    ["dock", "right_center", "bottom-0 right-0"],
  ] as const)(
    "keeps the globally centered %s/%s pill fixed while Language opens",
    (presentation, dock, openPlacement) => {
      const closed = resolveDockLayout(dock, presentation, false);
      const open = resolveDockLayout(dock, presentation, true);

      expect(closed.shellPlacement).toContain("top-1/2");
      expect(open.shellPlacement).toBe(openPlacement);
    },
  );

  test.each([
    ["left_center", "bottom-0 left-0"],
    ["right_center", "bottom-0 left-0"],
  ] as const)(
    "keeps floating/%s fixed with the menu above",
    (dock, openPlacement) => {
      const closed = resolveDockLayout(dock, "floating", false);
      const open = resolveDockLayout(dock, "floating", true);

      expect(closed.shellPlacement).toContain("top-1/2");
      expect(open.shellPlacement).toBe(openPlacement);
    },
  );

  test.each([
    ["top_center", "left-0 top-0"],
    ["bottom_center", "bottom-0 left-0"],
  ] as const)("keeps the %s dock edge anchor unchanged", (dock, placement) => {
    const closed = resolveDockLayout(dock, "dock", false);
    const open = resolveDockLayout(dock, "dock", true);

    expect(closed.shellPlacement).toBe(placement);
    expect(open.shellPlacement).toBe(placement);
  });

  test("places Language outside the shell on both vertical edges", () => {
    expect(languageMenuPlacement(true, "top_center")).toContain("top-[54px]");
    expect(languageMenuPlacement(true, "bottom_center")).toContain(
      "bottom-[54px]",
    );
    expect(languageMenuPlacement(true, "left_center")).toContain(
      "bottom-[54px]",
    );
    expect(languageMenuPlacement(true, "right_center")).toContain(
      "bottom-[54px]",
    );
  });

  test.each([
    ["floating", "top_center"],
    ["floating", "left_center"],
    ["floating", "right_center"],
    ["floating", "bottom_center"],
    ["dock", "top_center"],
    ["dock", "left_center"],
    ["dock", "right_center"],
    ["dock", "bottom_center"],
  ] as const)(
    "keeps the open %s/%s menu outside the pill",
    (presentation, dock) => {
      const windowHeight = 242;
      const shellHeight = 48;
      const menuHeight = 188;
      const shellPlacement = resolveDockLayout(
        dock,
        presentation,
        true,
      ).shellPlacement;
      const menuPlacement = languageMenuPlacement(true, dock);

      const shellTop = shellPlacement.includes("top-0")
          ? 0
          : windowHeight - shellHeight;
      const menuTop = menuPlacement.includes("top-[54px]")
        ? 54
        : windowHeight - 54 - menuHeight;
      const shellBottom = shellTop + shellHeight;
      const menuBottom = menuTop + menuHeight;

      expect(shellBottom <= menuTop || menuBottom <= shellTop).toBe(true);
    },
  );
});
