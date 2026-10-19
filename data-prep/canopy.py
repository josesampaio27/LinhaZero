"""Tree canopy cover per grid cell, from the Copernicus High Resolution Layer Tree Cover Density 2018.

The 10 m product is read from the EEA's public image service (no account needed) in EPSG:3763 and
averaged per cell. Values: 0–100 = % cover; 255 = no data (less than half the cell had valid pixels).
The engine uses it for the wind adjustment factor under the canopy (engine/src/rothermel.ts).

To add the layer to an existing grid without rebuilding it:

  python canopy.py ../web/public/grids/guimaraes
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
TCD_URL = (
    "https://image.discomap.eea.europa.eu/arcgis/rest/services/GioLandPublic/"
    "HRL_TreeCoverDensity_2018/ImageServer/exportImage"
)
TCD_RES = 10.0  # m
MAX_SIDE = 4000  # the service refuses images over 15000 x 4100 px
NO_DATA = 255
USER_AGENT = "linha-zero-data-prep/1.0"


class CanopyError(RuntimeError):
    pass


def _fetch_strip(x0: float, y0: float, x1: float, y1: float, width: int, height: int, dest: Path, offline: bool) -> np.ndarray:
    if not dest.exists():
        if offline:
            raise CanopyError(f"sem rede (--offline) e sem cache em {dest.name}")
        import requests

        params = {
            "bbox": f"{x0},{y0},{x1},{y1}",
            "bboxSR": 3763,
            "imageSR": 3763,
            "size": f"{width},{height}",
            "format": "tiff",
            "pixelType": "U8",
            "interpolation": "RSP_NearestNeighbor",
            "f": "image",
        }
        try:
            r = requests.get(TCD_URL, params=params, timeout=180, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
        except Exception as e:  # noqa: BLE001 - any network failure is a layer failure
            raise CanopyError(f"falhou o pedido ao serviço de Tree Cover Density: {e}") from e
        if not r.content.startswith((b"II*\x00", b"MM\x00*")):
            raise CanopyError(f"o serviço não devolveu um GeoTIFF: {r.content[:200]!r}")
        dest.write_bytes(r.content)
    with rasterio.open(dest) as src:
        data = src.read(1)
    if data.shape != (height, width):
        raise CanopyError(f"imagem com {data.shape}, esperada {(height, width)}")
    return data


def build_canopy(origin_x: float, origin_y: float, cell: float, rows: int, cols: int, offline: bool = False) -> np.ndarray:
    """Mean tree cover (%) per cell, uint8, NO_DATA where under half of the cell has valid pixels."""
    k = int(round(cell / TCD_RES))
    if k < 1 or abs(k * TCD_RES - cell) > 1e-6:
        raise CanopyError(f"o tamanho da célula ({cell} m) tem de ser múltiplo de {TCD_RES:g} m")
    CACHE.mkdir(exist_ok=True)
    width = cols * k
    out = np.full((rows, cols), NO_DATA, dtype=np.uint8)
    rows_per_strip = max(1, MAX_SIDE // k)
    if width > 15000:
        raise CanopyError("grelha demasiado larga para um só pedido; divida-a em faixas de colunas")
    for r0 in range(0, rows, rows_per_strip):
        nr = min(rows_per_strip, rows - r0)
        y1 = origin_y - r0 * cell
        y0 = y1 - nr * cell
        x0, x1 = origin_x, origin_x + cols * cell
        key = hashlib.sha1(f"{x0},{y0},{x1},{y1},{k}".encode()).hexdigest()[:12]
        px = _fetch_strip(x0, y0, x1, y1, width, nr * k, CACHE / f"tcd2018_{key}.tif", offline)
        blocks = px.reshape(nr, k, cols, k).swapaxes(1, 2).reshape(nr, cols, k * k).astype(np.float32)
        valid = blocks <= 100
        count = valid.sum(axis=2)
        mean = np.where(valid, blocks, 0).sum(axis=2) / np.maximum(count, 1)
        strip = np.where(count >= (k * k) / 2, np.rint(mean), NO_DATA).astype(np.uint8)
        out[r0 : r0 + nr] = strip
    return out


def add_to_grid(grid_dir: str, offline: bool = False) -> None:
    """Writes canopy.u8 into an existing grid folder and lists it in header.json."""
    folder = Path(grid_dir)
    header_path = folder / "header.json"
    header = json.loads(header_path.read_text(encoding="utf-8"))
    cover = build_canopy(header["originX"], header["originY"], header["cellSize"], header["rows"], header["cols"], offline)
    cover.astype("<u1").tofile(folder / "canopy.u8")
    header["layers"]["canopy"] = "canopy.u8"
    header_path.write_text(json.dumps(header, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    known = cover[cover != NO_DATA]
    print(
        f"{folder.name}: canopy.u8 escrito; {known.size} de {cover.size} células com dados, "
        f"coberto médio {known.mean():.0f}%, {np.mean(known >= 15) * 100:.0f}% das células com 15% ou mais"
    )


if __name__ == "__main__":
    add_to_grid(sys.argv[1], offline="--offline" in sys.argv)
