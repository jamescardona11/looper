/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { FAQ_MESSAGE_IDS } from "../faq-content";

const EN_MESSAGES = fileURLToPath(
  new URL("../../../locales/en/messages.po", import.meta.url),
);
const catalog = readFileSync(EN_MESSAGES, "utf8");

describe("FAQ message catalog", () => {
  test("keeps every composed FAQ id in the extracted catalog", () => {
    expect(FAQ_MESSAGE_IDS).toHaveLength(12);
    for (const id of FAQ_MESSAGE_IDS) {
      expect(catalog).toContain(`msgid "${id}"`);
    }
  });

  test("keeps the free-launch FAQ copy in the source catalog", () => {
    expect(catalog).toContain(
      'msgid "faq.free_launch.answer"\nmsgstr "Looper is currently free to use, including dictation, Library, AI Cleanup, Edit Mode, personalization, and the CLI. There are no subscriptions, trials, licenses, or per-minute fees during this free launch period."',
    );
  });
});
