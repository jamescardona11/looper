import { describe, expect, test, vi } from "vitest";

import { startWindowServices } from "./window-services";

describe("startWindowServices", () => {
  test("starts main-window services and stops them in reverse order", () => {
    const events: string[] = [];
    const first = vi.fn(() => () => events.push("first"));
    const second = vi.fn(() => () => events.push("second"));

    const stop = startWindowServices("main", [first, second]);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    stop();
    expect(events).toEqual(["second", "first"]);
  });

  test("does not start services in secondary windows", () => {
    const start = vi.fn(() => vi.fn());
    startWindowServices("settings", [start])();
    expect(start).not.toHaveBeenCalled();
  });
});
