import type { GridHeader } from "@linha-zero/engine";
import { lngLatToGrid } from "./projection";

/** Lattice spacing in pixels: the projection is sampled at the lattice and interpolated in between. */
const STEP = 16;

/**
 * Terrarium-encoded DEM tile (z/x/y, Web Mercator) from the grid's own elevation, as RGBA pixels.
 * Points outside the grid take the nearest edge cell.
 *
 * proj4 costs ~1 µs per point, so a per-pixel inverse projection is ~70 ms per tile. Over 16 px the
 * transverse Mercator is linear to well under a cell, so only the lattice is projected and the grid
 * coordinates are interpolated bilinearly in between.
 */
export function demTilePixels(header: GridHeader, elevation: Float32Array, z: number, x: number, y: number, size: number): Uint8ClampedArray<ArrayBuffer> {
  const { rows, cols } = header;
  const n = 2 ** z;
  const L = size / STEP + 1;
  const gx = new Float64Array(L * L), gy = new Float64Array(L * L);
  for (let j = 0; j < L; j++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (j * STEP) / size)) / n))) * 180) / Math.PI;
    for (let i = 0; i < L; i++) {
      const lng = ((x + (i * STEP) / size) / n) * 360 - 180;
      const g = lngLatToGrid(header, lng, lat);
      gx[j * L + i] = g.x;
      gy[j * L + i] = g.y;
    }
  }
  const out = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    const v = (py + 0.5) / STEP, j = Math.floor(v), fy = v - j;
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / STEP, i = Math.floor(u), fx = u - i;
      const k = j * L + i;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const cx = gx[k] * w00 + gx[k + 1] * w10 + gx[k + L] * w01 + gx[k + L + 1] * w11;
      const cy = gy[k] * w00 + gy[k + 1] * w10 + gy[k + L] * w01 + gy[k + L + 1] * w11;
      const c = Math.min(cols - 1, Math.max(0, Math.floor(cx)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(cy)));
      const e = elevation[r * cols + c] + 32768;
      const o = (py * size + px) * 4;
      // ImageData rounds, Terrarium needs floor.
      out[o] = Math.floor(e / 256);
      out[o + 1] = Math.floor(e % 256);
      out[o + 2] = Math.floor((e % 1) * 256);
      out[o + 3] = 255;
    }
  }
  return out;
}
