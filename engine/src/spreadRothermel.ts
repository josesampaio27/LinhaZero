// Arrival times for the Rothermel model: a minimum-travel-time search over 32 directions in which
// each step's time is shared between the cells its straight line crosses (as in FlamMap's MTT), and
// each direction stands for part of the angular sector around it (SECTOR_FRACTION).
import type { MinHeap } from "./heap";
import type { InterventionLayers } from "./interventions";
import { attackEffectiveness, DEFAULT_PARAMS, holdProbability } from "./params";
import { hashRandom, RANDOM_PURPOSE } from "./random";
import { flameLength } from "./rothermel";
import { normals, spotDistribution } from "./spotting";
import type { SpreadInput } from "./spread";
import type { PreparedGrid } from "./types";

/** One move of the stencil: offset, direction and the cells its centre-to-centre line crosses. */
export interface StencilMove {
  dr: number;
  dc: number;
  /** Bearing, degrees clockwise from north (rows grow southwards). */
  bearingDeg: number;
  cosBearing: number;
  sinBearing: number;
  /** Length in cells. */
  length: number;
  /** Cells crossed, from the origin (0, 0) to the target (dr, dc), with the fraction of the line in each. */
  cells: { dr: number; dc: number; frac: number }[];
  /** A two-cell jump, used only across a breakable road in its middle cell (so a head fire can breach it head-on). */
  acrossRoad?: boolean;
  /**
   * Angular sector (radians) the move stands for, clockwise and counter-clockwise: half the gap to the
   * next move each way. The rate is the ellipse's at the angle of the sector closest to the head, so a
   * head fire between two stencil directions keeps its full rate (no zig-zag loss). 0 = the exact direction.
   */
  sectorCwRad?: number;
  sectorCcwRad?: number;
  /** Bearing in radians, for the sector rule. */
  bearingRad?: number;
}

/**
 * Share of each sector credited to a move (see StencilMove.sectorCwRad). With exact directions (0) a
 * thin, wind-driven ellipse loses up to 77% of its head rate when the wind falls between two stencil
 * directions, and burns a third of its true area; crediting the whole sector (1) keeps the head but
 * widens the fire up to 2.6 times. 0.6 with 32 directions keeps the head at 80-100% of its rate and the
 * area within 0.8-1.26 of the ellipse's at any wind angle, up to a length-to-breadth ratio of 8
 * (engine/test/stencil.test.ts).
 */
export const SECTOR_FRACTION = 0.6;

/** Gives each move the sector halfway to its neighbouring directions, times `fraction`. */
export function withSectors(moves: StencilMove[], fraction = SECTOR_FRACTION): StencilMove[] {
  const sorted = [...moves].sort((a, b) => a.bearingDeg - b.bearingDeg);
  const n = sorted.length;
  return sorted.map((m, k) => {
    const next = sorted[(k + 1) % n].bearingDeg + (k + 1 === n ? 360 : 0);
    const prev = sorted[(k - 1 + n) % n].bearingDeg - (k === 0 ? 360 : 0);
    const rad = Math.PI / 180;
    return {
      ...m,
      bearingRad: m.bearingDeg * rad,
      sectorCwRad: ((next - m.bearingDeg) / 2) * rad * fraction,
      sectorCcwRad: ((m.bearingDeg - prev) / 2) * rad * fraction,
    };
  });
}

/** The cells a line from the centre of (0, 0) to the centre of (dr, dc) crosses, with the fraction of its length in each. */
export function crossedCells(dr: number, dc: number): StencilMove["cells"] {
  // Parameter t in [0, 1] along the line; it crosses a cell edge where row or column ± 0.5 is a half-integer.
  const ts = new Set<number>([0, 1]);
  for (const [d] of [[dr], [dc]]) {
    for (let k = 1; k <= Math.abs(d); k++) ts.add((k - 0.5) / Math.abs(d));
  }
  const sorted = [...ts].sort((a, b) => a - b);
  const cells: StencilMove["cells"] = [];
  for (let s = 0; s + 1 < sorted.length; s++) {
    const mid = (sorted[s] + sorted[s + 1]) / 2;
    const cell = {
      dr: Math.round(mid * dr),
      dc: Math.round(mid * dc),
      frac: sorted[s + 1] - sorted[s],
    };
    const last = cells[cells.length - 1];
    if (last && last.dr === cell.dr && last.dc === cell.dc)
      last.frac += cell.frac;
    else cells.push(cell);
  }
  return cells;
}

function move(dr: number, dc: number): StencilMove {
  const bearingDeg = ((Math.atan2(dc, -dr) * 180) / Math.PI + 360) % 360;
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    dr,
    dc,
    bearingDeg,
    cosBearing: Math.cos(rad),
    sinBearing: Math.sin(rad),
    length: Math.hypot(dr, dc),
    cells: crossedCells(dr, dc),
  };
}

