"""Builds a LinhaZero grid (header.json + layer binaries) from real data.

Layers:
  fuel       FUMOD fuel models map (github.com/anasa30/PT_FuelModels), nearest neighbour
  elevation  Copernicus DEM GLO-30 (public AWS bucket copernicus-dem-30m), mean
  barrier    OSM main roads, rivers and water bodies (Overpass API)
  buildings  OSM building count per cell
  village    OSM place=village|hamlet|town nearest to each built cell, within 1 km
  canopy     Copernicus Tree Cover Density 2018 (EEA image service), mean % per cell (optional layer)

Every download is cached in data-prep/cache/, so a second run works without network.
If a layer fails, the script says which and why, and writes the grid with the other layers.

Example:
  python build_grid.py --bbox -8.38,41.38,-8.20,41.52 --cell 100 --out ../web/public/grids/guimaraes
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.merge import merge
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from shapely.geometry import LineString, Point, Polygon, mapping

from canopy import build_canopy
from fuel_params import add_to_fuel_table, load_fuel_params

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
CRS = "EPSG:3763"

FUMOD_URL = "https://raw.githubusercontent.com/anasa30/PT_FuelModels/main/FuelModelsMap/{year}/FFM_{year}.tif"
COPDEM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "linha-zero-data-prep/0.1 (Hack4Guimaraes 2035)"

BARRIER_HIGHWAYS = "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary"
# Barrier layer: 1 = water body the fire does not cross (lakes, reservoirs, wide rivers mapped as areas);
# 2-255 = a road or river line the Rothermel model lets intense fires breach, coded as its width in metres
# (OSM width tag, else these defaults). Real fires cross motorways and rivers: PT-FireSprd's Alijó 2019 fire
# crossed the A4 motorway and the Tinhela river. PROVISÓRIO.
LINE_WIDTH_M = {
    "motorway": 30, "motorway_link": 10, "trunk": 20, "trunk_link": 8,
    "primary": 10, "primary_link": 8, "secondary": 7,
    "river": 15, "canal": 6,
}
BARRIER_WATERWAYS = "river|canal"
VILLAGE_PLACES = "village|hamlet|town"
VILLAGE_RADIUS_M = 1000.0


class LayerError(Exception):
    """A layer could not be built; the message says why."""


@dataclass
class GridSpec:
    origin_x: float
    origin_y: float
    cell: float
    rows: int
    cols: int
    bbox: tuple[float, float, float, float]  # lon/lat

    @property
    def transform(self) -> Affine:
        return Affine(self.cell, 0, self.origin_x, 0, -self.cell, self.origin_y)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return (
            self.origin_x,
            self.origin_y - self.rows * self.cell,
            self.origin_x + self.cols * self.cell,
            self.origin_y,
        )


# ---------------------------------------------------------------- utilities


def log(msg: str) -> None:
    print(msg, flush=True)


def grid_spec(bbox: tuple[float, float, float, float], cell: float) -> GridSpec:
    """Snaps the lon/lat bbox, projected to EPSG:3763, to a whole number of cells."""
    min_lon, min_lat, max_lon, max_lat = bbox
    to_tm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    xs, ys = to_tm.transform(
        [min_lon, max_lon, max_lon, min_lon], [min_lat, min_lat, max_lat, max_lat]
    )
    x0 = math.floor(min(xs) / cell) * cell
    x1 = math.ceil(max(xs) / cell) * cell
    y0 = math.floor(min(ys) / cell) * cell
    y1 = math.ceil(max(ys) / cell) * cell
    return GridSpec(x0, y1, cell, int(round((y1 - y0) / cell)), int(round((x1 - x0) / cell)), bbox)


def download(url: str, dest: Path, offline: bool) -> Path:
    """Downloads url to dest unless it is already cached."""
    if dest.exists() and dest.stat().st_size > 0:
        log(f"  cache: {dest.relative_to(HERE)}")
        return dest
    if offline:
        raise LayerError(f"sem rede (--offline) e sem cache em {dest.relative_to(HERE)}")
    import requests

    log(f"  a descarregar {url}")
    try:
        with requests.get(url, stream=True, timeout=120, headers={"User-Agent": USER_AGENT}) as r:
            r.raise_for_status()
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
            tmp.rename(dest)
    except Exception as e:  # noqa: BLE001 - report any network failure as a layer failure
        raise LayerError(f"falhou o download de {url}: {e}") from e
    return dest


# ---------------------------------------------------------------- fuel


def build_fuel(spec: GridSpec, year: int, offline: bool) -> tuple[np.ndarray, dict]:
    src_path = download(FUMOD_URL.format(year=year), CACHE / f"FFM_{year}.tif", offline)
    out = np.zeros((spec.rows, spec.cols), dtype=np.float32)
    with rasterio.open(src_path) as src:
        nodata = src.nodata
        reproject(
            source=rasterio.band(src, 1),
            destination=out,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=nodata,
            dst_transform=spec.transform,
            dst_crs=CRS,
            dst_nodata=0,
            resampling=Resampling.nearest,
        )
    codes = np.where((out > 0) & (out <= 255), out, 0).astype(np.uint8)
    table = fuel_table(np.unique(codes))
    return codes, table


def fuel_table(codes: np.ndarray) -> dict:
    """fuelTable for the codes present: base rates from fuel_rates.csv, Rothermel parameters from fuel_params.csv."""
    rates: dict[int, dict] = {}
    with open(HERE / "fuel_rates.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rates[int(row["code"])] = {"label": row["label"], "baseRate": float(row["baseRate"])}
    table = {0: rates.get(0, {"label": "Sem dados", "baseRate": 0.0})}
    for c in codes.tolist():
        if c in rates:
            table[c] = rates[c]
        else:
            log(f"  aviso: código de combustível {c} não está em fuel_rates.csv; fica não combustível")
            table[c] = {"label": f"Modelo {c} (sem velocidade definida)", "baseRate": 0.0}
    missing = add_to_fuel_table(table, load_fuel_params())
    if missing:
        log(f"  aviso: códigos {missing} sem parâmetros de Rothermel em fuel_params.csv")
    return table


# ---------------------------------------------------------------- elevation


def copdem_tiles(bbox: tuple[float, float, float, float]) -> list[str]:
    min_lon, min_lat, max_lon, max_lat = bbox
    names = []
    for lat in range(math.floor(min_lat), math.floor(max_lat) + 1):
        for lon in range(math.floor(min_lon), math.floor(max_lon) + 1):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
            names.append(f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM")
    return names


def build_elevation(spec: GridSpec, offline: bool) -> np.ndarray:
    min_lon, min_lat, max_lon, max_lat = spec.bbox
    pad = 0.02
    key = hashlib.sha1(f"{spec.bbox}".encode()).hexdigest()[:10]
    crop_path = CACHE / f"copdem_{key}.tif"
    if not crop_path.exists():
        if offline:
            raise LayerError(f"sem rede (--offline) e sem cache em {crop_path.relative_to(HERE)}")
        urls = [COPDEM_URL.format(name=n) for n in copdem_tiles(spec.bbox)]
        log(f"  a ler {len(urls)} mosaico(s) Copernicus DEM (só a janela necessária)")
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
                srcs = [rasterio.open(f"/vsicurl/{u}") for u in urls]
                data, transform = merge(
                    srcs, bounds=(min_lon - pad, min_lat - pad, max_lon + pad, max_lat + pad)
                )
                profile = srcs[0].profile | {
                    "driver": "GTiff",
                    "height": data.shape[1],
                    "width": data.shape[2],
                    "transform": transform,
                    "count": 1,
                    "compress": "deflate",
                    "tiled": False,
                }
                profile.pop("blockxsize", None)
                profile.pop("blockysize", None)
                for s in srcs:
                    s.close()
            with rasterio.open(crop_path, "w", **profile) as dst:
                dst.write(data[0], 1)
        except LayerError:
            raise
        except Exception as e:  # noqa: BLE001
            raise LayerError(f"falhou a leitura do Copernicus DEM: {e}") from e
    else:
        log(f"  cache: {crop_path.relative_to(HERE)}")

    out = np.zeros((spec.rows, spec.cols), dtype=np.float32)
    with rasterio.open(crop_path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=out,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=src.nodata,
            dst_transform=spec.transform,
            dst_crs=CRS,
            dst_nodata=np.nan,
            resampling=Resampling.average,
        )
    if np.isnan(out).any():
        fill = float(np.nanmean(out)) if not np.isnan(out).all() else 0.0
        out = np.where(np.isnan(out), fill, out)
    return out.astype(np.float32)


# ---------------------------------------------------------------- OSM


def overpass(query: str, name: str, offline: bool) -> dict:
    """Runs an Overpass query, caching the JSON answer by query hash."""
    key = hashlib.sha1(query.encode()).hexdigest()[:12]
    path = CACHE / f"osm_{name}_{key}.json"
    if path.exists():
        log(f"  cache: {path.relative_to(HERE)}")
        return json.loads(path.read_text(encoding="utf-8"))
    if offline:
        raise LayerError(f"sem rede (--offline) e sem cache em {path.relative_to(HERE)}")
    import requests

    errors = []
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                log(f"  Overpass ({name}) em {url}")
                try:
                    r = requests.post(
                        url, data={"data": query}, timeout=300, headers={"User-Agent": USER_AGENT}
                    )
                except requests.exceptions.SSLError:
                    # Old Python builds (LibreSSL) fail the TLS handshake; the system curl does not.
                    log("  TLS do Python falhou; a tentar com curl")
                    data = overpass_curl(url, query)
                else:
                    if r.status_code in (429, 504):
                        raise RuntimeError(f"HTTP {r.status_code} (servidor ocupado)")
                    r.raise_for_status()
                    data = r.json()
                path.write_text(json.dumps(data), encoding="utf-8")
                return data
            except Exception as e:  # noqa: BLE001
                errors.append(f"{url}: {e}")
                time.sleep(5 * (attempt + 1))
    raise LayerError("Overpass falhou: " + " | ".join(errors))


def overpass_curl(url: str, query: str) -> dict:
    """POSTs an Overpass query with the system curl and returns the decoded JSON."""
    import subprocess

    res = subprocess.run(
        ["curl", "-sS", "--fail", "--max-time", "300", "-A", USER_AGENT, "--data-urlencode", "data@-", url],
        input=query.encode(),
        capture_output=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f"curl: {res.stderr.decode(errors='ignore').strip()}")
    return json.loads(res.stdout)


def osm_bbox(spec: GridSpec) -> str:
    min_lon, min_lat, max_lon, max_lat = spec.bbox
    return f"{min_lat},{min_lon},{max_lat},{max_lon}"


def to_grid_crs():
    t = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    return lambda lon, lat: t.transform(lon, lat)


def build_barrier(spec: GridSpec, offline: bool) -> np.ndarray:
    q = f"""[out:json][timeout:240];
