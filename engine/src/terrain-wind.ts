// Wind over the relief (stage B, M8): the 10-m wind of each cell from the one wind of the zone, sped up on windward
// slopes and ridges and slowed in lee slopes and valleys, and turned along slopes. The empirical terrain adjustment
// of MicroMet (Liston and Elder 2006), which follows Liston and Sturm (1998) for the speed and Ryan (1977) for the
// direction, transcribed from SnowModel's micromet_code.f (subroutines topo_data and topo_mod_winds):
//   curvature  (4 z - corners at ±inc) / (16 √2 inc Δ) + (4 z - sides at ±inc) / (16 inc Δ), scaled to ±0.5 by the
//              largest |value| on the grid; inc = round(curvature length scale / Δ)
//   wind slope slope (rad) × cos(wind direction - slope azimuth), scaled to ±0.5 the same way
//   speed      × (1 + slopeWeight × wind slope + curvatureWeight × curvature)
//   direction  when the slope azimuth is within 90° of the wind direction:
//              direction - 0.5 × min(wind slope in degrees, 45) × sin(2 × (azimuth - direction))
// Weights as in SnowModel's snowmodel.par (slopewt 0.58, curvewt 0.42; the file's comments suggest 0.42 for both),
// and its curvature length scale, 500 m ("about half the wavelength of the topographic features"). No mass
// conservation: a terrain-following correction, not a flow solver.
import { computeSlopeAspect } from "./grid";
import type { GridData } from "./types";

export const TERRAIN_WIND = { slopeWeight: 0.58, curvatureWeight: 0.42, curvatureLengthM: 500 } as const;

export interface TerrainWind {
  /** Multiplier of the zone's wind speed in each cell (0.5 to 1.5 with the default weights). */
  speedFactor: Float32Array;
  /** Direction the wind blows FROM in each cell, degrees clockwise from north. */
  fromDeg: Float32Array;
}

interface Relief {
  curvature: Float32Array;
  slopeRad: Float32Array;
  /** Slope azimuth: the direction the slope faces (downslope), degrees clockwise from north. */
  aspectDeg: Float32Array;
}

const reliefCache = new WeakMap<Float32Array, Map<string, Relief>>();
const windCache = new WeakMap<Relief, Map<number, TerrainWind>>();

function reliefOf(grid: GridData, curvatureLengthM: number): Relief {
  let byGrid = reliefCache.get(grid.elevation);
  if (!byGrid) reliefCache.set(grid.elevation, (byGrid = new Map()));
  const { rows, cols, cellSize } = grid.header;
  const key = `${rows}x${cols}|${cellSize}|${curvatureLengthM}`;
  let relief = byGrid.get(key);
  if (relief) return relief;
  const z = grid.elevation;
  const inc = Math.max(1, Math.round(curvatureLengthM / cellSize));
  const at = (r: number, c: number) => z[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  const curvature = new Float32Array(rows * cols);
  let max = 0.001; // as in MicroMet: a 1 mm floor so flat ground does not divide by zero
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z0 = z[r * cols + c];
      const corners = (4 * z0 - at(r - inc, c - inc) - at(r + inc, c + inc) - at(r - inc, c + inc) - at(r + inc, c - inc)) / (Math.SQRT2 * 16 * inc * cellSize);
      const sides = (4 * z0 - at(r, c + inc) - at(r, c - inc) - at(r + inc, c) - at(r - inc, c)) / (16 * inc * cellSize);
      curvature[r * cols + c] = corners + sides;
      max = Math.max(max, Math.abs(corners + sides));
    }
  }
  for (let i = 0; i < curvature.length; i++) curvature[i] /= 2 * max;
  const { slopeDeg, aspectDeg } = computeSlopeAspect(z, rows, cols, cellSize);
  const slopeRad = new Float32Array(slopeDeg.length);
  for (let i = 0; i < slopeRad.length; i++) slopeRad[i] = (slopeDeg[i] * Math.PI) / 180;
  relief = { curvature, slopeRad, aspectDeg };
  byGrid.set(key, relief);
  return relief;
}

/** The terrain-adjusted wind of every cell for a zone wind blowing from `fromDeg` (cached per grid and whole degree). */
export function terrainWind(grid: GridData, fromDeg: number, weights: { slopeWeight: number; curvatureWeight: number; curvatureLengthM: number } = TERRAIN_WIND): TerrainWind {
  const relief = reliefOf(grid, weights.curvatureLengthM);
  const dir = ((Math.round(fromDeg) % 360) + 360) % 360;
  let byDir = windCache.get(relief);
  if (!byDir) windCache.set(relief, (byDir = new Map()));
  const key = dir + 1000 * Math.round(weights.slopeWeight * 100) + 1e6 * Math.round(weights.curvatureWeight * 100);
  const hit = byDir.get(key);
  if (hit) return hit;
  const n = relief.curvature.length;
  const deg = Math.PI / 180;
  // Slope in the direction of the wind, scaled to ±0.5.
  const windSlope = new Float32Array(n);
  let max = 0.001;
  for (let i = 0; i < n; i++) {
    windSlope[i] = relief.slopeRad[i] * Math.cos((dir - relief.aspectDeg[i]) * deg);
    max = Math.max(max, Math.abs(windSlope[i]));
  }
  const speedFactor = new Float32Array(n);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ws = windSlope[i] / (2 * max);
    speedFactor[i] = 1 + weights.slopeWeight * ws + weights.curvatureWeight * relief.curvature[i];
    let diff = relief.aspectDeg[i] - dir;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    let d = dir;
    if (Math.abs(diff) <= 90) d = dir - 0.5 * Math.min(ws / deg, 45) * Math.sin(2 * diff * deg);
    out[i] = ((d % 360) + 360) % 360;
  }
  const wind = { speedFactor, fromDeg: out };
  byDir.set(key, wind);
  return wind;
}
