import { describe, expect, it } from "vitest";

import { quotaBlocksSend } from "../quota";

describe("quotaBlocksSend", () => {
  it("blocks when no messages remain on a metered tier", () => {
    expect(quotaBlocksSend(false, 0)).toBe(true);
  });

  it("does not block while messages remain", () => {
    expect(quotaBlocksSend(false, 3)).toBe(false);
  });

  it("never blocks a bring-your-own-key user", () => {
    expect(quotaBlocksSend(true, 0)).toBe(false);
  });

  it("never blocks an unlimited tier (remaining null/undefined)", () => {
    expect(quotaBlocksSend(false, null)).toBe(false);
    expect(quotaBlocksSend(false, undefined)).toBe(false);
  });

  it("blocks defensively on a negative remaining", () => {
    expect(quotaBlocksSend(false, -1)).toBe(true);
  });
});
