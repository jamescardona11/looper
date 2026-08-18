import Apple from "@auth/core/providers/apple";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth } from "@convex-dev/auth/server";
import { env, isMockMode } from "./env";

// Convex Auth — providers config.
//
// Provider IDs the React client passes to `signIn(id, ...)`:
//   - `anonymous`       → zero-friction, no credentials
//   - `resend-otp`      → email OTP via Resend (env: RESEND_API_KEY)
//   - `google`          → Google OAuth (env: AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET)
//   - `apple`           → Apple Sign-In (env: AUTH_APPLE_ID + AUTH_APPLE_SECRET)
//   - `github`          → GitHub OAuth (env: AUTH_GITHUB_ID + AUTH_GITHUB_SECRET)
//
// Setup: /integration oauth for social login, /integration email for Resend.
// Apple is REQUIRED by App Store if any other social login is present.

export const emailOtpCodeLength = 8;
export const mockEmailOtpCode = "42424242";

export function getMockEmailOtpCode() {
  const code = process.env.MOCK_EMAIL_OTP_CODE ?? mockEmailOtpCode;
  if (!new RegExp(`^\\d{${emailOtpCodeLength}}$`).test(code)) {
    throw new Error(`MOCK_EMAIL_OTP_CODE must be an ${emailOtpCodeLength}-digit numeric code`);
  }
  return code;
}

export async function generateEmailOtpCode() {
  if (isMockMode()) return getMockEmailOtpCode();

  const digits: string[] = [];

  while (digits.length < emailOtpCodeLength) {
    const bytes = crypto.getRandomValues(new Uint8Array(emailOtpCodeLength));
    for (const byte of bytes) {
      // Rejection sampling avoids modulo bias while keeping the OTP numeric.
      if (byte >= 250) continue;
      digits.push(String(byte % 10));
      if (digits.length === emailOtpCodeLength) break;
    }
  }

  return digits.join("");
}

const EmailOTP = Email({
  // Must match the provider id the web + mobile sign-in forms call:
  // signIn("resend-otp", ...). Without this the base Email() registers as
  // "email" and the client gets "Provider `resend-otp` is not configured".
  id: "resend-otp",
  generateVerificationToken: generateEmailOtpCode,
  sendVerificationRequest: async ({ identifier: email, token }) => {
    if (isMockMode()) {
      console.info(`[auth] MOCK_MODE email OTP for ${email}: ${token}`);
      return;
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY not set");

    const from = env.AUTH_FROM_EMAIL ?? "Looper <noreply@example.com>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: `Your verification code: ${token}`,
        html: `<p>Your verification code is: <strong>${token}</strong></p><p>This code expires in 1 hour.</p>`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend failed to send verification email (${response.status})`);
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Anonymous, EmailOTP, Google, Apple, GitHub],
});
