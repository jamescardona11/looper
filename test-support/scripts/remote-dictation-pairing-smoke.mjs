#!/usr/bin/env node

const convexUrl = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const authMode = process.env.REMOTE_PAIRING_AUTH ?? "anonymous";
const otpCode = process.env.OTP_CODE ?? process.env.MOCK_EMAIL_OTP_CODE;
const email =
  process.env.OTP_EMAIL ??
  `remote-pairing-${Date.now()}@looper.local`;
const sessionId =
  process.env.REMOTE_SESSION_ID ??
  `desktop-pairing-${Date.now()}`;
const sessionName = process.env.REMOTE_SESSION_NAME ?? "Desktop Pairing Smoke";
const text =
  process.env.REMOTE_DICTATION_TEXT ??
  "Remote dictation pairing smoke inserted text";

if (authMode === "email-otp" && (!otpCode || !/^\d{8}$/.test(otpCode))) {
  throw new Error("Set OTP_CODE or MOCK_EMAIL_OTP_CODE to an 8-digit mock OTP.");
}

async function convex(endpoint, path, args, token) {
  const response = await fetch(`${convexUrl}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, format: "json", args }),
  });
  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`${endpoint} ${path} returned non-JSON ${response.status}: ${bodyText}`);
  }
  if (!response.ok || body.status !== "success") {
    throw new Error(`${endpoint} ${path} failed ${response.status}: ${bodyText}`);
  }
  return body.value;
}

async function signInEmailOtp(label) {
  await convex("action", "auth:signIn", {
    provider: "resend-otp",
    params: { email },
  });
  const result = await convex("action", "auth:signIn", {
    provider: "resend-otp",
    params: { email, code: otpCode },
  });
  const tokens = result?.tokens;
  if (
    typeof tokens?.token !== "string" ||
    typeof tokens?.refreshToken !== "string"
  ) {
    throw new Error(`${label} OTP verify did not return token pair.`);
  }
  const viewer = await convex("query", "upgrade:viewer", {}, tokens.token);
  if (!viewer || viewer.isAnonymous || typeof viewer.userId !== "string") {
    throw new Error(`${label} viewer is not an identified account.`);
  }
  return { token: tokens.token, refreshToken: tokens.refreshToken, viewer };
}

async function signInAnonymous() {
  const result = await convex("action", "auth:signIn", {
    provider: "anonymous",
    params: {},
  });
  const tokens = result?.tokens;
  if (
    typeof tokens?.token !== "string" ||
    typeof tokens?.refreshToken !== "string"
  ) {
    throw new Error("Anonymous sign-in did not return token pair.");
  }
  const viewer = await convex("query", "upgrade:viewer", {}, tokens.token);
  if (!viewer || typeof viewer.userId !== "string") {
    throw new Error("Anonymous viewer did not resolve to a Convex user.");
  }
  return { token: tokens.token, refreshToken: tokens.refreshToken, viewer };
}

const desktop =
  authMode === "email-otp" ? await signInEmailOtp("desktop") : await signInAnonymous();
const mobile = authMode === "email-otp" ? await signInEmailOtp("mobile") : desktop;

if (desktop.viewer.userId !== mobile.viewer.userId) {
  throw new Error(
    `Expected same Convex user for paired clients, got ${desktop.viewer.userId} and ${mobile.viewer.userId}`,
  );
}

await convex(
  "mutation",
  "dictation/remote:registerSession",
  { sessionId, name: sessionName },
  desktop.token,
);

const sessions = await convex(
  "query",
  "dictation/remote:listActiveSessions",
  {},
  mobile.token,
);
if (!Array.isArray(sessions) || !sessions.some((s) => s.sessionId === sessionId)) {
  throw new Error("Mobile client did not discover the desktop session.");
}

const sendResult = await convex(
  "mutation",
  "dictation/remote:sendDictation",
  { sessionId, text },
  mobile.token,
);
if (typeof sendResult?.seq !== "number") {
  throw new Error("sendDictation did not return a numeric seq.");
}

const pending = await convex(
  "query",
  "dictation/remote:getPendingDictation",
  { sessionId },
  desktop.token,
);
if (!pending || pending.text !== text || pending.seq !== sendResult.seq) {
  throw new Error("Desktop client did not receive the expected pending dictation.");
}

const consumed = await convex(
  "mutation",
  "dictation/remote:consumeDictation",
  { sessionId, seq: pending.seq },
  desktop.token,
);
if (consumed?.consumed !== true) {
  throw new Error("Desktop client did not consume the pending dictation.");
}

const afterConsume = await convex(
  "query",
  "dictation/remote:getPendingDictation",
  { sessionId },
  desktop.token,
);
if (afterConsume !== null) {
  throw new Error("Pending dictation was still visible after consume.");
}

await convex("mutation", "dictation/remote:endSession", { sessionId }, desktop.token);

console.log(
  JSON.stringify(
    {
      ok: true,
      convexUrl,
      authMode,
      email: authMode === "email-otp" ? email : null,
      userId: desktop.viewer.userId,
      isAnonymous: desktop.viewer.isAnonymous === true,
      desktopSessionId: sessionId,
      discoveredByMobile: true,
      sentSeq: sendResult.seq,
      consumed: true,
    },
    null,
    2,
  ),
);
