#!/usr/bin/env python3
"""Audit line fingerprints against a configurable reference corpus.

This is a provenance review gate, not a legal conclusion.  It deliberately
reports the strongest matching reference for every product file and writes a
machine-readable CSV plus a summary JSON.

Usage:
    python3 tools/provenance/corpus-audit.py OUT_DIR \
      --refs /path/to/voices/refs

The repository root defaults to the directory containing ``tools/``.  The
reference directory may also be provided through ``LOOPER_REFERENCE_ROOT``.
"""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import os
import sys
from pathlib import Path


TARGET_RELATIVE_ROOTS = (
    "apps/desktop/src",
    "apps/desktop/src-tauri/src",
    "packages/rust/looper-ts/src",
    "apps/mobile/src",
    "apps/mobile/native",
    "apps/mobile/targets/keyboard",
    "apps/mobile/targets/_shared",
    "apps/mobile/targets/widgets",
    "apps/web/src",
    "backend/convex",
    "packages/ts",
)

EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".rs",
    ".swift",
    ".py",
    ".css",
    ".kt",
    ".java",
    ".go",
    ".html",
    ".dart",
}
SKIP_DIRS = {
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "vendor",
    ".next",
    "__pycache__",
    "venv",
    ".venv",
    "Pods",
    "DerivedData",
    "coverage",
    ".turbo",
    "gen",
    ".svelte-kit",
    "bin",
    "obj",
}
MAX_DOCUMENT_FREQUENCY = 60
MIN_LINE_LENGTH = 12
MIN_UNIQUE_LINES = 8

LICENSES = {
    "Glimpse": "AGPL-3.0",
    "voicetypr": "AGPL-3.0",
    "rybbit": "AGPL-3.0",
    "FluidVoice": "GPL",
    "VoiceInk": "GPL",
    "notchi": "GPL",
    "typewhisper-mac": "GPL",
    "Handy": "MIT",
    "OpenOats": "MIT",
    "anarlog": "MIT",
    "buzz": "MIT",
    "hyprnote": "MIT",
    "hyprnote-meeting-closeout": "MIT",
    "jarvis-ai-assistant": "MIT",
    "meetily": "MIT",
    "vibe-notch": "Apache-2.0",
    "arq": "SIN-LICENCIA",
    "ghost-pepper": "SIN-LICENCIA",
    "spoke": "PROPIETARIA",
    "vibe-island-updates": "SIN-LICENCIA",
    "voquill": "AGPL-3.0",
}
BLOCKING_LICENSES = {"AGPL-3.0", "GPL", "SIN-LICENCIA", "PROPIETARIA"}


