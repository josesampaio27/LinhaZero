"""Builds every PT-FireSprd fire as a validation case (build_reference.py) and writes the manifest.

  python build_references.py --ptfs ~/PT-FireSprd_v0.08                 all fires into out/reference
  python build_references.py --ptfs ... --only Baiao_04092019 Alijo_24072019
  python build_references.py --ptfs ... --manifest-only                  rewrite the manifest from built cases
  python build_references.py --ptfs ... --cell 30 --out out/reference-30m --manifest out/reference-30m/manifest.json

Fires already built are skipped (--force rebuilds them). Every download is cached in cache/, so after a
first run the whole set rebuilds offline (--offline).

The manifest (by default engine/test/reference/manifest.json, committed; --manifest writes it elsewhere, e.g.
next to a 30 m set, so the committed 100 m manifest is not overwritten) lists per fire: year, region, fuel year,
tier and whether it can be fitted:
  tier A  2018-2021: FUMOD fuel map of the fire's own year; used to fit and to validate on held-out fires
  tier B  2015-2017: FUMOD 2018, so the scar shows the fuels after the fire; validation only, reported apart
  fit     tier A with at least 2 timed observations after the ignition (an interval to score)
Region is a latitude band (Norte >= 40.95 N, Sul < 39.5 N, Centro between), close to the NUTS II regions
for these fires but not exact.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "out" / "reference"
MANIFEST = HERE.parent / "engine" / "test" / "reference" / "manifest.json"


def fire_year(name: str) -> int:
    """Year from the folder name: Place_DDMMYYYY, sometimes with a suffix (Serta_15102017_2)."""
    for token in name.split("_")[1:]:
        if len(token) == 8 and token.isdigit():
            return int(token[4:])
    raise ValueError(f"sem data no nome {name}")


def list_fires(ptfs: Path) -> list[str]:
    return sorted(p.name for p in (ptfs / "L1_FireProgressions").glob("*/*") if p.is_dir())


def region(lat: float) -> str:
    return "Norte" if lat >= 40.95 else "Sul" if lat < 39.5 else "Centro"


def build_one(fire: str, ptfs: Path, out: Path, cell: float, offline: bool, force: bool) -> tuple[str, str]:
    if (out / fire / "case.json").exists() and not force:
        return fire, "já existe"
    cmd = [sys.executable, str(HERE / "build_reference.py"), "--fire", fire, "--ptfs", str(ptfs), "--out", str(out),
           "--cell", str(cell), "--quiet"] + (["--offline"] if offline else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    last = (r.stdout.strip().splitlines() or [""])[-1]
    if r.returncode != 0 or not (out / fire / "case.json").exists():
        return fire, f"FALHOU: {(r.stderr.strip().splitlines() or ['?'])[-1]}"
    return fire, last


def manifest_entry(case_dir: Path) -> dict:
    c = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
    header = json.loads((case_dir / "grid" / "header.json").read_text(encoding="utf-8"))
    year = fire_year(c["fire"])
    tier = "A" if year >= 2018 else "B"
    n_obs = len(c["observationMinutes"])
    return {
        "fire": c["fire"],
        "year": year,
        "region": region(c["centroid"][0]),
        "centroid": c["centroid"],
        "fuelYear": c["fuelYear"],
        "fuelYearMatches": c["fuelYearMatches"],
        "tier": tier,
        "fit": tier == "A" and n_obs >= 2,
        "observations": n_obs,
        "intervals": len(c.get("intervals", [])),
        "timedHa": round(c["observedTimedHa"]),
        "durationMin": c["observationMinutes"][-1] if n_obs else 0,
        "cells": header["rows"] * header["cols"],
        "cellSize": header["cellSize"],
    }


def write_manifest(out: Path, fires: list[str], manifest: Path = MANIFEST) -> list[dict]:
    entries = [manifest_entry(out / f) for f in fires if (out / f / "case.json").exists()]
    doc = {
        "source": "PT-FireSprd v0.08 (Benali et al., doi:10.5281/zenodo.7495506), CC BY 4.0",
        "builtWith": "data-prep/build_references.py",
        "cases": entries,
    }
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return entries


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ptfs", required=True, help="pasta PT-FireSprd_v0.08 descompactada")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--cell", type=float, default=100.0)
    ap.add_argument("--only", nargs="*", help="só estes incêndios")
    ap.add_argument("--jobs", type=int, default=2, help="incêndios em paralelo (o Overpass limita pedidos)")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--manifest-only", action="store_true")
    ap.add_argument("--manifest", default=str(MANIFEST), help="onde escrever o manifesto (por omissão o do git, a 100 m)")
    args = ap.parse_args()

    ptfs = Path(args.ptfs).expanduser().resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    fires = args.only or list_fires(ptfs)
    if not args.manifest_only:
        with ThreadPoolExecutor(args.jobs) as pool:
            jobs = [pool.submit(build_one, f, ptfs, out, args.cell, args.offline, args.force) for f in fires]
            for k, j in enumerate(jobs, 1):
                fire, msg = j.result()
                print(f"[{k}/{len(fires)}] {fire}: {msg}", flush=True)
    manifest = Path(args.manifest).resolve()
    entries = write_manifest(out, list_fires(ptfs), manifest)
    tiers = {t: sum(e["tier"] == t for e in entries) for t in "AB"}
    print(f"\n{len(entries)} casos: tier A {tiers['A']}, tier B {tiers['B']}, {sum(e['fit'] for e in entries)} para ajuste."
          f" Manifesto em {manifest}")
    missing = [f for f in list_fires(ptfs) if not (out / f / "case.json").exists()]
    if missing:
        print("Por construir: " + ", ".join(missing))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
