// The ownership prologue, declared once.
//
// Every user-scoped mutation used to hand-write the same two steps: load the row
// with `ctx.db.get`, then `if (!doc || doc.userId !== userId) throw …`. That pair
// was duplicated across seven modules, each with its own error string.
//
// What this module actually buys, stated honestly so nobody over-trusts it:
//
//   1. One place decides that "row does not exist" and "row is not yours" are
//      INDISTINGUISHABLE to the caller. That is the only real invariant here, and
//      before this module each of the 17 call sites re-decided it independently.
//   2. ~34 lines of get-then-throw stop being copy-pasted.
//   3. `findOwned` gives the read paths a null-returning variant so answering an
//      unauthorized caller with empty data does not mean re-deriving the check.
//
// What it does NOT buy today, despite the shape suggesting otherwise:
//
//   - Avoiding a second read. `assertOwned` returns the typed document, but 12 of
//     the 17 call sites discard it; only 5 consume the row. The return value is
//     there so a caller CAN keep what it paid for, not because callers were
//     double-reading before — none were.
//   - Owner-field abstraction. `ownerFieldForTable` is consulted, but no entry in
//     USER_SCOPED_TABLE_REGISTRY currently sets `ownerField`, so it resolves to
//     "userId" every time. The indirection is inert until some table opts into
//     "ownerId"; it is here so that day is a registry edit, not an audit of 17
//     call sites.
//
// So: a modest, honest deduplication with one genuine invariant behind it — not a
// deep module. Do not grow logic into it expecting leverage that is not there.
//
// The thrown message stays a call-site decision — it is observable API surface the
// clients and the characterization tests both depend on.

import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ownerFieldForTable } from "../userScopedTables";

// The minimal ctx shape; both QueryCtx and MutationCtx satisfy it.
type OwnershipCtx = { db: Pick<QueryCtx["db"], "get"> };

// The row, or `null` when it does not exist or belongs to another account.
// For the read paths that answer an unauthorized caller with empty data rather
// than an error.
export async function findOwned<Table extends TableNames>(
  ctx: OwnershipCtx,
  table: Table,
  id: Id<Table>,
  userId: Id<"users">,
): Promise<Doc<Table> | null> {
  const doc = await ctx.db.get(id);
  if (!doc) return null;
  const owner = (doc as Record<string, unknown>)[ownerFieldForTable(table)];
  return owner === userId ? doc : null;
}

// The row, or a thrown `message` when it does not exist or belongs to another
// account — the two cases stay indistinguishable to the caller on purpose, so a
// probe cannot tell "not yours" from "does not exist".
export async function assertOwned<Table extends TableNames>(
  ctx: OwnershipCtx,
  table: Table,
  id: Id<Table>,
  userId: Id<"users">,
  message = "Not found",
): Promise<Doc<Table>> {
  const doc = await findOwned(ctx, table, id, userId);
  if (!doc) throw new Error(message);
  return doc;
}
