import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalBackendUrl, findAvailablePort, parseEnv } from "./run-local-e2e.mjs";

test("parses the Convex URL without treating comments as values", () => {
  assert.deepEqual(
    parseEnv(
      [
        "# generated",
        "CONVEX_DEPLOYMENT=local:example",
        'CONVEX_URL="http://127.0.0.1:3210"',
        "EMPTY=",
      ].join("\n"),
    ),
    {
      CONVEX_DEPLOYMENT: "local:example",
      CONVEX_URL: "http://127.0.0.1:3210",
      EMPTY: "",
    },
  );
});

test("keeps local E2E off remote deployments unless explicitly allowed", () => {
  assert.doesNotThrow(() => assertLocalBackendUrl("http://127.0.0.1:3210"));
  assert.doesNotThrow(() => assertLocalBackendUrl("http://localhost:3210"));
  assert.throws(
    () => assertLocalBackendUrl("https://example.convex.cloud"),
    /Refusing to run local E2E against remote backend/,
  );
  assert.doesNotThrow(() => assertLocalBackendUrl("https://example.convex.cloud", true));
});

test("selects an available local port for the web E2E server", async () => {
  const port = await findAvailablePort();
  assert.equal(Number.isInteger(port), true);
  assert.ok(port > 0 && port <= 65_535);
});
