import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = (
  import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }
).glob("./**/*.ts");

describe("upload.generateUploadUrl", () => {
  it("requires an authenticated user", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation((api as any).upload.generateUploadUrl, {})).rejects.toThrow(
      "Must be signed in",
    );
  });

  it("returns a storage upload URL for the authenticated user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => await ctx.db.insert("users", {}));

    const uploadUrl = await t
      .withIdentity({ subject: userId })
      .mutation((api as any).upload.generateUploadUrl, {});

    expect(uploadUrl).toEqual(expect.stringContaining("://"));
  });
});
