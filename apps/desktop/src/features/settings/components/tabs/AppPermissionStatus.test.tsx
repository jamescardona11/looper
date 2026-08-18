// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AppPermissionStatus, permissionStatus } from "./AppPermissionStatus";

const i18n = setupI18n();
i18n.loadAndActivate({ locale: "en", messages: {} });

afterEach(cleanup);

describe("AppPermissionStatus", () => {
  test("normalizes permission values", () => {
    expect(permissionStatus(null)).toBe("checking");
    expect(permissionStatus(true)).toBe("enabled");
    expect(permissionStatus(false)).toBe("disabled");
  });

  test.each([
    [null, "Checking permission"],
    [true, "Enabled"],
    [false, "off"],
  ] as const)("announces %s as %s", (granted, label) => {
    render(
      <I18nProvider i18n={i18n}>
        <AppPermissionStatus granted={granted} />
      </I18nProvider>,
    );

    expect(screen.getByRole("status", { name: label })).toBeTruthy();
  });
});
