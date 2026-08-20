import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const trackedFiles = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((file) => file && existsSync(path.resolve(root, file))),
);
const untrackedMarkdown = execFileSync(
  "git",
  ["ls-files", "-z", "--others", "--exclude-standard", "--", "*.md"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const markdownFiles = [
  ...new Set([
    ...[...trackedFiles].filter((file) => file.endsWith(".md")),
    ...untrackedMarkdown,
  ]),
];
const failures = [];
const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

for (const file of markdownFiles) {
  const content = readFileSync(path.resolve(root, file), "utf8");

  if (/\/Users\/[^/]+\//.test(content)) {
    failures.push(`${file}: contiene una ruta local /Users/...`);
  }
  if (/(^|[\s`(/])ai_docs\//m.test(content)) {
    failures.push(`${file}: referencia documentación local ignorada bajo ai_docs/`);
  }
  if (/\bnpx\b/.test(content)) {
    failures.push(`${file}: usa npx en vez de un comando versionado del repositorio`);
  }

  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1].replace(/^<|>$/g, "");
    if (rawTarget.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(rawTarget)) {
      continue;
    }

    let target;
    try {
      target = decodeURIComponent(rawTarget.split(/[?#]/, 1)[0]);
    } catch {
      failures.push(`${file}: enlace con escape inválido: ${rawTarget}`);
      continue;
    }

    if (!target) continue;
    if (/(^|\/)(\.argent|\.tcompound|ai_docs)(\/|$)/.test(target)) {
      failures.push(`${file}: enlaza evidencia local no versionada: ${rawTarget}`);
      continue;
    }

    const resolved = path.posix.normalize(
      target.startsWith("/")
        ? target.slice(1)
        : path.posix.join(path.posix.dirname(file), target),
    );
    const isTracked =
      trackedFiles.has(resolved) ||
      [...trackedFiles].some((candidate) => candidate.startsWith(`${resolved}/`));

    if (resolved.startsWith("../") || !isTracked) {
      failures.push(`${file}: enlace local no versionado o inexistente: ${rawTarget}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`docs ok: ${markdownFiles.length} archivos Markdown revisados`);
