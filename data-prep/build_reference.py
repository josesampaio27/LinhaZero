"""Builds a validation case from a fire in PT-FireSprd (Benali et al., Zenodo 10.5281/zenodo.7495506).

For one fire it writes, into <out>/<fire>/:
  grid/          a grid around the fire (build_grid.py), with the FUMOD fuel map of the fire's year
  observed.f32   observed arrival per cell, in minutes after the ignition (Float32, row-major like the grid):
                 Infinity = did not burn; NaN = burned at an unknown time (left out of the scores)
  case.json      ignition polygon and time, the observation times, the L2 spread intervals (measured rate
                 and direction), and the hourly weather at the fire from four days before (Open-Meteo
                 historical archive: ERA5 as "weather", ERA5-Land as "weatherEra5Land")

PT-FireSprd L1 progressions: type "z" is the ignition zone, "p" with a date_hour is the area burned up to
that time since the previous one, "a" and "p" without a time ("na", "uncertain") burned at an unknown time.
Times are local (WEST, UTC+1, for every fire in the database: July to mid October).

Example:
  python build_reference.py --fire Baiao_04092019 --ptfs ~/PT-FireSprd_v0.08 --out ../engine/test/reference
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import Affine
from shapely.geometry import mapping

HERE = Path(__file__).resolve().parent
LOCAL_OFFSET = timedelta(hours=1)  # WEST
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
MARGIN_M = 3000


def read_progressions(ptfs: Path, fire: str) -> gpd.GeoDataFrame:
    paths = glob.glob(str(ptfs / "L1_FireProgressions" / "*" / fire / "*.shp"))
    if not paths:
        sys.exit(f"incêndio {fire} não encontrado em {ptfs}")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        g = gpd.read_file(paths[0], on_invalid="ignore")
    g = g[g.geometry.notna()].to_crs(3763)
    g["geometry"] = g.geometry.make_valid()
    return g


def local_time(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone(LOCAL_OFFSET)).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def fetch_weather(lat: float, lon: float, start: datetime, end: datetime, offline: bool, model: str | None = None) -> list[dict]:
    """Hourly weather from the Open-Meteo archive: ERA5 by default, or another archive model (era5_land)."""
    q = {
        "latitude": f"{lat:.4f}",
        "longitude": f"{lon:.4f}",
        "start_date": start.strftime("%Y-%m-%d"),
        "end_date": end.strftime("%Y-%m-%d"),
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation"
        + ("" if model == "era5_land" else ",wind_gusts_10m"),
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    if model:
        q["models"] = model
    url = f"{ARCHIVE}?{urllib.parse.urlencode(q)}"
    cache = HERE / "cache" / f"openmeteo_archive_{hashlib.sha1(url.encode()).hexdigest()[:12]}.json"
    if cache.exists():
        d = json.loads(cache.read_text(encoding="utf-8"))
    elif offline:
        sys.exit(f"sem rede (--offline) e sem cache do tempo em {cache.name}")
    else:
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=120) as r:
                    d = json.load(r)
                break
            except OSError:  # rate limit or a dropped connection: wait and retry
                if attempt == 3:
                    raise
                time.sleep(20 * (attempt + 1))
        cache.parent.mkdir(exist_ok=True)
        cache.write_text(json.dumps(d), encoding="utf-8")
    h = d["hourly"]
    cloud = h.get("cloud_cover") or [None] * len(h["time"])
    rain = h.get("precipitation") or [None] * len(h["time"])
    gust = h.get("wind_gusts_10m") or [None] * len(h["time"])
    return [
        {
            "timeUtc": h["time"][i] + ":00Z",
            "tempC": h["temperature_2m"][i],
            "rhPct": h["relative_humidity_2m"][i],
            "windSpeedMs": h["wind_speed_10m"][i],
            "windFromDeg": h["wind_direction_10m"][i],
            "cloudPct": cloud[i],
            "precipMm": rain[i],
            **({"gustMs": gust[i]} if gust[i] is not None else {}),
        }
        for i in range(len(h["time"]))
        # ERA5-Land in the Open-Meteo archive has temperature and humidity but no wind, cloud or rain;
        # the engine takes those from ERA5 (reference.ts, weatherSeries).
        if None not in (h["temperature_2m"][i], h["relative_humidity_2m"][i])
        and (model == "era5_land" or None not in (h["wind_speed_10m"][i], h["wind_direction_10m"][i]))
    ]


def read_intervals(ptfs: Path, fire: str, t0: datetime) -> list[dict]:
    """The fire's L2 spread intervals (PT-FireSprd FireBehavior): measured rate (m/h) and direction per interval."""
    path = ptfs / "L2_FireBehavior" / "PT-FireSprd_L2_FireBehavior.shp"
    if not path.exists():
        return []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        l2 = gpd.read_file(path, ignore_geometry=True, where=f"fname = '{fire}'")
    out = []
    for _, r in l2.iterrows():
        s, e = local_time(r["sdate"]), local_time(r["edate"])
        if r["type"] != "p" or s is None or e is None:
            continue
        num = lambda v: None if v is None or v < 0 else round(float(v), 2)  # noqa: E731 - -1 means missing
        out.append({
            "startMin": round((s - t0).total_seconds() / 60, 1),
            "endMin": round((e - t0).total_seconds() / 60, 1),
            "areaHa": num(r["area"]),
            "growthHaH": num(r["growth_rat"]),
            "rosMH": num(r["ros_i"]),
            "rosPerimeterMH": num(r["ros_p"]),
            "dirDeg": num(r["spdir_i"]),
            "dirPerimeterDeg": num(r["spdir_p"]),
            "qc": int(r["qc"]),
            "source": r["source"],
        })
    return sorted(out, key=lambda i: (i["startMin"], i["endMin"]))


