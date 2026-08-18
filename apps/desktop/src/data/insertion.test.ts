import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  cancelEditAction,
  cancelPendingInsertion,
  chooseEditAction,
  confirmPendingInsertion,
  getActiveModeRuleSuggestion,
  undoLastInsertion,
} from "./insertion";

describe("assistive insertion native gateway", () => {
  beforeEach(() => invoke.mockReset());

  test("routes preview confirmation and cancellation", async () => {
    invoke.mockResolvedValue(undefined);
    await confirmPendingInsertion("edited transcript");
    await cancelPendingInsertion();

    expect(invoke.mock.calls).toEqual([
      ["confirm_pending_insertion", { text: "edited transcript" }],
      ["cancel_pending_insertion"],
    ]);
  });

  test("normalizes optional transform presets for selection actions", async () => {
    invoke.mockResolvedValue(undefined);
    await chooseEditAction("replace", "polish");
    await chooseEditAction("copy");
    await cancelEditAction();

    expect(invoke.mock.calls).toEqual([
      ["choose_edit_action", { action: "replace", preset: "polish" }],
      ["choose_edit_action", { action: "copy", preset: null }],
      ["cancel_edit_action"],
    ]);
  });

  test("exposes workflow suggestions and the last-insertion undo", async () => {
    invoke
      .mockResolvedValueOnce({
        transformPreset: "email",
        autoSendOnInsert: true,
      })
      .mockResolvedValueOnce(undefined);

    await expect(getActiveModeRuleSuggestion()).resolves.toEqual({
      transformPreset: "email",
      autoSendOnInsert: true,
    });
    await undoLastInsertion();

    expect(invoke.mock.calls).toEqual([
      ["get_active_mode_rule_suggestion"],
      ["undo_last_insertion"],
    ]);
  });
});