/** 8 neighbours plus the 8 knight moves: directions every 22.5° on average, so fires keep their ellipse. */
export const STENCIL_16: readonly StencilMove[] = [
  [-1, 0],
  [-2, 1],
  [-1, 1],
  [-1, 2],
  [0, 1],
  [1, 2],
  [1, 1],
  [2, 1],
  [1, 0],
  [2, -1],
  [1, -1],
  [1, -2],
  [0, -1],
  [-1, -2],
  [-1, -1],
  [-2, -1],
].map(([dr, dc]) => move(dr, dc));

/** The 8 reflections of a move (dr, dc) with 0 < dr < dc: every quadrant, both orders. */
function reflections(dr: number, dc: number): [number, number][] {
  return [
    [-dr, dc], [-dc, dr], [dc, dr], [dr, dc], [dr, -dc], [dc, -dr], [-dc, -dr], [-dr, -dc],
  ];
}

/** 16 plus the (1, 3) and (2, 3) moves: 32 directions, at most 11.3° apart. */
export const STENCIL_32: readonly StencilMove[] = [
  ...STENCIL_16,
  ...[...reflections(1, 3), ...reflections(2, 3)].map(([dr, dc]) => move(dr, dc)),
];

/** 32 directions with sectors: the engine's stencil (see SECTOR_FRACTION). */
export const STENCIL_32_SECTORS: readonly StencilMove[] = withSectors([...STENCIL_32]);

/** 32 plus the (1, 4) and (3, 4) moves: 48 directions, at most 8.1° apart. */
export const STENCIL_48: readonly StencilMove[] = [
  ...STENCIL_32,
  ...[...reflections(1, 4), ...reflections(3, 4)].map(([dr, dc]) => move(dr, dc)),
];

/** Two-cell jumps in the 8 directions; only taken across a breakable road (barrier 2-255) in the middle cell. */
export const ROAD_JUMPS: readonly StencilMove[] = [
  [-2, 0],
  [-2, 2],
  [0, 2],
  [2, 2],
  [2, 0],
  [2, -2],
  [0, -2],
  [-2, -2],
].map(([dr, dc]) => ({ ...move(dr, dc), acrossRoad: true }));

/**
 * Arrival minutes with the Rothermel rates of input.rates (see computeArrival for the shared rules on
 * weather changes). A step's time is the sum over the cells it crosses of the length in that cell
 * over that cell's rate in the step's direction. Every crossed cell after the origin must be burnable,
 * so a long step cannot jump a one-cell barrier.
 *
 * Against an intense fire (params, Rothermel only):
 * - "Ataque" and "Proteger zona" keep their full slowdown up to attackFullKwM and lose it linearly up
 *   to attackNoneKwM, judged on the intensity of the fire the crews face (before their slowdown);
 * - a containment line, or a breakable road (barrier 2-255 = width in m), holds with
 *   holdProbability(width, flame length of the burning origin). The deterministic run takes the line
 *   as holding when that probability is at least 50%; an ensemble run draws hashRandom per cell. A
 *   breached road is crossed at the origin's rate. Two-cell jumps (ROAD_JUMPS) let a fire face a
 *   one-cell road head-on; they are taken only across such a road.
 *
 * Spot fires (ensemble runs only): a cell burning above spotCriticalKwM launches an ember with
 * probability spotPerHa per hectare; it lands downwind at a Sardoy distance (spotting.ts) and, on
 * unburned fuel, ignites after spotDelayMin, whatever barriers or lines lie in between.
 */
