/// <reference types="node" />

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { FAQ_MESSAGE_IDS } from "../faq-content";

const EN_MESSAGES = fileURLToPath(
  new URL("../../../locales/en/messages.po", import.meta.url),
);

describe("FAQ message catalog", () => {
  test("keeps every composed FAQ id in the extracted catalog", () => {
    const catalog = readFileSync(EN_MESSAGES, "utf8");

    expect(FAQ_MESSAGE_IDS).toHaveLength(12);
    for (const id of FAQ_MESSAGE_IDS) {
      expect(catalog).toContain(`msgid "${id}"`);
    }
  });
});
