"""Rothermel parameters of the FUMOD fuel models, read from fuel_params.csv, in the engine's SI format.

The CSV keeps the units of the source tables (t/ha, 1/m, kJ/kg, %); this module converts them to the
`rothermel` object of a fuelTable entry (engine/src/rothermel.ts, FuelParams). No third-party imports,
so it also runs without the grid-building dependencies:

  python fuel_params.py ../web/public/grids/guimaraes/header.json   # adds the parameters in place
  python fuel_params.py --json ../engine/test/fixtures/fuel-params.json  # copy for the engine tests
"""

from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# BehavePlus fixes the 10 h and 100 h surface-area-to-volume ratios of custom fuel models (109 and 30 1/ft).
SAV_10H = 109 / 0.3048
SAV_100H = 30 / 0.3048

# Fuels under a tree canopy (F and M groups) are sheltered from the wind. With a canopy layer (canopy.py)
# the engine uses each cell's tree cover; without it, this typical stand (close to the 52% mean cover of
# M-EUC cells in Guimarães) gives the fallback factor.
ASSUMED_CANOPY_COVER = 0.5
ASSUMED_CANOPY_HEIGHT_M = 12.0


def sheltered_waf(canopy_cover: float, canopy_height_m: float) -> float:
    """Wind adjustment factor under a canopy (Albini and Baughman 1979, as in BehavePlus)."""
    h = canopy_height_m / 0.3048
    crown_fill = canopy_cover / 3
    return 0.555 / (math.sqrt(crown_fill * h) * math.log((20 + 0.36 * h) / (0.13 * h)))


def _num(v: str) -> float:
    return float(v) if v.strip() else 0.0


def load_fuel_params(path: Path = HERE / "fuel_params.csv") -> dict[int, dict]:
    """FUMOD code -> FuelParams (SI) for the engine."""
    out: dict[int, dict] = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            t_ha = 0.1  # t/ha -> kg/m²
            herb_sav = _num(row["svr_live_herb_m"])
            woody_sav = _num(row["svr_live_woody_m"])
            params = {
                "depthM": _num(row["depth_m"]),
                "deadMoistExt": _num(row["mx_dead_pct"]) / 100,
                "heatKjKg": _num(row["heat_kjkg"]),
                "load": [
                    round(_num(row["load_1h_tha"]) * t_ha, 6),
                    round(_num(row["load_10h_tha"]) * t_ha, 6),
                    round(_num(row["load_100h_tha"]) * t_ha, 6),
                    round(_num(row["load_live_herb_tha"]) * t_ha, 6),
                    round(_num(row["load_live_woody_tha"]) * t_ha, 6),
                ],
                "sav": [_num(row["svr_1h_m"]), round(SAV_10H, 2), round(SAV_100H, 2), herb_sav, woody_sav],
            }
            if row["dynamic"].strip() == "1":
                params["dynamic"] = True
            # Calibration group: F litter, M understory, V shrub, H grass (dynamic herb models).
            params["group"] = row["group"].strip()
            # Canopy fuel for crown fire (forest models only; assumed typical stands, see the README).
            if row.get("cbh_m", "").strip():
                params["crown"] = {
                    "cbhM": _num(row["cbh_m"]),
                    "cbdKgM3": _num(row["cbd_kgm3"]),
                    "cflKgM2": _num(row["cfl_kgm2"]),
                }
            if row["waf"].strip() == "abrigado":
                # Sheltered by the cell's tree cover (canopy layer); this value is the fallback for grids
                # without the layer or cells without data.
                params["underCanopy"] = True
                params["waf"] = round(sheltered_waf(ASSUMED_CANOPY_COVER, ASSUMED_CANOPY_HEIGHT_M), 3)
            elif row["waf"].strip():
                params["waf"] = float(row["waf"])
            out[int(row["code"])] = params
    return out


def add_to_fuel_table(table: dict, params: dict[int, dict]) -> list[int]:
    """Adds `rothermel` to every burnable entry of a fuelTable; returns the burnable codes left without it."""
    missing = []
    for key, entry in table.items():
        code = int(key)
        if code in params:
            entry["rothermel"] = params[code]
        elif entry.get("baseRate", 0) > 0:
            missing.append(code)
    return missing


def main(header_path: str) -> int:
    path = Path(header_path)
    header = json.loads(path.read_text(encoding="utf-8"))
    missing = add_to_fuel_table(header["fuelTable"], load_fuel_params())
    path.write_text(json.dumps(header, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if missing:
        print(f"aviso: sem parâmetros de Rothermel para os códigos {missing}", file=sys.stderr)
        return 1
    print(f"{path}: parâmetros de Rothermel acrescentados")
    return 0


def write_json(path: str) -> None:
    """Writes every model's parameters (with its name) as JSON; the engine tests read this copy."""
    with open(HERE / "fuel_params.csv", newline="", encoding="utf-8") as f:
        names = {int(r["code"]): r["model"] for r in csv.DictReader(f)}
    data = {str(k): {"name": names[k], "rothermel": v} for k, v in sorted(load_fuel_params().items())}
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if sys.argv[1] == "--json":
        write_json(sys.argv[2])
    else:
        sys.exit(main(sys.argv[1]))
