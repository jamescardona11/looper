// Shared upload runtime for flows that only need a Convex storage URL.

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be signed in");
    return await ctx.storage.generateUploadUrl();
  },
});
