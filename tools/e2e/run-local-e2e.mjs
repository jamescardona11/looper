#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const backendEnvPath = resolve(repoRoot, "backend/.env.local");

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

export function readBackendUrl(path = backendEnvPath) {
  if (!existsSync(path)) return null;
  return parseEnv(readFileSync(path, "utf8")).CONVEX_URL ?? null;
}

export function assertLocalBackendUrl(url, allowRemote = false) {
  const parsed = new URL(url);
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!allowRemote && !localHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run local E2E against remote backend ${url}. Select a local Convex deployment or set E2E_ALLOW_REMOTE=true explicitly.`,
    );
  }
}

export async function findAvailablePort(host = "127.0.0.1") {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local port for web E2E."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

export async function backendReady(url) {
  try {
    const response = await fetch(new URL("/version", url), {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function startConvex() {
  return spawn(
    "pnpm",
    ["--dir", "backend", "exec", "convex", "dev", "--tail-logs", "disable"],
    {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

export async function waitForBackend(child, initialUrl, timeoutMs = 120_000) {
  let outputReady = false;
  const inspect = (chunk, stream) => {
    const text = chunk.toString();
    stream.write(text);
    if (text.includes("Convex functions ready!")) outputReady = true;
  };
  child.stdout.on("data", (chunk) => inspect(chunk, process.stdout));
  child.stderr.on("data", (chunk) => inspect(chunk, process.stderr));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Convex exited before becoming ready (status ${child.exitCode}).`);
    }
    const url = readBackendUrl() ?? initialUrl;
    if (url) {
      assertLocalBackendUrl(url, process.env.E2E_ALLOW_REMOTE === "true");
      if (outputReady && (await backendReady(url))) return url;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Convex did not become ready within 120 seconds.");
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  signalProcess(child, "SIGINT");

  await Promise.race([
    exited,
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);
  if (child.exitCode === null) {
    signalProcess(child, "SIGTERM");
    await exited;
  }
}

function signalProcess(child, signal) {
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== "EPERM" && error?.code !== "ESRCH") throw error;
    }
  }
  child.kill(signal);
}

function runPlaywright(convexUrl, webPort) {
  const result = spawnSync("pnpm", ["--filter", "@looper/web", "run", "e2e"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      E2E_WEB_PORT: String(webPort),
      VITE_CONVEX_URL: convexUrl,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Playwright E2E gate failed with status ${result.status}.`);
  }
}

function runConvexEnv(command, name, value) {
  const args = ["--dir", "backend", "exec", "convex", "env", command];
  if (name !== undefined) args.push("--", name);
  if (value !== undefined) args.push(value);
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not ${command} Convex environment variable ${name}.`);
  }
  return result.stdout ?? "";
}

function localAuthEnvState() {
  const output = runConvexEnv("list");
  return {
    hasPrivateKey: /^JWT_PRIVATE_KEY=/m.test(output),
    hasJwks: /^JWKS=/m.test(output),
  };
}

function generateLocalAuthKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const privateKeyValue = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString()
    .trimEnd()
    .replace(/\n/g, " ");
  const publicJwk = publicKey.export({ format: "jwk" });
  return {
    privateKey: privateKeyValue,
    jwks: JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] }),
  };
}

export function ensureLocalAuthKeys() {
  const state = localAuthEnvState();
  if (state.hasPrivateKey && state.hasJwks) return false;
  if (state.hasPrivateKey || state.hasJwks) {
    throw new Error(
      "Local Convex auth has only one of JWT_PRIVATE_KEY/JWKS; repair the deployment before running web E2E.",
    );
  }

  const keys = generateLocalAuthKeys();
  try {
    runConvexEnv("set", "JWT_PRIVATE_KEY", keys.privateKey);
    runConvexEnv("set", "JWKS", keys.jwks);
  } catch (error) {
    try {
      runConvexEnv("remove", "JWT_PRIVATE_KEY");
    } catch {
      // Preserve the original provisioning error; cleanup is best effort.
    }
    throw error;
  }
  return true;
}

export function removeLocalAuthKeys(created) {
  if (!created) return;
  try {
    runConvexEnv("remove", "JWT_PRIVATE_KEY");
    runConvexEnv("remove", "JWKS");
  } catch (error) {
    console.error(
      "Could not remove ephemeral local Convex auth keys; inspect the local deployment before reusing it.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function main() {
  let convexProcess = null;
  let ephemeralAuthKeys = false;
  try {
    let convexUrl = readBackendUrl();
    if (convexUrl) {
      assertLocalBackendUrl(convexUrl, process.env.E2E_ALLOW_REMOTE === "true");
    }

    if (!convexUrl || !(await backendReady(convexUrl))) {
      console.log("Starting the configured Convex development backend...");
      convexProcess = startConvex();
      convexUrl = await waitForBackend(convexProcess, convexUrl);
    } else {
      console.log(`Reusing Convex backend at ${convexUrl}.`);
    }

    ephemeralAuthKeys = ensureLocalAuthKeys();
    runPlaywright(convexUrl, await findAvailablePort());
  } finally {
    removeLocalAuthKeys(ephemeralAuthKeys);
    await stopProcess(convexProcess);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
