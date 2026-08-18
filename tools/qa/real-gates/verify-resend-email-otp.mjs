#!/usr/bin/env node
import {
  assertMockModeFalse,
  convex,
  convexUrl,
  optionalEnv,
  requiredEnv,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "Resend email OTP real";

try {
  await main();
} catch (error) {
  console.error(
    `Release gate failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

async function main() {
  assertMockModeFalse();

  const email = requiredEnv("OTP_EMAIL");
  const code = process.env.OTP_CODE?.trim() || process.env.RESEND_OTP_CODE?.trim();
  const requestFirst = process.env.RESEND_REQUEST_FIRST === "true";

  if (!code || requestFirst) {
    await convex("action", "auth:signIn", {
      provider: "resend-otp",
      params: { email },
    });
  }

  if (!code) {
    const result = {
      ok: false,
      status: "request-pending",
      gate,
      generatedAt: new Date().toISOString(),
      convexUrl: convexUrl(),
      email,
      phase: "request",
      evidenceMeaning:
        "Real Resend OTP request was sent. Re-run with OTP_CODE or RESEND_OTP_CODE from the delivered email to close the gate.",
    };
    const paths = writeEvidence("resend-email-otp-real-request", result);
    throw new Error(
      `OTP requested for ${email}. Re-run with OTP_CODE=<received code>. Evidence: ${paths.textPath}`,
    );
  }

  if (!/^\d{8}$/.test(code)) {
    throw new Error("OTP_CODE or RESEND_OTP_CODE must be an 8-digit numeric code.");
  }

  const verified = await convex("action", "auth:signIn", {
    provider: "resend-otp",
    params: { email, code },
  });
  const tokens = verified?.tokens;
  if (
    typeof tokens?.token !== "string" ||
    tokens.token.length === 0 ||
    typeof tokens?.refreshToken !== "string" ||
    tokens.refreshToken.length === 0
  ) {
    throw new Error(`OTP verify did not return token pair: ${JSON.stringify(verified)}`);
  }

  const user = await viewer(tokens.token);
  const result = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    convexUrl: convexUrl(),
    email,
    userId: user.userId,
    tokenIssued: true,
    refreshTokenIssued: true,
    phase: "verify",
    requestFirst,
    evidenceMeaning:
      "Resend delivered a real OTP and Convex Auth verified it into token + refresh token.",
  };
  const paths = writeEvidence("resend-email-otp-real", result);
  console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
}
