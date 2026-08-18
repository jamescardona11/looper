import { afterEach, describe, expect, test, vi } from "vitest";

import {
  checkoutUrlFor,
  commercialCheckoutUrl,
  customerPortalUrl,
  customerPortalUrlFor,
  personalCheckoutUrl,
} from "./purchaseConfig";

afterEach(() => vi.unstubAllEnvs());

describe("desktop purchase URLs", () => {
  test("trims configured checkout and portal URLs", () => {
    vi.stubEnv("VITE_LOOPER_PERSONAL_CHECKOUT_URL", " https://pay.test/personal ");
    vi.stubEnv("VITE_LOOPER_COMMERCIAL_CHECKOUT_URL", "https://pay.test/team");
    vi.stubEnv("VITE_LOOPER_CUSTOMER_PORTAL", " https://pay.test/portal ");

    expect(personalCheckoutUrl()).toBe("https://pay.test/personal");
    expect(commercialCheckoutUrl()).toBe("https://pay.test/team");
    expect(customerPortalUrl()).toBe("https://pay.test/portal");
  });

  test("adds stable tracking while preserving existing URL state", () => {
    vi.stubEnv(
      "VITE_LOOPER_PERSONAL_CHECKOUT_URL",
      "https://pay.test/personal?coupon=launch#checkout",
    );

    expect(checkoutUrlFor("personal", "onboarding")).toBe(
      "https://pay.test/personal?coupon=launch&utm_source=looper_app&utm_medium=desktop&utm_campaign=personal_license&utm_content=onboarding#checkout",
    );
  });

  test("selects the commercial campaign and settings source", () => {
    vi.stubEnv("VITE_LOOPER_COMMERCIAL_CHECKOUT_URL", "https://pay.test/team");

    expect(checkoutUrlFor("commercial", "settings_account")).toBe(
      "https://pay.test/team?utm_source=looper_app&utm_medium=desktop&utm_campaign=commercial_license&utm_content=settings_account",
    );
  });

  test("tracks customer portal visits", () => {
    vi.stubEnv("VITE_LOOPER_CUSTOMER_PORTAL", "https://pay.test/portal");

    expect(customerPortalUrlFor("settings_account")).toBe(
      "https://pay.test/portal?utm_source=looper_app&utm_medium=desktop&utm_campaign=customer_portal&utm_content=settings_account",
    );
  });

  test("returns missing or non-URL configuration without inventing a target", () => {
    vi.stubEnv("VITE_LOOPER_PERSONAL_CHECKOUT_URL", "");
    expect(checkoutUrlFor("personal", "onboarding")).toBeNull();

    vi.stubEnv("VITE_LOOPER_PERSONAL_CHECKOUT_URL", "checkout-personal");
    expect(checkoutUrlFor("personal", "onboarding")).toBe(
      "checkout-personal",
    );
  });
});
