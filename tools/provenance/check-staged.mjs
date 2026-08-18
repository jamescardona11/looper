#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const ledgerPath = resolve(root, "docs/rebuild/PROVENANCE_LEDGER.csv");
const allowed = new Set(["owned", "replaced", "permissive"]);

function csvFields(line) {
  return line.split(",").map((field) => field.trim());
}

const lines = readFileSync(ledgerPath, "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const header = csvFields(lines.shift() ?? "");
const pathIndex = header.indexOf("path");
const statusIndex = header.indexOf("status");
const noticeIndex = header.indexOf("notice_path");
if (pathIndex < 0 || statusIndex < 0 || noticeIndex < 0) {
  throw new Error("El ledger necesita path, status y notice_path");
}

const ledger = lines.map((line) => {
  const fields = csvFields(line);
  return {
    path: fields[pathIndex],
    status: fields[statusIndex],
    notice: fields[noticeIndex],
  };
});

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped.replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`,
  );
}

function specificity(pattern) {
  return pattern.replace(/\*/g, "").length;
}

function findEntry(file) {
  const matches = ledger.filter((entry) => {
    if (entry.path === file) return true;
    return entry.path.includes("*") && globToRegExp(entry.path).test(file);
  });
  return matches.sort((a, b) => specificity(b.path) - specificity(a.path))[0];
}

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"], {
  cwd: root,
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);

const failures = [];
for (const file of staged) {
  const entry = findEntry(file);
  if (!entry) failures.push(`${file}: no tiene fila explícita en el ledger`);
  else if (!allowed.has(entry.status)) failures.push(`${file}: estado no cerrado (${entry.status})`);
  else if (entry.status === "permissive" && !entry.notice) {
    failures.push(`${file}: código permisivo sin notice_path`);
  }
}

if (failures.length > 0) {
  console.error("Compuerta de procedencia: FALLA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Compuerta de procedencia: OK (${staged.length} rutas en staging)`);
