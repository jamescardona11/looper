import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../..");

describe("web bootstrap", () => {
  it("shows a first-paint loader that React removes before mounting", () => {
    const html = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
    const main = fs.readFileSync(path.join(appRoot, "src/main.tsx"), "utf8");

    expect(html).toContain("data-boot-loader");
    expect(html).toContain('aria-label="Loading Looper"');
    expect(html).toContain("boot-loader__grid");
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
    expect(main).toContain('querySelector("[data-boot-loader]")?.remove()');
    expect(main).toContain('rootElement.dataset.mounted = "true"');
    expect(main).toMatch(
      /<I18nProvider>\s*<RouterProvider router=\{router\} \/>\s*<\/I18nProvider>/,
    );
  });
});
