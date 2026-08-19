# 0005 — Contract tests assert product invariants, never the shape of the source

## Status

Accepted.

## Context

`apps/desktop/src` carries a family of tests that never render anything. They
`readFileSync` a component and assert on the string. Two of them —
`redesign-interaction-contract.test.ts` and `file-size-contract.test.ts` — had
grown into a mix of three very different things, and only one of the three was
paying for itself.

Some of the assertions were genuinely load-bearing. There is no way to check
"no redesigned surface uses `transition-all`" or "every animated surface calls
`useReducedMotion`" from a rendered test: jsdom has no CSS engine, and a
per-component test can only see the component it renders, never the sweep.
These are cross-cutting accessibility and motion invariants with no other
vehicle.

Some were vacuous. `redesign-interaction-contract.test.ts` read
`features/library/components/LibraryView.tsx` and asserted the file did **not**
contain `initial={reduceMotion`, and that it did not contain `transition-all`.
`LibraryView.tsx` is fourteen lines:

```tsx
const LibraryView = (props: LibraryViewProps) => (
  <LibraryViewContent {...props} data-notification-position="library-header" />
);
```

It has no animation and no class names at all. The assertions could not fail —
and, worse, they could not catch the violation they existed for: the real
markup lives in `library-view-content.tsx`, `library-view-list.tsx` and
`library-card-content.tsx`. When the component was split, the test kept
pointing at the husk. It read green for months while guarding nothing.

And some were theatre. The same file asserted that
`features/voice/components/VoiceView.tsx` contained the literal strings
`duration: 0.22` and `step === id ? (`. The second one pins the syntactic form
of a ternary: rewriting it as `step === id && …`, hoisting the condition into a
variable, or letting Prettier reflow the line breaks the test without any
behaviour changing. Exact Tailwind strings (`"sticky bottom-0 z-20"`) are the
same failure — they freeze an internal layout decision that no product
requirement depends on.

`file-size-contract.test.ts` was a different flavour of the same problem. It
imposed `MAX_LINES = 1000` on every `.ts`/`.tsx`/`.rs` file, while
`apps/desktop/AGENTS.md` says "if a file is large but cohesive, keep it
cohesive; split only on real responsibility boundaries". Two rules, opposite
advice, and the one that breaks the build wins. The evidence is
`src-tauri/src/pill.rs`: `pill_layout.rs` and `pill_controller_state.rs` are
declared with `#[path]` as submodules of `pill.rs` and pull in their symbols
with `use super::{…}`. They cannot be read or tested in isolation. They are one
file cut to fit a number, not modules with an interface.

## Decision

A contract test in this repo is legitimate when both hold:

1. It asserts a **product, accessibility or architectural invariant** — a thing
   a user or an auditor would notice if it broke.
2. It has **no other vehicle**. A rendered Testing Library assertion, a unit
   test on extracted logic, or a type would not catch it.

A contract test is illegitimate when it does any of:

- **Asserts the textual shape of source code.** Ternary form, variable names,
  formatting, exact Tailwind class strings, magic numbers inside a transition
  config. These break on refactors that change nothing observable.
- **Reads a file that does not contain the logic it claims to guard.** Every
  file-reading assertion must be re-pointed when a component is split. If it
  reads a re-export wrapper, it is not weak — it is dead, and it hides the gap.
- **Duplicates a rendered test.** If `HomeAskBar.test.tsx` already queries
  `[data-ui-dock="home-memory"]` on the rendered DOM, the file-string version
  adds only a second place to update.

Line-count budgets are ceilings against unbounded growth, not design criteria.
`MAX_LINES` is 2000 and `LEGACY_BUDGET` is 3500 — deliberately far above any
healthy file, so the budget never decides where a module boundary goes.
`apps/desktop/AGENTS.md` decides that.

## Consequences

- `redesign-interaction-contract.test.ts` keeps four sweeps: the `transition-all`
  ban, the `useReducedMotion` guard, Settings-is-a-route (no `aria-modal`, no
  `fixed inset-0`), and the no-entry-animation rule on persistent surfaces. Its
  file lists now point at implementation files, not wrappers.
- Assertions that were already covered by rendered tests were deleted rather
  than kept in two places: the dock anchors live in `HomeAskBar.test.tsx` and
  `LibraryPlayerFooter.test.tsx`, the notification anchors in
  `SettingsErrorBanner.test.tsx` and `library-view-contract.test.tsx`.
- The Voice active-tab indicator moved from two source-string assertions to a
  rendered test in `VoiceView.test.tsx` that clicks a tab and checks the
  indicator followed it.
- Raising `MAX_LINES` to 2000 dropped four files out of the legacy allowlist
  (`assistive.rs`, `license.rs`, `recorder.rs`, `remote_api.rs`), because the
  second test in that file fails on entries that now fit the regular budget.
- The cost: some real regressions are now catchable only by review. Nothing
  fails if someone drops `sticky` from a dock's class list, and nothing forces
  `pill.rs` to shrink. That is the trade — a test that cannot express an
  invariant honestly is worse than no test, because it reads as coverage.
- Every file list in a contract test is a maintenance liability. When you split
  a component, grep the contract tests for its old path.