def walk(root: Path):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in EXTENSIONS:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def fingerprint(path: Path) -> set[int]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return set()
    result: set[int] = set()
    for raw_line in text.splitlines():
        normalized = " ".join(raw_line.split())
        if len(normalized) < MIN_LINE_LENGTH:
            continue
        result.add(
            int.from_bytes(
                hashlib.blake2b(normalized.encode(), digest_size=8).digest(),
                "big",
            )
        )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out_dir", type=Path, help="directory for CSV and JSON output")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Looper checkout root (defaults to this script's repository)",
    )
    parser.add_argument(
        "--refs",
        type=Path,
        default=None,
        help="reference corpus root; defaults to LOOPER_REFERENCE_ROOT",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    refs = args.refs
    if refs is None:
        configured_refs = os.environ.get("LOOPER_REFERENCE_ROOT")
        refs = Path(configured_refs) if configured_refs else root.parent / "voices" / "refs"
    refs = refs.resolve()
    if not refs.is_dir():
        raise SystemExit(f"reference corpus not found: {refs}; pass --refs explicitly")

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    ref_files: list[tuple[str, str, int]] = []
    ref_sets: list[set[int]] = []
    inverted: dict[int, list[int]] = collections.defaultdict(list)

    for repo in sorted(path for path in refs.iterdir() if path.is_dir() and path.name != "ai_docs"):
        before = len(ref_files)
        for path in walk(repo):
            values = fingerprint(path)
            if len(values) < MIN_UNIQUE_LINES:
                continue
            file_id = len(ref_files)
            ref_files.append((repo.name, str(path.relative_to(repo)), len(values)))
            ref_sets.append(values)
            for value in values:
                inverted[value].append(file_id)
        print(f"  indexed {repo.name}: {len(ref_files) - before} files", flush=True)

    dropped = 0
    for value, file_ids in list(inverted.items()):
        if len(file_ids) > MAX_DOCUMENT_FREQUENCY:
            del inverted[value]
            dropped += 1
    print(
        f"\nindex: {len(ref_files)} reference files, {len(inverted)} discriminating lines "
        f"({dropped} boilerplate lines dropped)\n",
        flush=True,
    )

    rows: list[dict[str, object]] = []
    for relative_root in TARGET_RELATIVE_ROOTS:
        target = root / relative_root
        if not target.is_dir():
            continue
        for path in walk(target):
            values = fingerprint(path)
            if len(values) < MIN_UNIQUE_LINES:
                continue
            hits: collections.Counter[int] = collections.Counter()
            for value in values:
                for file_id in inverted.get(value, ()):
                    hits[file_id] += 1
            if not hits:
                continue

            per_repo: dict[str, tuple[float, str, int]] = {}
            for file_id, overlap in hits.items():
                repo, relative_path, _ = ref_files[file_id]
                containment = overlap / len(values)
                if repo not in per_repo or containment > per_repo[repo][0]:
                    per_repo[repo] = (containment, relative_path, overlap)

            best = sorted(per_repo.items(), key=lambda item: -item[1][0])
            top_repo, (top_containment, top_path, top_overlap) = best[0]
            blocking = [
                (repo, result)
                for repo, result in best
                if LICENSES.get(repo, "SIN-LICENCIA") in BLOCKING_LICENSES
                and result[0] >= 0.30
            ]
            rows.append(
                {
                    "ruta": str(path.relative_to(root)),
                    "lineas_utiles": len(values),
                    "repo_top": top_repo,
                    "licencia_top": LICENSES.get(top_repo, "?"),
                    "archivo_top": top_path,
                    "contencion_top": round(top_containment * 100, 1),
                    "lineas_coincidentes": top_overlap,
                    "repos_bloqueantes": ";".join(
                        f"{repo}({LICENSES.get(repo, '?')},{round(result[0] * 100)}%)"
                        for repo, result in blocking
                    ),
                    "otros_repos": ";".join(
                        f"{repo}({round(result[0] * 100)}%)"
                        for repo, result in best[1:5]
                        if result[0] >= 0.20
                    ),
                }
            )

    rows.sort(key=lambda row: (-float(row["contencion_top"]), -int(row["lineas_utiles"])))
    fieldnames = [
        "ruta",
        "lineas_utiles",
        "repo_top",
        "licencia_top",
        "archivo_top",
        "contencion_top",
        "lineas_coincidentes",
        "repos_bloqueantes",
        "otros_repos",
    ]
    with (out_dir / "corpus-inventory.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    summary: dict[str, dict[str, int | str]] = {}
    for row in rows:
        repo = str(row["repo_top"])
        result = summary.setdefault(
            repo,
            {
                "licencia": str(row["licencia_top"]),
                "archivos": 0,
                "lineas": 0,
                "archivos_90": 0,
                "archivos_75": 0,
                "archivos_50": 0,
            },
        )
        result["archivos"] += 1
        result["lineas"] += int(row["lineas_coincidentes"])
        result["archivos_90"] += int(float(row["contencion_top"]) >= 90)
        result["archivos_75"] += int(float(row["contencion_top"]) >= 75)
        result["archivos_50"] += int(float(row["contencion_top"]) >= 50)
    (out_dir / "corpus-summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\nCSV: {out_dir / 'corpus-inventory.csv'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
