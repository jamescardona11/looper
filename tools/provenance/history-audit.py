#!/usr/bin/env python3
"""Validate the active Git history and root licensing invariants."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


FORBIDDEN_PATHS = (
    "apps/desktop/src-tauri/src/import/handy.rs",
    "apps/desktop/src-tauri/src/import/wispr.rs",
)
BACKUP_REF_GLOB = "refs/heads/codex/rebuild/agpl-history-root-*"


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return result.stdout


def root_commit(root: Path) -> str:
    return git(root, "rev-list", "--max-parents=0", "--reverse", "HEAD").splitlines()[0]


def reachable_paths(root: Path) -> set[str]:
    return {
        line.split(" ", 1)[1]
        for line in git(root, "rev-list", "--objects", "HEAD").splitlines()
        if " " in line
    }


def ledger_history_hits(root: Path) -> list[str]:
    hits: list[str] = []
    ledger = "docs/rebuild/PROVENANCE_LEDGER.csv"
    for needle in FORBIDDEN_PATHS:
        commits = git(root, "log", "HEAD", "--format=%H", f"-S{needle}", "--", ledger)
        hits.extend(f"{commit}:{needle}" for commit in commits.splitlines())
    return hits


def backup_refs(root: Path) -> list[dict[str, object]]:
    """Describe retained history backups without treating them as active code."""

    refs = git(
        root,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        BACKUP_REF_GLOB,
    ).splitlines()
    reports: list[dict[str, object]] = []
    for line in refs:
        ref, commit = line.split(" ", 1)
        objects = git(root, "rev-list", "--objects", ref)
        paths = {
            entry.split(" ", 1)[1]
            for entry in objects.splitlines()
            if " " in entry
        }
        forbidden = sorted(path for path in paths if path in FORBIDDEN_PATHS)
        ledger_hits: list[str] = []
        ledger = "docs/rebuild/PROVENANCE_LEDGER.csv"
        for needle in FORBIDDEN_PATHS:
            commits = git(root, "log", ref, "--format=%H", f"-S{needle}", "--", ledger)
            ledger_hits.extend(f"{hit}:{needle}" for hit in commits.splitlines())
        reports.append(
            {
                "ref": ref,
                "commit": commit,
                "forbidden_paths": forbidden,
                "ledger_history_hits": sorted(ledger_hits),
            }
        )
    return reports


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Looper checkout root",
    )
    return parser.parse_args()


def main() -> int:
    root = parse_args().root.resolve()
    paths = reachable_paths(root)
    forbidden_paths = sorted(path for path in paths if path in FORBIDDEN_PATHS)
    ledger_hits = ledger_history_hits(root)
    retained_backups = backup_refs(root)
    first = root_commit(root)
    license_text = git(root, "show", f"{first}:LICENSE")
    copyright_text = git(root, "show", f"{first}:COPYRIGHT")

    report = {
        "head": git(root, "rev-parse", "HEAD").strip(),
        "root_commit": first,
        "forbidden_paths": forbidden_paths,
        "ledger_history_hits": sorted(ledger_hits),
        "retained_backup_refs": retained_backups,
        "root_has_agplv3": "GNU AFFERO GENERAL PUBLIC LICENSE" in license_text,
        "root_names_james_cardona": "James Cardona" in copyright_text,
    }
    report["ok"] = not (
        forbidden_paths
        or ledger_hits
        or not report["root_has_agplv3"]
        or not report["root_names_james_cardona"]
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
