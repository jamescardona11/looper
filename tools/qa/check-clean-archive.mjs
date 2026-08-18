#!/usr/bin/env node
// Fails when a tracked reference points at a file that a clean checkout does not
// contain. CI never bundles the app, so a missing icon or model only surfaces at
// release time; this gate moves that failure to the pull request.
//
// It exports the committed tree with `git archive` and resolves, against that
// export only:
//   - `include_bytes!` / `include_str!` targets in every Rust crate
//   - the bundle icons declared in tauri.conf.json
//   - absolute asset URLs the web app requests from its public directory
//
// Evidence lands in .tcompound/evidence/qa/ so a release can cite it.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const evidenceDir = join(root, ".tcompound/evidence/qa");
const textEvidencePath = join(evidenceDir, "clean-archive-assets.txt");
const jsonEvidencePath = join(evidenceDir, "clean-archive-assets.json");

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function exportArchive() {
  const target = mkdtempSync(join(tmpdir(), "looper-clean-archive-"));
  const archive = execFileSync("git", ["archive", "HEAD"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 512,
  });
  execFileSync("tar", ["-x", "-C", target], { input: archive, maxBuffer: 1024 * 1024 * 512 });
  return target;
}

/** Default features of the crate that owns a source file, for cfg gating. */
const defaultFeatureCache = new Map();

function defaultFeaturesFor(file) {
  let directory = dirname(join(root, file));
  while (directory.startsWith(root)) {
    if (defaultFeatureCache.has(directory)) return defaultFeatureCache.get(directory);
    const manifest = join(directory, "Cargo.toml");
    if (existsSync(manifest)) {
      const body = readFileSync(manifest, "utf8");
      const section = body.split(/^\[features\]$/m)[1] ?? "";
      const declared = section.split(/^\[/m)[0] ?? "";
      const list = declared.match(/^\s*default\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
      const features = new Set(
        list
          .split(",")
          .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean),
      );
      defaultFeatureCache.set(directory, features);
      return features;
    }
    directory = dirname(directory);
  }
  return null;
}

/**
 * `include_bytes!("…")` and `include_str!("…")` resolve relative to their own
 * file. A line gated on a feature the crate does not enable by default is not
 * part of any build this repository runs, so it is not required to resolve.
 */
function embeddedReferences(files) {
  const pattern = /include_(?:bytes|str)!\s*\(\s*"([^"]+)"\s*\)/;
  const gate = /#\[cfg\(feature\s*=\s*"([^"]+)"\)\]/;
  const found = [];
  for (const file of files.filter((f) => f.endsWith(".rs"))) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    let pendingFeature = null;
    for (const line of lines) {
      const gated = line.match(gate);
      if (gated) {
        pendingFeature = gated[1];
        continue;
      }
      const match = line.match(pattern);
      if (!match) {
        if (line.trim() !== "") pendingFeature = null;
        continue;
      }
      const feature = pendingFeature;
      pendingFeature = null;
      if (feature && defaultFeaturesFor(file)?.has(feature) === false) continue;
      found.push({
        kind: "include",
        declaredIn: file,
        expected: relative(root, resolve(root, dirname(file), match[1])),
        feature,
      });
    }
  }
  return found;
}

/** Bundle icons are resolved by Tauri relative to the src-tauri directory. */
function tauriIconReferences(files) {
  const found = [];
  for (const file of files.filter((f) => f.endsWith("tauri.conf.json"))) {
    const config = JSON.parse(readFileSync(join(root, file), "utf8"));
    for (const icon of config?.bundle?.icon ?? []) {
      found.push({
        kind: "tauri-icon",
        declaredIn: file,
        expected: relative(root, resolve(root, dirname(file), icon)),
      });
    }
  }
  return found;
}

/** `src="/shots/x.webp"` is served from the app's public directory. */
function webPublicReferences(files) {
  const pattern = /"(\/(?:shots|images|assets)\/[A-Za-z0-9._@/-]+)"/g;
  const found = [];
  for (const file of files.filter((f) => /^apps\/web\/src\/.*\.(tsx|ts)$/.test(f))) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(pattern)) {
      found.push({
        kind: "web-public",
        declaredIn: file,
        expected: join("apps/web/public", match[1]),
      });
    }
  }
  return found;
}

function main() {
  const files = trackedFiles();
  const references = [
    ...embeddedReferences(files),
    ...tauriIconReferences(files),
    ...webPublicReferences(files),
  ];

  const archive = exportArchive();
  const missing = [];
  try {
    for (const reference of references) {
      if (!existsSync(join(archive, reference.expected))) missing.push(reference);
    }
  } finally {
    rmSync(archive, { recursive: true, force: true });
  }

  const unique = new Map();
  for (const reference of missing) {
    if (!unique.has(reference.expected)) unique.set(reference.expected, reference);
  }
  const report = [...unique.values()].sort((a, b) => a.expected.localeCompare(b.expected));

  const lines = [
    `referencias comprobadas: ${references.length}`,
    `rutas distintas ausentes: ${report.length}`,
    "",
    ...report.map((r) => `${r.kind}\t${r.expected}\tdeclarado en ${r.declaredIn}`),
  ];

  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(textEvidencePath, `${lines.join("\n")}\n`);
  writeFileSync(
    jsonEvidencePath,
    `${JSON.stringify({ checked: references.length, missing: report }, null, 2)}\n`,
  );

  if (report.length === 0) {
    console.log(`Archive limpio: ${references.length} referencias resueltas.`);
    return;
  }

  console.error("Archive limpio: FALLA");
  console.error(
    "Estas rutas se referencian desde código o configuración pero no están en el árbol committed:",
  );
  for (const reference of report) {
    console.error(`  ${reference.expected}  (${reference.kind}, ${reference.declaredIn})`);
  }
  console.error(`\nEvidencia: ${relative(root, textEvidencePath)}`);
  process.exit(1);
}

main();