(
  way["highway"~"^({BARRIER_HIGHWAYS})$"]({osm_bbox(spec)});
  way["waterway"~"^({BARRIER_WATERWAYS})$"]({osm_bbox(spec)});
  way["natural"="water"]({osm_bbox(spec)});
);
out geom;"""
    data = overpass(q, "barriers", offline)
    proj = to_grid_crs()
    lines, roads, areas = [], [], []
    for el in data.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 2:
            continue
        pts = [proj(p["lon"], p["lat"]) for p in geom]
        tags = el.get("tags", {})
        if tags.get("natural") == "water" and len(pts) >= 4 and pts[0] == pts[-1]:
            areas.append(Polygon(pts))
        elif (tags.get("highway") or tags.get("waterway")) in LINE_WIDTH_M:
            roads.append((LineString(pts), line_width(tags)))
        else:
            lines.append(LineString(pts))
    log(f"  {len(roads)} estradas e rios transponíveis, {len(lines)} outras linhas, {len(areas)} superfícies de água")
    shape = (spec.rows, spec.cols)
    barrier = np.zeros(shape, dtype=np.uint8)
    # all_touched gives a 4-connected trace, so the fire cannot cross diagonally.
    if roads:
        # Narrowest first, so where roads meet the cell keeps the widest.
        barrier = rasterize(
            ((mapping(g), w) for g, w in sorted(roads, key=lambda r: r[1])), out_shape=shape,
            transform=spec.transform, all_touched=True, dtype="uint8",
        )
    hard = np.zeros(shape, dtype=np.uint8)
    if lines:
        hard |= rasterize(
            ((mapping(g), 1) for g in lines), out_shape=shape, transform=spec.transform,
            all_touched=True, dtype="uint8",
        )
    if areas:
        hard |= rasterize(
            ((mapping(g), 1) for g in areas if g.is_valid), out_shape=shape,
            transform=spec.transform, all_touched=False, dtype="uint8",
        )
    barrier[hard == 1] = 1
    return barrier


def line_width(tags: dict) -> int:
    """Width in metres of a road or river for the barrier layer: OSM width when it is a number, else the class default; 2-255."""
    try:
        w = float(str(tags.get("width", "")).replace(",", ".").replace("m", "").strip())
    except ValueError:
        w = LINE_WIDTH_M[tags.get("highway") or tags.get("waterway")]
    return int(min(255, max(2, round(w))))


def build_buildings_and_villages(spec: GridSpec, offline: bool) -> tuple[np.ndarray, np.ndarray, list]:
    q_b = f"""[out:json][timeout:240];
