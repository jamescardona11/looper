#!/usr/bin/env python3
"""Auditoria de procedencia por CONTENIDO contra todo el corpus de referencias.

A diferencia de similarity-audit.py (que compara por ruta equivalente contra un
solo repo), esto indexa cada linea normalizada de cada repo de referencia y
busca coincidencias sin importar la ruta. Detecta codigo movido o renombrado.

Uso: corpus-audit.py <dir_salida>
"""
import collections
import csv
import hashlib
import json
import sys
from pathlib import Path

REFS = Path("/Users/zoro/j11/voices/refs")
TARGETS = [
    Path("/Users/zoro/j11/looper/apps/desktop/src"),
    Path("/Users/zoro/j11/looper/apps/desktop/src-tauri/src"),
    Path("/Users/zoro/j11/looper/packages/rust/looper-ts/src"),
    Path("/Users/zoro/j11/looper/apps/mobile/src"),
    Path("/Users/zoro/j11/looper/apps/mobile/native"),
    Path("/Users/zoro/j11/looper/apps/mobile/targets/keyboard"),
    Path("/Users/zoro/j11/looper/apps/mobile/targets/_shared"),
    Path("/Users/zoro/j11/looper/apps/mobile/targets/widgets"),
    Path("/Users/zoro/j11/looper/apps/web/src"),
    Path("/Users/zoro/j11/looper/backend/convex"),
    Path("/Users/zoro/j11/looper/packages/ts"),
]
LOOPER_ROOT = Path("/Users/zoro/j11/looper")

EXT = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".rs", ".swift", ".py",
    ".css", ".kt", ".java", ".go", ".html", ".dart",
}
SKIP_DIRS = {
    "node_modules", ".git", "target", "dist", "build", "out", "vendor",
    ".next", "__pycache__", "venv", ".venv", "Pods", "DerivedData",
    "coverage", ".turbo", "gen", ".svelte-kit", "bin", "obj",
}
# Una linea presente en mas de este numero de archivos de referencia se trata
# como boilerplate del ecosistema y no como evidencia de copia.
MAX_DF = 60
MIN_LEN = 12
# Un archivo con menos lineas utiles que esto no produce una senal fiable.
MIN_UNIQ = 8

LICENSES = {
    "Glimpse": "AGPL-3.0", "voicetypr": "AGPL-3.0", "rybbit": "AGPL-3.0",
    "FluidVoice": "GPL", "VoiceInk": "GPL", "notchi": "GPL",
    "typewhisper-mac": "GPL", "Handy": "MIT", "OpenOats": "MIT",
    "anarlog": "MIT", "buzz": "MIT", "hyprnote": "MIT",
    "hyprnote-meeting-closeout": "MIT", "jarvis-ai-assistant": "MIT",
    "meetily": "MIT", "vibe-notch": "Apache-2.0", "arq": "SIN-LICENCIA",
    "ghost-pepper": "SIN-LICENCIA", "spoke": "PROPIETARIA",
    "vibe-island-updates": "SIN-LICENCIA", "voquill": "AGPL-3.0",
}
BLOCKING = {"AGPL-3.0", "GPL", "SIN-LICENCIA", "PROPIETARIA"}


def walk(root: Path):
    for p in root.rglob("*"):
        if p.suffix not in EXT or not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        yield p


def fingerprint(p: Path) -> set[int]:
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return set()
    out = set()
    for raw in text.splitlines():
        s = " ".join(raw.split())
        if len(s) < MIN_LEN:
            continue
        out.add(int.from_bytes(hashlib.blake2b(s.encode(), digest_size=8).digest(), "big"))
    return out


