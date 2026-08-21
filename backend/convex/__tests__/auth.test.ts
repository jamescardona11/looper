import { describe, expect, it } from "vitest";
import {
  emailOtpCodeLength,
  generateEmailOtpCode,
  getMockEmailOtpCode,
  mockEmailOtpCode,
} from "../auth";

describe("email OTP provider", () => {
  it("uses a deterministic code in MOCK_MODE", async () => {
    const previous = process.env.MOCK_MODE;
    const previousCode = process.env.MOCK_EMAIL_OTP_CODE;
    process.env.MOCK_MODE = "true";
    delete process.env.MOCK_EMAIL_OTP_CODE;
    try {
      expect(mockEmailOtpCode).toMatch(/^\d{8}$/);
      await expect(generateEmailOtpCode()).resolves.toBe(mockEmailOtpCode);
    } finally {
      if (previous === undefined) {
        delete process.env.MOCK_MODE;
      } else {
        process.env.MOCK_MODE = previous;
      }
      if (previousCode === undefined) {
        delete process.env.MOCK_EMAIL_OTP_CODE;
      } else {
        process.env.MOCK_EMAIL_OTP_CODE = previousCode;
      }
    }
  });

  it("allows MOCK_MODE to use a per-run OTP code", async () => {
    const previous = process.env.MOCK_EMAIL_OTP_CODE;
    process.env.MOCK_EMAIL_OTP_CODE = "57575757";
    try {
      expect(getMockEmailOtpCode()).toBe("57575757");
    } finally {
      if (previous === undefined) {
        delete process.env.MOCK_EMAIL_OTP_CODE;
      } else {
        process.env.MOCK_EMAIL_OTP_CODE = previous;
      }
    }
  });

  it("rejects invalid per-run mock OTP codes", () => {
    const previous = process.env.MOCK_EMAIL_OTP_CODE;
    process.env.MOCK_EMAIL_OTP_CODE = "123456";
    try {
      expect(() => getMockEmailOtpCode()).toThrow(
        "MOCK_EMAIL_OTP_CODE must be an 8-digit numeric code",
      );
    } finally {
      if (previous === undefined) {
        delete process.env.MOCK_EMAIL_OTP_CODE;
      } else {
        process.env.MOCK_EMAIL_OTP_CODE = previous;
      }
    }
  });

  it("generates an 8-digit numeric code outside MOCK_MODE", async () => {
    const previous = process.env.MOCK_MODE;
    delete process.env.MOCK_MODE;
    try {
      const code = await generateEmailOtpCode();
      expect(code).toMatch(new RegExp(`^\\d{${emailOtpCodeLength}}$`));
    } finally {
      if (previous !== undefined) {
        process.env.MOCK_MODE = previous;
      }
    }
  });
});