(way["building"]({osm_bbox(spec)}); node["building"]({osm_bbox(spec)}););
out center;"""
    q_p = f"""[out:json][timeout:120];
node["place"~"^({VILLAGE_PLACES})$"]({osm_bbox(spec)});
out;"""
    proj = to_grid_crs()
    inv = ~spec.transform
    buildings = np.zeros((spec.rows, spec.cols), dtype=np.uint32)
    for el in overpass(q_b, "buildings", offline).get("elements", []):
        c = el.get("center") or ({"lon": el["lon"], "lat": el["lat"]} if "lon" in el else None)
        if not c:
            continue
        col, row = inv * proj(c["lon"], c["lat"])
        r, k = int(math.floor(row)), int(math.floor(col))
        if 0 <= r < spec.rows and 0 <= k < spec.cols:
            buildings[r, k] += 1
    log(f"  {int(buildings.sum())} edifícios em {int((buildings > 0).sum())} células")
    buildings = np.minimum(buildings, 65535).astype(np.uint16)

    village = np.zeros((spec.rows, spec.cols), dtype=np.uint16)
    try:
        places = overpass(q_p, "places", offline).get("elements", [])
    except LayerError as e:
        log(f"  AVISO camada village: {e}")
        return buildings, village, []
    if not places:
        return buildings, village, []
    pxy = np.array([proj(p["lon"], p["lat"]) for p in places])
    names = [p.get("tags", {}).get("name", f"Lugar {i + 1}") for i, p in enumerate(places)]
    rows, cols = np.nonzero(buildings)
    cx = spec.origin_x + (cols + 0.5) * spec.cell
    cy = spec.origin_y - (rows + 0.5) * spec.cell
    d2 = (cx[:, None] - pxy[None, :, 0]) ** 2 + (cy[:, None] - pxy[None, :, 1]) ** 2
    nearest = d2.argmin(axis=1)
    ok = d2[np.arange(len(nearest)), nearest] <= VILLAGE_RADIUS_M**2
    used = sorted(set(nearest[ok].tolist()), key=lambda i: names[i])
    ids = {p: i + 1 for i, p in enumerate(used)}
    for r, k, p, good in zip(rows, cols, nearest, ok):
        if good:
            village[r, k] = ids[int(p)]
    villages = [{"id": ids[p], "name": names[p]} for p in used]
    log(f"  {len(villages)} aldeias/lugares com edifícios atribuídos")
    return buildings, village, villages


# ---------------------------------------------------------------- output


def upsert_index(grids_dir: Path, name: str, label: str) -> None:
    path = grids_dir / "index.json"
    items = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    items = [e for e in items if e["name"] != name] + [{"name": name, "label": label}]
    path.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat (WGS84)")
    ap.add_argument("--cell", type=float, default=100.0, help="tamanho da célula em metros")
    ap.add_argument("--out", required=True, help="pasta de saída, ex.: ../web/public/grids/guimaraes")
    ap.add_argument("--label", help="nome mostrado na interface")
    ap.add_argument("--fuel-year", type=int, default=2022, help="ano do mapa FUMOD")
    ap.add_argument("--offline", action="store_true", help="usar só a cache, sem rede")
    ap.add_argument("--no-index", action="store_true", help="não acrescentar a grelha ao index.json (grelhas de validação)")
    ap.add_argument("--skip", action="append", default=[], choices=["buildings", "canopy"],
                    help="não construir esta camada (fica vazia); ex.: casos de validação sem edifícios")
    argv = list(sys.argv[1:] if argv is None else argv)
    # "--bbox -8.38,..." starts with "-", which argparse would take for an option.
    if "--bbox" in argv and argv.index("--bbox") + 1 < len(argv):
        i = argv.index("--bbox")
        argv[i : i + 2] = [f"--bbox={argv[i + 1]}"]
    args = ap.parse_args(argv)

    bbox = tuple(float(v) for v in args.bbox.split(","))
    if len(bbox) != 4:
        ap.error("--bbox precisa de 4 valores")
    out = Path(args.out).resolve()
    name = out.name
    CACHE.mkdir(exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)

    spec = grid_spec(bbox, args.cell)
    log(f"Grelha {name}: {spec.rows}x{spec.cols} células de {spec.cell:g} m, origem ({spec.origin_x:.0f}, {spec.origin_y:.0f})")
    shape = (spec.rows, spec.cols)
    layers: dict[str, np.ndarray] = {}
    failed: dict[str, str] = {}
    fuel_tab: dict = {0: {"label": "Sem dados", "baseRate": 0.0}}
    villages: list = []

    def attempt(label: str, fn):
        log(f"[{label}]")
        try:
            return fn()
        except LayerError as e:
            failed[label] = str(e)
            log(f"  FALHOU {label}: {e}")
        except Exception as e:  # noqa: BLE001 - unexpected errors still must not stop the other layers
            failed[label] = f"{type(e).__name__}: {e}"
            log(f"  FALHOU {label}: {type(e).__name__}: {e}")
        return None

    res = attempt("fuel", lambda: build_fuel(spec, args.fuel_year, args.offline))
    if res is not None:
        layers["fuel"], fuel_tab = res
    res = attempt("elevation", lambda: build_elevation(spec, args.offline))
    if res is not None:
        layers["elevation"] = res
    res = attempt("barrier", lambda: build_barrier(spec, args.offline))
    if res is not None:
        layers["barrier"] = res
    res = None if "buildings" in args.skip else attempt("buildings", lambda: build_buildings_and_villages(spec, args.offline))
    if res is not None:
        layers["buildings"], layers["village"], villages = res
    res = None if "canopy" in args.skip else attempt(
        "canopy",
        lambda: build_canopy(spec.origin_x, spec.origin_y, spec.cell, spec.rows, spec.cols, args.offline),
    )
    if res is not None:
        layers["canopy"] = res

    defaults = {
        "fuel": np.zeros(shape, np.uint8),
        "elevation": np.zeros(shape, np.float32),
        "barrier": np.zeros(shape, np.uint8),
        "buildings": np.zeros(shape, np.uint16),
        "village": np.zeros(shape, np.uint16),
    }
    files = {"fuel": "fuel.u8", "elevation": "elevation.f32", "barrier": "barrier.u8",
             "buildings": "buildings.u16", "village": "village.u16"}
    dtypes = {"fuel": "<u1", "elevation": "<f4", "barrier": "<u1", "buildings": "<u2", "village": "<u2"}
    for key, fname in files.items():
        arr = layers.get(key, defaults[key])
        assert arr.shape == shape, (key, arr.shape)
        np.ascontiguousarray(arr, dtype=dtypes[key]).tofile(out / fname)
    # Optional layer: written only when it was built (without it the engine uses each fuel's own factor).
    if "canopy" in layers:
        assert layers["canopy"].shape == shape
        np.ascontiguousarray(layers["canopy"], dtype="<u1").tofile(out / "canopy.u8")
        files["canopy"] = "canopy.u8"
    elif (out / "canopy.u8").exists():
        (out / "canopy.u8").unlink()

    header = {
        "name": name,
        "crs": CRS,
        "originX": spec.origin_x,
        "originY": spec.origin_y,
        "cellSize": spec.cell,
        "rows": spec.rows,
        "cols": spec.cols,
        "layers": files,
        "villages": villages,
        "fuelTable": {str(k): v for k, v in sorted(fuel_tab.items())},
    }
    (out / "header.json").write_text(json.dumps(header, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not args.no_index:
        upsert_index(out.parent, name, args.label or name)

    log(f"\nGrelha escrita em {out}")
    if failed:
        log("Camadas que falharam (ficaram com valores por omissão):")
        for k, v in failed.items():
            log(f"  - {k}: {v}")
        return 1
    log("Todas as camadas OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
