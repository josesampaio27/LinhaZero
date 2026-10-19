"""Turns a PT-FireSprd validation case into a replay the app can open: the fire's grid, the observed
perimeters hour by hour, and a scenario that starts from the observed ignition with the real weather.

  python export_replay.py --fire Alijo_24072019 --ptfs ~/PT-FireSprd_v0.08 --label "Alijó, 24 jul 2019"

Reads the case from out/reference/<fire>/ (build_references.py) and writes:
  ../web/public/grids/replay-<fire>/          the grid, with header.observed pointing at the perimeters
  ../web/public/grids/replay-<fire>/observed.geojson
                                              burned area observed by each time, WGS84, property "minute"
  ../web/public/scenarios/replay-<fire>.json  the scenario (engine/scripts/export-replay.ts)
and adds the grid and the scenario to their index.json.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from shapely.geometry import mapping
from shapely.ops import unary_union

from build_reference import local_time, read_progressions

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WEB = ROOT / "web" / "public"


def upsert(index_path: Path, name: str, label: str) -> None:
    entries = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    entries = [e for e in entries if e["name"] != name] + [{"name": name, "label": label}]
    index_path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fire", required=True)
    ap.add_argument("--ptfs", required=True)
    ap.add_argument("--label", required=True, help="nome mostrado na interface, ex.: \"Alijó, 24 jul 2019\"")
    ap.add_argument("--cases", default=str(HERE / "out" / "reference"))
    args = ap.parse_args()

    case_dir = Path(args.cases) / args.fire
    case = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
    name = "replay-" + args.fire.lower().replace("_", "-")
    grid_dir = WEB / "grids" / name
    if grid_dir.exists():
        shutil.rmtree(grid_dir)
    shutil.copytree(case_dir / "grid", grid_dir)

    # Observed perimeters: the area burned by each observation time (cumulative), simplified to 15 m.
    g = read_progressions(Path(args.ptfs).expanduser(), args.fire)
    g["t"] = g["date_hour"].map(local_time)
    timed = g[g["t"].notna() & g["type"].isin(["z", "p"])].sort_values("t")
    t0 = timed["t"].min()
    features = []
    for t in sorted(timed["t"].unique()):
        minute = round((t - t0).total_seconds() / 60, 1)
        area = unary_union(list(timed[timed["t"] <= t].geometry)).buffer(0).simplify(15)
        wgs = __import__("geopandas").GeoSeries([area], crs=3763).to_crs(4326)[0]
        local = t.tz_convert("Europe/Lisbon") if hasattr(t, "tz_convert") else t
        features.append({
            "type": "Feature",
            "properties": {"minute": minute, "label": local.strftime("%d/%m %H:%M")},
            "geometry": mapping(wgs),
        })
    (grid_dir / "observed.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")

    header_path = grid_dir / "header.json"
    header = json.loads(header_path.read_text(encoding="utf-8"))
    header["name"] = name
    header["observed"] = {
        "file": "observed.geojson",
        "fire": args.label,
        "t0Utc": case["t0Utc"],
        "source": "PT-FireSprd v0.08 (Benali et al., doi:10.5281/zenodo.7495506), CC BY 4.0",
    }
    header_path.write_text(json.dumps(header, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    upsert(WEB / "grids" / "index.json", name, f"Incêndio real: {args.label}")

    # The scenario needs the engine's moisture model, so it is written by a TypeScript script.
    cmd = ["npx", "tsx", str(ROOT / "engine" / "scripts" / "export-replay.ts"), str(case_dir), name, args.label,
           str(WEB / "scenarios" / f"{name}.json")]
    if subprocess.run(cmd, cwd=ROOT).returncode != 0:
        return 1
    upsert(WEB / "scenarios" / "index.json", name, f"Incêndio real: {args.label} (simulado contra observado)")
    print(f"{name}: {len(features)} perímetros observados; grelha e cenário em {WEB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
