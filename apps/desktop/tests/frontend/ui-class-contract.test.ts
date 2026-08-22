import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Una clase `ui-text-*` que no existe en el bundle CSS no falla en build:
// el texto simplemente hereda el tamaño base y se ve enorme. Esta guarda lo
// convierte en un fallo ruidoso.
const SRC = resolve(import.meta.dirname, "../../src");
const CSS = [
  "app/App.css",
  "app/animations.css",
  "app/styles/foundation.css",
  "app/styles/utilities.css",
  "app/styles/surfaces.css",
]
  .map((file) => readFileSync(join(SRC, file), "utf8"))
  .join("\n");

const collectTsx = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectTsx(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });

// El lookahead admite pseudo-clases y combinadores: `.ui-x:hover {`, `.ui-x > y`.
const definedClasses = new Set(
  Array.from(CSS.matchAll(/\.(ui-[a-z0-9-]+)(?=[\s{,:.>[])/g)).map(
    (match) => match[1],
  ),
);

describe("desktop ui-class contract", () => {
  test("every ui-* class used in TSX exists in the style bundle", () => {
    const missing = new Map<string, string[]>();

    for (const file of collectTsx(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/["'`\s](ui-[a-z0-9-]+)/g)) {
        const className = match[1];
        if (definedClasses.has(className)) continue;
        const users = missing.get(className) ?? [];
        users.push(file.slice(SRC.length + 1));
        missing.set(className, users);
      }
    }

    expect(
      Object.fromEntries(missing),
      "Undefined ui-* classes render at inherited size — define them in the style bundle or use an existing one",
    ).toEqual({});
  });
});
