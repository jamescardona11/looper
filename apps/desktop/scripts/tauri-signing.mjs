import { execFileSync } from "node:child_process";

export function configureMacQaSigning({
  args,
  env,
  platform,
  findIdentities = findInstalledAppleDevelopmentIdentities,
}) {
  if (
    platform !== "darwin" ||
    args[0] !== "build" ||
    !args.some((arg) => arg.includes("tauri.qa.conf.json")) ||
    env.APPLE_SIGNING_IDENTITY
  ) {
    return;
  }

  const identities = findIdentities();
  if (identities.length === 0) {
    throw new Error(
      "Looper QA requires an Apple Development signing identity so macOS TCC permissions survive rebuilds. Set APPLE_SIGNING_IDENTITY or install a development certificate.",
    );
  }

  env.APPLE_SIGNING_IDENTITY = identities[0];
  console.info(`Looper QA: signing with ${identities[0]}`);
}

function findInstalledAppleDevelopmentIdentities() {
  const output = execFileSync(
    "security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return parseAppleDevelopmentIdentities(output);
}

export function parseAppleDevelopmentIdentities(output) {
  return [...output.matchAll(/"(Apple Development: [^"]+)"/g)].map(
    ([, identity]) => identity,
  );
}
