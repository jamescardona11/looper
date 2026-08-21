import { describe, expectTypeOf, test } from "vitest";
import type {
  ModeRule,
  ModeRuleTrigger,
  ShortcutBindings,
  StoredSettings,
  ThemeMode,
} from "../../settings";

describe("settings wire contract", () => {
  test("keeps application and shortcut fields in the composed settings", () => {
    expectTypeOf<StoredSettings>().toMatchTypeOf<{
      theme_mode: ThemeMode;
      smart_shortcut: string;
      shortcut_bindings: ShortcutBindings;
      remote_speech_provider: string;
      auto_delete_duration: string;
    }>();
  });

  test("uses the tagged trigger contract from native settings", () => {
    expectTypeOf<ModeRule["trigger"]>().toEqualTypeOf<ModeRuleTrigger>();
  });
});