def main() -> int:
    outdir = Path(sys.argv[1])
    outdir.mkdir(parents=True, exist_ok=True)

    ref_files: list[tuple[str, str, int]] = []
    ref_sets: list[set[int]] = []
    inverted: dict[int, list[int]] = collections.defaultdict(list)

    repos = sorted(d for d in REFS.iterdir() if d.is_dir() and d.name != "ai_docs")
    for repo in repos:
        n0 = len(ref_files)
        for p in walk(repo):
            fp = fingerprint(p)
            if len(fp) < MIN_UNIQ:
                continue
            fid = len(ref_files)
            ref_files.append((repo.name, str(p.relative_to(repo)), len(fp)))
            ref_sets.append(fp)
            for h in fp:
                inverted[h].append(fid)
        print(f"  indexado {repo.name}: {len(ref_files) - n0} archivos", flush=True)

    dropped = 0
    for h, ids in list(inverted.items()):
        if len(ids) > MAX_DF:
            del inverted[h]
            dropped += 1
    print(f"\nindice: {len(ref_files)} archivos de referencia, "
          f"{len(inverted)} lineas discriminantes ({dropped} descartadas por boilerplate)\n",
          flush=True)

    rows = []
    for target in TARGETS:
        if not target.is_dir():
            continue
        for p in walk(target):
            fp = fingerprint(p)
            if len(fp) < MIN_UNIQ:
                continue
            hits: collections.Counter[int] = collections.Counter()
            for h in fp:
                for fid in inverted.get(h, ()):
                    hits[fid] += 1
            if not hits:
                continue

            # mejor archivo por repo
            per_repo: dict[str, tuple[float, str, int]] = {}
            for fid, ov in hits.items():
                repo, rel, _ = ref_files[fid]
                cont = ov / len(fp)
                if repo not in per_repo or cont > per_repo[repo][0]:
                    per_repo[repo] = (cont, rel, ov)

            # cobertura acumulada por repo (union de lineas cubiertas)
            best = sorted(per_repo.items(), key=lambda kv: -kv[1][0])
            top_repo, (top_cont, top_rel, top_ov) = best[0]

            blocking = [
                (r, v) for r, v in best
                if LICENSES.get(r, "SIN-LICENCIA") in BLOCKING and v[0] >= 0.30
            ]
            rows.append({
                "ruta": str(p.relative_to(LOOPER_ROOT)),
                "lineas_utiles": len(fp),
                "repo_top": top_repo,
                "licencia_top": LICENSES.get(top_repo, "?"),
                "archivo_top": top_rel,
                "contencion_top": round(top_cont * 100, 1),
                "lineas_coincidentes": top_ov,
                "repos_bloqueantes": ";".join(
                    f"{r}({LICENSES.get(r,'?')},{round(v[0]*100)}%)" for r, v in blocking
                ),
                "otros_repos": ";".join(
                    f"{r}({round(v[0]*100)}%)" for r, v in best[1:5] if v[0] >= 0.20
                ),
            })

    rows.sort(key=lambda r: (-r["contencion_top"], -r["lineas_utiles"]))
    csv_path = outdir / "corpus-inventory.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    summary: dict[str, dict] = {}
    for r in rows:
        repo = r["repo_top"]
        s = summary.setdefault(repo, {
            "licencia": r["licencia_top"], "archivos": 0, "lineas": 0,
            "archivos_90": 0, "archivos_75": 0, "archivos_50": 0,
        })
        s["archivos"] += 1
        s["lineas"] += r["lineas_coincidentes"]
        if r["contencion_top"] >= 90:
            s["archivos_90"] += 1
        if r["contencion_top"] >= 75:
            s["archivos_75"] += 1
        if r["contencion_top"] >= 50:
            s["archivos_50"] += 1
    (outdir / "corpus-summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"{'repo':<28} {'licencia':<14} {'arch':>5} {'>=90%':>6} {'>=75%':>6} {'>=50%':>6} {'lineas':>8}")
    for repo, s in sorted(summary.items(), key=lambda kv: -kv[1]["archivos_75"]):
        print(f"{repo:<28} {s['licencia']:<14} {s['archivos']:>5} "
              f"{s['archivos_90']:>6} {s['archivos_75']:>6} {s['archivos_50']:>6} {s['lineas']:>8}")
    print(f"\ncsv -> {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