export function computeArrivalRothermel(
  grid: PreparedGrid,
  input: SpreadInput,
  layers: InterventionLayers,
  heap: MinHeap,
  stencil: readonly StencilMove[] = [...STENCIL_32_SECTORS, ...ROAD_JUMPS],
): Float32Array {
  const rates = input.rates!;
  const params = { ...DEFAULT_PARAMS, ...input.params };
  const { rows, cols, cellSize } = grid.header;
  const { baseRate, barrier } = grid;
  const { containStart, containWidth, slowFactor, slowStart } = layers;
  const duration = input.durationMin;
  const intensityOut = input.intensityOut;
  intensityOut?.fill(0);
  const random = input.random;
  const spotting = !!random && params.spotPerHa > 0;
  // Intensity as the fire arrives in each cell: the output, or a scratch copy when spot fires need it.
  const fireIntensity =
    intensityOut ?? (spotting ? new Float32Array(rows * cols) : null);
  const spotChance =
    1 - Math.pow(1 - params.spotPerHa, (cellSize * cellSize) / 10000);
  rates.setConditions(
    input.windSpeedMs,
    input.windDirectionDeg,
    input.bases ?? rates.currentBases,
  );
  const changes = input.changes ?? [];
  let next = 0;
  const arrival = new Float64Array(rows * cols).fill(Infinity);
  const result = new Float32Array(rows * cols).fill(Infinity);

  heap.clear();
  for (const { cell, t0Min } of input.ignitions ?? [
    { cell: input.ignition, t0Min: 0 },
  ]) {
    const { row, col } = cell;
    if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
    const i = row * cols + col;
    if (baseRate[i] <= 0 || !(t0Min >= 0) || t0Min >= arrival[i]) continue;
    arrival[i] = t0Min;
    heap.push(t0Min, i);
  }

  // Rate (m/min) of cell x in the move's direction at departure minute t, after any intervention.
  const effectiveRate = (x: number, m: StencilMove, t: number) => {
    const rate = rates.rate(x, m.cosBearing, m.sinBearing, m.sectorCwRad, m.sectorCcwRad, m.bearingRad);
    if (!(slowStart[x] <= t) || rate <= 0) return rate;
    const e = attackEffectiveness(rates.intensity(x, rate), params);
    return rate * (1 - e * (1 - slowFactor[x]));
  };
  // Whether flames of the origin (burning at originRate in cell i) cross a line or road of this width at cell x.
  const breaches = (
    i: number,
    originRate: number,
    x: number,
    widthM: number,
  ) => {
    const p = holdProbability(
      widthM,
      flameLength(rates.intensity(i, originRate)),
      params,
    );
    return random
      ? hashRandom(random.seed, random.run, RANDOM_PURPOSE.breach, x) >= p
      : p < 0.5;
  };

  while (heap.size > 0) {
    const t = heap.peekKey();
    const i = heap.pop();
    if (t > arrival[i]) continue; // stale entry
    if (t > duration) break;
    while (next < changes.length && t >= changes[next].fromMin) {
      const w = changes[next++];
      rates.setConditions(
        w.windSpeedMs,
        w.windDirectionDeg,
        w.bases ?? rates.currentBases,
      );
    }
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (
      spotting &&
      fireIntensity![i] >= params.spotCriticalKwM &&
      hashRandom(random!.seed, random!.run, RANDOM_PURPOSE.spot, i) < spotChance
    ) {
      const wind = rates.wind;
      const d = spotDistribution(fireIntensity![i], wind.speedMs);
      const [z1, z2] = normals(
        hashRandom(random!.seed, random!.run, RANDOM_PURPOSE.spotDistance, i),
        hashRandom(random!.seed, random!.run, RANDOM_PURPOSE.spotDirection, i),
      );
      const along = Math.exp(d.mu + d.sigma * z1);
      const across = d.crosswindSigmaM * z2;
      const to = (wind.toDeg * Math.PI) / 180;
      const east = along * Math.sin(to) + across * Math.cos(to);
      const north = along * Math.cos(to) - across * Math.sin(to);
      const sr = r - Math.round(north / cellSize);
      const sc = c + Math.round(east / cellSize);
      const ts = t + params.spotDelayMin;
      if (sr >= 0 && sc >= 0 && sr < rows && sc < cols) {
        const k = sr * cols + sc;
        if (baseRate[k] > 0 && ts < arrival[k] && ts <= duration) {
          arrival[k] = ts;
          fireIntensity![k] = 0; // a new spot fire starts small
          heap.push(ts, k);
        }
      }
    }
    moves: for (const m of stencil) {
      const nr = r + m.dr;
      const nc = c + m.dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const j = nr * cols + nc;
      if (baseRate[j] <= 0 || arrival[j] <= t) continue;
      if (m.acrossRoad && barrier[(r + m.dr / 2) * cols + (c + m.dc / 2)] < 2)
        continue;
      const lengthM = m.length * cellSize;
      const originRate = effectiveRate(i, m, t);
      if (!(originRate > 0)) continue;
      let cost = 0;
      let rateJ = 0;
      for (const seg of m.cells) {
        const x = (r + seg.dr) * cols + (c + seg.dc);
        const len = seg.frac * lengthM;
        if (x === i) {
          cost += len / originRate;
          continue;
        }
        if (baseRate[x] <= 0) {
          // A breakable road on the way is crossed at the origin's rate if the flames breach it.
          if (barrier[x] < 2 || !breaches(i, originRate, x, barrier[x]))
            continue moves;
          cost += len / originRate;
          continue;
        }
        const rate = effectiveRate(x, m, t);
        if (!(rate > 0)) continue moves;
        cost += len / rate;
        if (x === j) rateJ = rate;
      }
      const ta = t + cost;
      if (ta >= arrival[j] || ta > duration) continue;
      for (const seg of m.cells) {
        const x = (r + seg.dr) * cols + (c + seg.dc);
        if (x === i || !(containStart[x] <= ta)) continue;
        const width = Number.isNaN(containWidth[x])
          ? params.lineWidthM
          : containWidth[x];
        if (!breaches(i, originRate, x, width)) continue moves; // the line holds
      }
      arrival[j] = ta;
      if (fireIntensity) fireIntensity[j] = rates.intensity(j, rateJ);
      heap.push(ta, j);
    }
  }
  result.set(arrival);
  return result;
}
