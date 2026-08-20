# 0005 — Contract tests assert product invariants, never the shape of the source

## Status

Accepted.

## Context

Some desktop tests inspect source files instead of rendering behavior. This is
useful for repository-wide invariants such as banning `transition-all` or
requiring reduced-motion handling, but it had accumulated assertions over
syntax, exact class strings, and wrapper files that contained no guarded logic.

Those assertions stayed green while implementation moved elsewhere, or failed
on harmless refactors. File-size checks also started acting as architecture
rules even though line count cannot identify a responsibility boundary.

## Decision

A source-reading contract test is legitimate only when both hold:

1. It asserts a **product, accessibility or architectural invariant** — a thing
   a user or an auditor would notice if it broke.
2. It has **no other vehicle**. A rendered Testing Library assertion, a unit
   test on extracted logic, or a type would not catch it.

A contract test is illegitimate when it does any of:

- **Asserts source shape.** Variable names, syntax, formatting, exact class
  strings, or incidental numeric values are implementation details.
- **Reads the wrong owner.** Assertions over wrappers or moved implementations
  provide false coverage.
- **Duplicates a rendered test.** If `HomeAskBar.test.tsx` already queries
  `[data-ui-dock="home-memory"]` on the rendered DOM, the file-string version
  adds only a second place to update.

Line-count budgets are growth ceilings, not design criteria. Thresholds and
allowlists live only in `src/file-size-contract.test.ts`; responsibility
boundaries follow `apps/desktop/AGENTS.md`.

## Consequences

- `redesign-interaction-contract.test.ts` keeps only cross-cutting motion,
  accessibility, and persistent-surface invariants.
- Observable layout and interaction behavior belongs in rendered tests.
- A real regression may remain review-only when no honest automated assertion
  exists; false coverage is worse than an explicit evidence gap.
- File lists in contract tests must be updated whenever an implementation
  owner moves.
