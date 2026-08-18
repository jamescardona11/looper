#!/usr/bin/env node
import {
  assertMockModeFalse,
  convex,
  convexUrl,
  requiredEnv,
  viewer,
  writeEvidence,
} from "./convex-http.mjs";

const gate = "OAuth real code exchange";
const supportedProviders = new Set(["google", "apple"]);

try {
  await main();
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main() {
  assertMockModeFalse();

  const provider = requiredEnv("OAUTH_PROVIDER");
  if (!supportedProviders.has(provider)) {
    throw new Error("OAUTH_PROVIDER must be google or apple.");
  }

  const code = process.env.OAUTH_CODE?.trim();
  const verifier = process.env.OAUTH_VERIFIER?.trim();
  const requestFirst = process.env.OAUTH_REQUEST_FIRST === "true";

  if (!code || requestFirst) {
    const started = await convex("action", "auth:signIn", {
      provider,
      params: {},
    });
    const redirect = started?.redirect;
    const startedVerifier = started?.verifier;
    if (typeof redirect !== "string" || redirect.length === 0) {
      throw new Error(`OAuth request leg did not return redirect: ${JSON.stringify(started)}`);
    }

    const result = {
      ok: false,
      status: "request-pending",
      gate,
      generatedAt: new Date().toISOString(),
      convexUrl: convexUrl(),
      provider,
      phase: "request",
      redirect,
      verifierIssued: typeof startedVerifier === "string" && startedVerifier.length > 0,
      verifier: typeof startedVerifier === "string" ? startedVerifier : undefined,
      evidenceMeaning:
        "Real OAuth redirect was generated. Open redirect, complete provider login, then re-run with OAUTH_CODE and OAUTH_VERIFIER if verifier was issued.",
    };
    const paths = writeEvidence(`oauth-${provider}-request`, result);
    throw new Error(
      `OAuth redirect generated for ${provider}. Re-run with OAUTH_CODE=<callback code>${
        result.verifierIssued ? " OAUTH_VERIFIER=<verifier from evidence>" : ""
      }. Evidence: ${paths.textPath}`,
    );
  }

  const exchangeArgs = {
    params: { code },
    ...(verifier ? { verifier } : {}),
  };
  const exchanged = await convex("action", "auth:signIn", exchangeArgs);
  const tokens = exchanged?.tokens;
  if (
    typeof tokens?.token !== "string" ||
    tokens.token.length === 0 ||
    typeof tokens?.refreshToken !== "string" ||
    tokens.refreshToken.length === 0
  ) {
    throw new Error(`OAuth exchange did not return token pair: ${JSON.stringify(exchanged)}`);
  }

  const user = await viewer(tokens.token);
  const result = {
    ok: true,
    gate,
    generatedAt: new Date().toISOString(),
    convexUrl: convexUrl(),
    provider,
    userId: user.userId,
    tokenIssued: true,
    refreshTokenIssued: true,
    verifierProvided: Boolean(verifier),
    phase: "exchange",
    evidenceMeaning:
      "A real OAuth provider callback code was exchanged through Convex Auth into token + refresh token.",
  };
  const paths = writeEvidence(`oauth-${provider}-code-exchange`, result);
  console.log(JSON.stringify({ ...result, evidence: paths }, null, 2));
}
