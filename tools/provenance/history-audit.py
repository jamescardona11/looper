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
TOOL_REF_PREFIX = "refs/codex/"


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


def ref_root_identity(root: Path, ref: str) -> tuple[bool, bool]:
    """Return whether a ref carries the required license and copyright root."""

    try:
        license_text = git(root, "show", f"{ref}:LICENSE")
    except subprocess.CalledProcessError:
        license_text = ""
    try:
        copyright_text = git(root, "show", f"{ref}:COPYRIGHT")
    except subprocess.CalledProcessError:
        copyright_text = ""
    return (
        "GNU AFFERO GENERAL PUBLIC LICENSE" in license_text,
        "James Cardona" in copyright_text,
    )


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


def non_active_ref_findings(root: Path) -> list[dict[str, object]]:
    """Report forbidden paths reachable from non-active, non-backup refs."""

    active_ref = git(root, "rev-parse", "--symbolic-full-name", "HEAD").strip()
    refs = git(
        root,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        "refs/heads",
    ).splitlines()
    reports: list[dict[str, object]] = []
    for line in refs:
        ref, commit = line.split(" ", 1)
        if ref == active_ref or ref.startswith("refs/heads/codex/rebuild/agpl-history-root-"):
            continue

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

        root_has_agplv3, root_names_james_cardona = ref_root_identity(root, ref)

        if forbidden or ledger_hits or not root_has_agplv3 or not root_names_james_cardona:
            reports.append(
                {
                    "ref": ref,
                    "commit": commit,
                    "forbidden_paths": forbidden,
                    "ledger_history_hits": sorted(ledger_hits),
                    "root_has_agplv3": root_has_agplv3,
                    "root_names_james_cardona": root_names_james_cardona,
                }
            )
    return reports


def tool_ref_findings(root: Path) -> list[dict[str, object]]:
    """Report contaminated snapshots kept by the local agent tooling.

    These refs are not release branches and therefore do not make the active
    history fail, but hiding them would make local provenance reporting
    incomplete. The caller can decide when it is safe to remove them.
    """

    refs = git(
        root,
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        TOOL_REF_PREFIX,
    ).splitlines()
    reports: list[dict[str, object]] = []
    ledger = "docs/rebuild/PROVENANCE_LEDGER.csv"
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
        for needle in FORBIDDEN_PATHS:
            commits = git(root, "log", ref, "--format=%H", f"-S{needle}", "--", ledger)
            ledger_hits.extend(f"{hit}:{needle}" for hit in commits.splitlines())
        if forbidden or ledger_hits:
            reports.append(
                {
                    "ref": ref,
                    "commit": commit,
                    "forbidden_paths": forbidden,
                    "ledger_history_hits": sorted(ledger_hits),
                }
            )
    return reports


def unreachable_summary(root: Path) -> dict[str, object]:
    """Summarize unreachable commits without pruning or changing Git state."""

    fsck_lines = git(root, "fsck", "--full", "--no-reflogs", "--unreachable").splitlines()
    commits = sorted(
        {
            line.split()[2]
            for line in fsck_lines
            if len(line.split()) >= 3 and line.split()[1] == "commit"
        }
    )
    if not commits:
        return {"commit_count": 0, "forbidden_object_count": 0, "forbidden_paths": []}

    objects = git(root, "rev-list", "--objects", *commits).splitlines()
    forbidden_entries = {
        line.split(" ", 1)[0]: line.split(" ", 1)[1]
        for line in objects
        if " " in line and line.split(" ", 1)[1] in FORBIDDEN_PATHS
    }
    return {
        "commit_count": len(commits),
        "forbidden_object_count": len(forbidden_entries),
        "forbidden_paths": sorted(set(forbidden_entries.values())),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="Looper checkout root",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail unless the active history and local repository are clean",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    paths = reachable_paths(root)
    forbidden_paths = sorted(path for path in paths if path in FORBIDDEN_PATHS)
    ledger_hits = ledger_history_hits(root)
    retained_backups = backup_refs(root)
    non_active_findings = non_active_ref_findings(root)
    tool_findings = tool_ref_findings(root)
    unreachable = unreachable_summary(root)
    first = root_commit(root)
    license_text = git(root, "show", f"{first}:LICENSE")
    copyright_text = git(root, "show", f"{first}:COPYRIGHT")

    report = {
        "head": git(root, "rev-parse", "HEAD").strip(),
        "root_commit": first,
        "forbidden_paths": forbidden_paths,
        "ledger_history_hits": sorted(ledger_hits),
        "retained_backup_refs": retained_backups,
        "non_active_ref_findings": non_active_findings,
        "tool_ref_findings": tool_findings,
        "unreachable_objects": unreachable,
        "root_has_agplv3": "GNU AFFERO GENERAL PUBLIC LICENSE" in license_text,
        "root_names_james_cardona": "James Cardona" in copyright_text,
    }
    active_ok = not (
        forbidden_paths
        or ledger_hits
        or not report["root_has_agplv3"]
        or not report["root_names_james_cardona"]
    )
    backup_findings = [
        entry
        for entry in retained_backups
        if entry["forbidden_paths"] or entry["ledger_history_hits"]
    ]
    cleanup_required = bool(
        non_active_findings
        or tool_findings
        or backup_findings
        or unreachable["forbidden_object_count"]
    )
    report["active_ok"] = active_ok
    report["cleanup_required"] = cleanup_required
    report["repository_clean"] = active_ok and not cleanup_required
    # Keep `ok` as the release/distribution gate for compatibility. The
    # explicit cleanup fields expose residue without hiding a clean active tree.
    report["ok"] = active_ok
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["ok"] and (not args.strict or report["repository_clean"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
