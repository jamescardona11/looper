import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const releaseWorkflow = readFileSync(
  fileURLToPath(
    new URL("../../../../.github/workflows/desktop-release.yml", import.meta.url),
  ),
  "utf8",
);

describe("macOS release signing contract", () => {
  test("requires Developer ID and notarization credentials", () => {
    for (const secret of [
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_TEAM_ID",
      "APPLE_CERTIFICATE",
      "APPLE_CERTIFICATE_PASSWORD",
      "KEYCHAIN_PASSWORD",
    ]) {
      expect(releaseWorkflow).toContain(`secrets.${secret}`);
    }

    expect(releaseWorkflow).toContain("Developer ID Application");
    expect(releaseWorkflow).not.toContain(
      "Preview installers are not yet code-signed by Apple",
    );
  });

  test("rejects a release without a valid Gatekeeper assessment", () => {
    expect(releaseWorkflow).toContain('xcrun stapler validate "$app_path"');
    expect(releaseWorkflow).toContain(
      'spctl --assess --type execute --verbose=4 "$app_path"',
    );
  });
});
