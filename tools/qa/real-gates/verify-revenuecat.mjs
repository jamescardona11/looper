#!/usr/bin/env node
import {
  authTokenOrAnonymous,
  convex,
  convexUrl,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "RevenueCat subscriber sync";

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  const requestedAppUserId = process.env.E2E_REVENUECAT_APP_USER_ID?.trim();
  const allowAnonymous = process.env.ALLOW_ANONYMOUS_CONVEX_AUTH_TOKEN === "true";
  if (!requestedAppUserId && !allowAnonymous) {
    throw new Error("Missing E2E_REVENUECAT_APP_USER_ID.");
  }
  const token = await authTokenOrAnonymous();
  const user = await viewer(token);
  const appUserId = requestedAppUserId || user.userId;
  if (appUserId !== user.userId) {
    throw new Error(
      `E2E_REVENUECAT_APP_USER_ID must match authenticated userId (${user.userId}) for syncRevenueCatPurchase.`,
    );
  }

  const syncResult = await convex(
    "action",
    "payments/revenueCat:syncRevenueCatPurchase",
    { appUserId },
    token,
  );
  const subscription = await convex("query", "payments/subscription:mySubscription", {}, token);
  const activeEntitlements = Array.isArray(syncResult.activeEntitlements)
    ? syncResult.activeEntitlements
    : [];
  if (activeEntitlements.length === 0) {
    const result = {
      ok: false,
      status: "failed",
      gate,
      generatedAt: new Date().toISOString(),
      convexUrl: convexUrl(),
      userId: user.userId,
      appUserId,
      activeEntitlements,
      subscription,
      failureClass: "revenuecat-no-active-entitlements",
      error:
        "RevenueCat sync returned no active entitlements; this does not prove subscriber sync.",
      evidenceMeaning:
        "RevenueCat sync was reached with a matching authenticated app user id, but the subscriber has no active entitlements. This does not close the release gate.",
    };
    const paths = writeEvidence("revenuecat-subscriber-sync", result);
    throw new Error(`${result.error} Evidence: ${paths.textPath}`);
  }
  if (!subscription || subscription.source !== "revenuecat") {
    throw new Error(
      `mySubscription.source must be revenuecat after sync: ${JSON.stringify(subscription)}`,
    );
  }
  if (subscription.status !== "active") {
    throw new Error(
      `mySubscription.status must be active after RevenueCat sync: ${JSON.stringify(subscription)}`,
    );
  }
  if (subscription.tier !== "pro" && subscription.tier !== "ultra") {
    throw new Error(
      `mySubscription.tier must be a paid tier after RevenueCat sync: ${JSON.stringify(
        subscription,
      )}`,
    );
  }
  const expectedTier = process.env.REVENUECAT_EXPECTED_TIER?.trim();
  if (expectedTier && subscription.tier !== expectedTier) {
    throw new Error(
      `mySubscription.tier must match REVENUECAT_EXPECTED_TIER=${expectedTier}: ${JSON.stringify(
        subscription,
      )}`,
    );
  }
  const expectedEntitlement = process.env.REVENUECAT_EXPECTED_ENTITLEMENT?.trim();
  if (expectedEntitlement && !activeEntitlements.includes(expectedEntitlement)) {
    throw new Error(
      `RevenueCat active entitlements must include REVENUECAT_EXPECTED_ENTITLEMENT=${expectedEntitlement}: ${JSON.stringify(
        activeEntitlements,
      )}`,
    );
  }

  const result = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    convexUrl: convexUrl(),
    userId: user.userId,
    appUserId,
    activeEntitlements,
    subscription,
    expectedTier: expectedTier || null,
    expectedEntitlement: expectedEntitlement || null,
    evidenceMeaning:
      "RevenueCat REST subscriber sync returned active entitlements and mySubscription reflected a paid active revenuecat subscription.",
  };
  const paths = writeEvidence("revenuecat-subscriber-sync", result);
  console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
}
