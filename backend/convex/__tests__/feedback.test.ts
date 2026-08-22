import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { rerootModules } from "../../test-support/meteredHarness";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";

const modules = rerootModules(
  (
    import.meta as unknown as {
      glob: (p: string) => Record<string, () => Promise<unknown>>;
    }
  ).glob("../**/*.ts"),
  "",
);

const previousAdminEmails = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (previousAdminEmails === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = previousAdminEmails;
  }
});

describe("feedback", () => {
  it("accepts anonymous feedback and trims the message", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(api.feedback.feedback.submit, {
      kind: "idea",
      message: "  Add remote dictation status  ",
      path: "/dictation",
      rating: 5,
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("feedback").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "idea",
      message: "Add remote dictation status",
      path: "/dictation",
      rating: 5,
      status: "new",
    });
    expect(rows[0]?.userId).toBeUndefined();
  });

  it("requires non-empty feedback and caps oversized messages", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.feedback.feedback.submit, {
        kind: "bug",
        message: "   ",
      }),
    ).rejects.toThrow("Feedback message is required");
    await expect(
      t.mutation(api.feedback.feedback.submit, {
        kind: "bug",
        message: "x".repeat(4001),
      }),
    ).rejects.toThrow("Feedback is too long");
  });

  it("lists new feedback only for ADMIN_EMAILS users", async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@example.test",
      }),
    );
    const nonAdminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "member@example.test",
      }),
    );

    await t.mutation(api.feedback.feedback.submit, {
      kind: "praise",
      message: "Solid local QA loop",
      path: "/settings",
    });
    await t.run(async (ctx) =>
      ctx.db.insert("feedback", {
        kind: "bug",
        message: "Already triaged",
        status: "triaged",
        createdAt: Date.now(),
      }),
    );

    process.env.ADMIN_EMAILS = "admin@example.test";

    expect(await t.query(api.feedback.feedback.listForAdmin, {})).toEqual([]);
    expect(
      await t.withIdentity({ subject: nonAdminId }).query(api.feedback.feedback.listForAdmin, {}),
    ).toEqual([]);

    const rows = await t
      .withIdentity({ subject: adminId })
      .query(api.feedback.feedback.listForAdmin, { limit: 10 });
    expect(rows.map((row: Doc<"feedback">) => row.message)).toEqual(["Solid local QA loop"]);
  });
});
