#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const ledgerPath = resolve(root, "docs/rebuild/PROVENANCE_LEDGER.csv");
const allowed = new Set(["owned", "replaced"]);

function csvFields(line) {
  return line.split(",").map((field) => field.trim());
}

const lines = readFileSync(ledgerPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const header = csvFields(lines.shift() ?? "");
const pathIndex = header.indexOf("path");
const statusIndex = header.indexOf("status");
if (pathIndex < 0 || statusIndex < 0) {
  throw new Error("El ledger no contiene las columnas path y status");
}

const ledger = new Map(
  lines.map((line) => {
    const fields = csvFields(line);
    return [fields[pathIndex], fields[statusIndex]];
  }),
);

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"], {
  cwd: root,
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);

const failures = [];
for (const file of staged) {
  const status = ledger.get(file);
  if (!status) failures.push(`${file}: no tiene fila explícita en el ledger`);
  else if (!allowed.has(status)) failures.push(`${file}: estado no cerrado (${status})`);
}

if (failures.length > 0) {
  console.error("Compuerta de procedencia: FALLA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Compuerta de procedencia: OK (${staged.length} rutas en staging)`);