def refresh_weather(case_dir: Path, offline: bool) -> int:
    """Rewrites the hourly weather of a built case (same span: four days before to the day after)."""
    path = case_dir / "case.json"
    case = json.loads(path.read_text(encoding="utf-8"))
    t0 = datetime.fromisoformat(case["t0Utc"].replace("Z", "+00:00"))
    end = t0 + timedelta(minutes=case["observationMinutes"][-1] if case["observationMinutes"] else 0)
    lat, lon = case["centroid"]
    span = (lat, lon, t0 - timedelta(days=4), end + timedelta(days=1), offline)
    case["weather"] = fetch_weather(*span)
    case["weatherEra5Land"] = fetch_weather(*span, model="era5_land")
    path.write_text(json.dumps(case, indent=1) + "\n", encoding="utf-8")
    print(f"{case['fire']}: {len(case['weather'])} horas de tempo, rajadas em {sum('gustMs' in w for w in case['weather'])}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fire", required=True, help="pasta do incêndio no PT-FireSprd, ex.: Baiao_04092019")
    ap.add_argument("--ptfs", required=True, help="pasta PT-FireSprd_v0.08 descompactada")
    ap.add_argument("--out", required=True, help="pasta dos casos de validação")
    ap.add_argument("--cell", type=float, default=100.0)
    ap.add_argument("--fuel-year", type=int, help="ano do mapa FUMOD (por omissão o do incêndio, a partir de 2018)")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="não mostrar o registo do build_grid")
    ap.add_argument("--weather-only", action="store_true", help="só refazer o tempo de um caso já construído")
    args = ap.parse_args()
    if args.weather_only:
        return refresh_weather(Path(args.out) / args.fire, args.offline)

    g = read_progressions(Path(args.ptfs).expanduser(), args.fire)
    g["t"] = g["date_hour"].map(local_time)
    timed = g[g["t"].notna() & g["type"].isin(["z", "p"])].sort_values("t")
    ignition = timed[timed["type"] == "z"]
    if ignition.empty:
        sys.exit("sem zona de ignição (tipo z) com hora")
    t0 = ignition["t"].min()
    fire_year = t0.year
    fuel_year = args.fuel_year or max(2018, min(2022, fire_year))

    # Grid: the fire's bounding box plus a margin, in WGS84 for build_grid.
    minx, miny, maxx, maxy = g.total_bounds
    box = gpd.GeoSeries.from_xy([minx - MARGIN_M, maxx + MARGIN_M], [miny - MARGIN_M, maxy + MARGIN_M], crs=3763).to_crs(4326)
    bbox = f"{box.x.min():.5f},{box.y.min():.5f},{box.x.max():.5f},{box.y.max():.5f}"
    case_dir = Path(args.out) / args.fire
    grid_dir = case_dir / "grid"
    cmd = [sys.executable, str(HERE / "build_grid.py"), "--bbox", bbox, "--cell", str(args.cell), "--out", str(grid_dir),
           "--fuel-year", str(fuel_year), "--no-index", "--skip", "buildings"] + (["--offline"] if args.offline else [])
    print(" ".join(cmd), flush=True)
    out = subprocess.DEVNULL if args.quiet else None
    if subprocess.run(cmd, stdout=out).returncode != 0:
        print("aviso: alguma camada falhou (ver acima)", file=sys.stderr)
    header = json.loads((grid_dir / "header.json").read_text(encoding="utf-8"))
    rows, cols, cell = header["rows"], header["cols"], header["cellSize"]
    transform = Affine(cell, 0, header["originX"], 0, -cell, header["originY"])

    # Observed arrival: the minute of the first timed polygon covering the cell centre; untimed burned = NaN.
    observed = np.full((rows, cols), np.inf, dtype=np.float32)
    untimed = g[~g.index.isin(timed.index)]
    if not untimed.empty:
        mask = rasterize(((mapping(geom), 1) for geom in untimed.geometry), out_shape=(rows, cols), transform=transform, dtype="uint8")
        observed[mask == 1] = np.nan
    times = []
    for _, row in timed.iloc[::-1].iterrows():  # latest first, so earlier times overwrite
        minute = (row["t"] - t0).total_seconds() / 60
        mask = rasterize([(mapping(row.geometry), 1)], out_shape=(rows, cols), transform=transform, dtype="uint8")
        observed[mask == 1] = minute
    for minute in sorted({(t - t0).total_seconds() / 60 for t in timed["t"]}):
        times.append(round(minute, 1))
    observed.astype("<f4").tofile(case_dir / "observed.f32")

    # Weather: hourly, from four days before the ignition (rain and drying for FFMC) to the day after the
    # last observation; ERA5 (31 km) and ERA5-Land (9 km; temperature and humidity only) from the same archive.
    centroid = gpd.GeoSeries([g.geometry.union_all().centroid], crs=3763).to_crs(4326)[0]
    end = timed["t"].max()
    span = (centroid.y, centroid.x, t0 - timedelta(days=4), end + timedelta(days=1), args.offline)
    weather = fetch_weather(*span)
    weather_land = fetch_weather(*span, model="era5_land")
    intervals = read_intervals(Path(args.ptfs).expanduser(), args.fire, t0)

    ign_geom = ignition.geometry.union_all()
    ign_poly = max(getattr(ign_geom, "geoms", [ign_geom]), key=lambda p: p.area)
    burned_ha = float(np.sum(np.isfinite(observed)) * cell * cell / 1e4)
    case = {
        "fire": args.fire,
        "source": "PT-FireSprd v0.08 (Benali et al., doi:10.5281/zenodo.7495506)",
        "weatherSource": "Open-Meteo historical archive (ERA5), hourly, at the fire centroid",
        "fuelYear": fuel_year,
        "fuelYearMatches": fuel_year == fire_year,
        "t0Utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ignitionArea": [[round(x, 1), round(y, 1)] for x, y in ign_poly.exterior.coords],
        "observationMinutes": [m for m in times if m > 0],
        "observedTimedHa": burned_ha,
        "centroid": [round(centroid.y, 5), round(centroid.x, 5)],
        "intervals": intervals,
        "weather": weather,
        "weatherEra5Land": weather_land,
    }
    (case_dir / "case.json").write_text(json.dumps(case, indent=1) + "\n", encoding="utf-8")
    print(f"{args.fire}: {rows}x{cols} células de {cell:g} m, {len(case['observationMinutes'])} observações com hora, "
          f"{burned_ha:.0f} ha com hora, combustível de {fuel_year}, {len(weather)} horas de tempo, {len(intervals)} intervalos L2")
    return 0


if __name__ == "__main__":
    sys.exit(main())
