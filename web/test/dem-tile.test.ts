import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { GridHeader } from "@linha-zero/engine";
import { demTilePixels } from "../src/lib/dem-tile";
import { gridToLngLat, lngLatToGrid } from "../src/lib/projection";

const header: GridHeader = JSON.parse(readFileSync(join(__dirname, "../public/grids/sintetica/header.json"), "utf8"));

/** Web Mercator tile holding a lng/lat at zoom z. */
function tileAt(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latR = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return [x, y];
}

it("interpolated tile samples the same cells as a per-pixel projection", () => {
  // Elevation = cell index, so the decoded value says which cell each pixel sampled.
  const elevation = Float32Array.from({ length: header.rows * header.cols }, (_, i) => i);
  const [lng, lat] = gridToLngLat(header, header.cols / 2, header.rows / 2);
  const size = 256;
  for (const z of [10, 13]) {
    const [tx, ty] = tileAt(lng, lat, z);
    const px = demTilePixels(header, elevation, z, tx, ty, size);
    const n = 2 ** z;
    let off = 0;
    for (let py = 0; py < size; py += 7) {
      for (let p = 0; p < size; p += 7) {
        const plat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + (py + 0.5) / size)) / n))) * 180) / Math.PI;
        const plng = ((tx + (p + 0.5) / size) / n) * 360 - 180;
        const g = lngLatToGrid(header, plng, plat);
        const exact = Math.min(header.rows - 1, Math.max(0, Math.floor(g.y))) * header.cols + Math.min(header.cols - 1, Math.max(0, Math.floor(g.x)));
        const o = (py * size + p) * 4;
        const got = px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768;
        // Interpolation may land a pixel on a neighbouring cell right at a cell edge, never further.
        const dr = Math.abs(Math.floor(got / header.cols) - Math.floor(exact / header.cols));
        const dc = Math.abs((got % header.cols) - (exact % header.cols));
        expect(dr).toBeLessThanOrEqual(1);
        expect(dc).toBeLessThanOrEqual(1);
        if (got !== exact) off++;
      }
    }
    expect(off).toBeLessThan(((size / 7) * (size / 7)) / 100); // under 1% of sampled pixels on a neighbour
  }
});
