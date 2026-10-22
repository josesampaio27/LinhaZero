// Arrival times for the Rothermel model: a minimum-travel-time search over 32 directions in which
// each step's time is shared between the cells its straight line crosses (as in FlamMap's MTT), and
// each direction stands for part of the angular sector around it (SECTOR_FRACTION).
import type { MinHeap } from "./heap";
import type { InterventionLayers } from "./interventions";
import { aerialHoldProbability, attackEffectiveness, DEFAULT_PARAMS, holdProbability } from "./params";
import { hashRandom, RANDOM_PURPOSE } from "./random";
import { flameLength } from "./rothermel";
import { normals, spotDistribution } from "./spotting";
import type { SpreadChange, SpreadInput } from "./spread";
import { EXPLAIN_CROWN, EXPLAIN_SLOWED, type PreparedGrid } from "./types";

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
  /**
   * Where the line passes exactly through a cell corner (diagonal moves and their multiples): for the
   * entry into cells[k], the two cells beside that corner. A fire cannot squeeze between them when both
   * are barriers that hold (corners[k] undefined = an ordinary edge crossing).
   */
  corners?: ({ dr: number; dc: number }[] | undefined)[];
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

/**
 * Share of the way to its edge that the fire has already covered in a cell given as burned at the start
 * (Ignition.burned: an observed burned area). Its centre is known to have burned, not where the front
 * is beyond it. Restarting from the centres (0) loses growth at every restart; from the edges (1) the
 * whole front is credited the same progress and the fastest paths overshoot. 0.65 keeps the growth of
 * the engine's own fires, observed every 30-120 minutes and restarted from what was observed, at 1.00
 * on average (0.85-1.06 per interval) at 30 m, over winds of 1-10 m/s (engine/test/calibration.test.ts).
 */
export const SEED_SHARE = 0.65;

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

/** The two cells beside each corner the line of a move passes through (see StencilMove.corners). */
export function cornerCells(cells: StencilMove["cells"]): StencilMove["corners"] {
  const corners = cells.map((cell, k) => {
    const prev = cells[k - 1];
    if (!prev || prev.dr === cell.dr || prev.dc === cell.dc) return undefined;
    return [
      { dr: prev.dr, dc: cell.dc },
      { dr: cell.dr, dc: prev.dc },
    ];
  });
  return corners.some(Boolean) ? corners : undefined;
}

function move(dr: number, dc: number): StencilMove {
  const bearingDeg = ((Math.atan2(dc, -dr) * 180) / Math.PI + 360) % 360;
  const rad = (bearingDeg * Math.PI) / 180;
  const cells = crossedCells(dr, dc);
  return {
    dr,
    dc,
    bearingDeg,
    cosBearing: Math.cos(rad),
    sinBearing: Math.sin(rad),
    length: Math.hypot(dr, dc),
    cells,
    corners: cornerCells(cells),
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
 * Arrival minutes with the Rothermel rates of input.rates. A step's time is the sum over the cells it
 * crosses of the length in that cell over that cell's rate in the step's direction. Every crossed cell
 * after the origin must be burnable, so a long step cannot jump a one-cell barrier, and a step through a
 * cell corner cannot squeeze between two barrier cells that hold.
 *
 * Changing conditions: a step's time is computed with the weather (and interventions) at its departure.
 * When the weather changes at minute T, an "Ataque" / "Proteger zona" starts or ends, or a line or an
 * aerial drop stops acting, the steps still under
 * way are recomputed: every arrival not yet reached is forgotten, and each burning cell with unburned
 * neighbours restarts its steps at T, keeping the share of each step it had already covered under the
 * old conditions and covering the rest at the new rate. So a fire that started in calm weather speeds
 * up when the wind rises, and steps launched on a dry afternoon slow down when the night is damp,
 * whatever the cell size. Ignitions may start before minute 0 (t0Min < 0), e.g. a fire front that has
 * already crossed part of its cells.
 *
 * Against an intense fire (params, Rothermel only):
 * - "Ataque" and "Proteger zona" keep their full slowdown up to attackFullKwM and lose it linearly up
 *   to attackNoneKwM, judged on the intensity of the fire the crews face (before their slowdown);
 * - a containment line, or a breakable road (barrier 2-255 = width in m), holds with
 *   holdProbability(width, flame length of the burning origin). The deterministic run takes the line
 *   as holding when that probability is at least 50%; an ensemble run draws hashRandom per cell. A
 *   breached road is crossed at the origin's rate. Two-cell jumps (ROAD_JUMPS) let a fire face a
 *   one-cell road head-on; they are taken only across such a road;
 * - an aerial drop holds with aerialHoldProbability(intensity of the burning origin), drawn the same way.
 * Every action works from its start minute to its end (ADR 0070): after it, the fire goes on as if it
 * had never been there.
 *
 * Backfires: input.litIgnitions are set alight at their minute, like the fire's own ignitions.
 *
 * Spot fires (ensemble runs only): a cell burning above spotCriticalKwM launches an ember with
 * probability spotPerHa per hectare; it lands downwind at a Sardoy distance (spotting.ts) and, on
 * unburned fuel that is not a containment line or an aerial drop in force, ignites after spotDelayMin,
 * whatever barriers or lines lie in between.
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
  const n = rows * cols;
  const { baseRate, barrier } = grid;
  const { containStart, containEnd, containWidth, slowFactor, slowStart, slowEnd, dropStart, dropEnd } = layers;
  // A line or an aerial drop stops a fire arriving at minute ta only while it is in force.
  const lineAt = (x: number, ta: number) => containStart[x] <= ta && ta < containEnd[x];
  const dropAt = (x: number, ta: number) => dropStart[x] <= ta && ta < dropEnd[x];
  const duration = input.durationMin;
  const intensityOut = input.intensityOut;
  intensityOut?.fill(0);
  const explain = input.explainOut;
  explain?.from.fill(-1);
  const random = input.random;
  const spotting = !!random && params.spotPerHa > 0;
  // Intensity as the fire arrives in each cell: the output, or a scratch copy when spot fires need it.
  const fireIntensity =
    intensityOut ?? (spotting ? new Float32Array(n) : null);
  const spotChance =
    1 - Math.pow(1 - params.spotPerHa, (cellSize * cellSize) / 10000);
  rates.setConditions(
    input.windSpeedMs,
    input.windDirectionDeg,
    input.bases ?? rates.currentBases,
  );
  const arrival = new Float64Array(n).fill(Infinity);
  const result = new Float32Array(n).fill(Infinity);
  /** 1 once a cell has burned (its arrival is final and its steps launched). */
  const done = new Uint8Array(n);
  /** Burned cells that may still have unburned neighbours (pruned at each change of conditions). */
  let active: number[] = [];
  /**
   * Per burning cell, after a change of conditions: for each move, the virtual departure minute such
   * that the step arrives at departure + its time under the current conditions. Absent = its arrival.
   */
  let departures = new Map<number, Float64Array>();
  /** Cells given a tentative arrival since the last change of conditions. */
  let touched: number[] = [];
  /** Arrivals that do not come from a step (ignitions, spot fires): kept when conditions change. */
  const forced: { i: number; t: number }[] = [];
  /** 1 where an ignition says the whole cell is burned: its steps leave from its edges (no time in it). */
  const burnedSeed = new Uint8Array(n);

  // Changes of conditions in time order: weather changes, the start and end of every slowdown zone, and
  // the end of every line and aerial drop (the steps they blocked set off again). A line or a drop
  // starting needs no event: whether it blocks a step is judged on the minute the step arrives.
  const events: { t: number; change?: SpreadChange }[] = (input.changes ?? []).map((c) => ({ t: c.fromMin, change: c }));
  const eventTimes = new Set<number>();
  const addTime = (t: number) => {
    if (Number.isFinite(t)) eventTimes.add(t);
  };
  for (let x = 0; x < n; x++) {
    addTime(slowStart[x]);
    if (slowStart[x] < Infinity) addTime(slowEnd[x]);
    if (containStart[x] < Infinity) addTime(containEnd[x]);
    if (dropStart[x] < Infinity) addTime(dropEnd[x]);
  }
  for (const t of eventTimes) events.push({ t });
  events.sort((a, b) => a.t - b.t);
  let nextEvent = 0;

  heap.clear();
  const setArrival = (j: number, ta: number) => {
    if (arrival[j] === Infinity) touched.push(j);
    arrival[j] = ta;
    heap.push(ta, j);
    if (explain) explain.from[j] = -1; // an ignition or a spot fire; relax() sets the cell it came from
  };
  // The fire's own start, then the cells people set alight (backfires), each from its own minute.
  for (const { cell, t0Min, burned } of [
    ...(input.ignitions ?? [{ cell: input.ignition, t0Min: 0 }]),
    ...(input.litIgnitions ?? []),
  ]) {
    const { row, col } = cell;
    if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
    const i = row * cols + col;
    if (baseRate[i] <= 0 || !Number.isFinite(t0Min) || t0Min > arrival[i]) continue;
    if (burned) burnedSeed[i] = 1;
    if (t0Min === arrival[i]) continue;
    setArrival(i, t0Min);
    forced.push({ i, t: t0Min });
  }

  // Rate (m/min) of cell x in the move's direction at departure minute t, after any intervention.
  const effectiveRate = (x: number, m: StencilMove, t: number) => {
    const rate = rates.rate(x, m.cosBearing, m.sinBearing, m.sectorCwRad, m.sectorCcwRad, m.bearingRad);
    if (!(slowStart[x] <= t && t < slowEnd[x]) || rate <= 0) return rate;
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
  // Whether an aerial drop on cell x holds the fire coming from cell i (burning at originRate): always up
  // to params.aerialFullKwM, never from aerialNoneKwM; in between the main run holds at 50% or more and
  // an ensemble run draws it per cell.
  const dropHolds = (i: number, originRate: number, x: number) => {
    const p = aerialHoldProbability(rates.intensity(i, originRate), params);
    return random ? hashRandom(random.seed, random.run, RANDOM_PURPOSE.dropHold, x) < p : p >= 0.5;
  };
  // A barrier cell that stops these flames: water always, a road or river unless they breach it.
  const holdsAt = (i: number, originRate: number, x: number) =>
    barrier[x] > 0 && baseRate[x] <= 0 && (barrier[x] < 2 || !breaches(i, originRate, x, barrier[x]));

  // Time (min) of move m from cell i (row r, col c) leaving at minute t under the current conditions;
  // Infinity when the move is blocked. Leaves the origin's and the target's rates in stepOrigin, stepTarget.
  let stepOrigin = 0;
  let stepTarget = 0;
  const stepCost = (i: number, r: number, c: number, m: StencilMove, t: number): number => {
    if (m.acrossRoad && barrier[(r + m.dr / 2) * cols + (c + m.dc / 2)] < 2) return Infinity;
    const originRate = effectiveRate(i, m, t);
    if (!(originRate > 0)) return Infinity;
    const lengthM = m.length * cellSize;
    const j = (r + m.dr) * cols + (c + m.dc);
    let cost = 0;
    let rateJ = 0;
    for (let k = 0; k < m.cells.length; k++) {
      const seg = m.cells[k];
      const corner = m.corners?.[k];
      if (corner) {
        const a = (r + corner[0].dr) * cols + (c + corner[0].dc);
        const b = (r + corner[1].dr) * cols + (c + corner[1].dc);
        if (holdsAt(i, originRate, a) && holdsAt(i, originRate, b)) return Infinity;
      }
      const x = (r + seg.dr) * cols + (c + seg.dc);
      const len = seg.frac * lengthM;
      if (x === i) {
        cost += (burnedSeed[i] ? 1 - SEED_SHARE : 1) * (len / originRate);
        continue;
      }
      if (baseRate[x] <= 0) {
        // A breakable road on the way is crossed at the origin's rate if the flames breach it.
        if (barrier[x] < 2 || !breaches(i, originRate, x, barrier[x])) return Infinity;
        cost += len / originRate;
        continue;
      }
      const rate = effectiveRate(x, m, t);
      if (!(rate > 0)) return Infinity;
      cost += len / rate;
      if (x === j) rateJ = rate;
    }
    stepOrigin = originRate;
    stepTarget = rateJ;
    return cost;
  };
  // Accepts arrival ta at cell j by move m from cell i unless a containment line or an aerial drop in
  // force at ta holds on a cell the step crosses.
  const relax = (i: number, r: number, c: number, m: StencilMove, j: number, ta: number) => {
    if (ta >= arrival[j] || ta > duration) return;
    for (const seg of m.cells) {
      const x = (r + seg.dr) * cols + (c + seg.dc);
      if (x === i) continue;
      if (lineAt(x, ta)) {
        const width = Number.isNaN(containWidth[x])
          ? params.lineWidthM
          : containWidth[x];
        if (!breaches(i, stepOrigin, x, width)) return; // the line holds
      }
      if (dropAt(x, ta) && dropHolds(i, stepOrigin, x)) return; // the drop holds
    }
    setArrival(j, ta);
    if (fireIntensity) fireIntensity[j] = rates.intensity(j, stepTarget);
    if (explain) {
      const f = rates.factors(j);
      explain.from[j] = i;
      explain.rate[j] = stepTarget;
      explain.headRate[j] = f.headRate;
      explain.r0[j] = f.r0;
      explain.windPart[j] = f.windPart;
      explain.slopePart[j] = f.slopePart;
      explain.flags[j] = (f.crown ? EXPLAIN_CROWN : 0) | (slowStart[j] <= ta && ta < slowEnd[j] ? EXPLAIN_SLOWED : 0);
    }
  };
  // Target of move m from (r, c) if it is an unburned, burnable cell inside the grid; else -1.
  const target = (r: number, c: number, m: StencilMove) => {
    const nr = r + m.dr;
    const nc = c + m.dc;
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) return -1;
    const j = nr * cols + nc;
    return baseRate[j] > 0 && !done[j] ? j : -1;
  };

  // Conditions change at minute T: recompute the steps under way (see the comment above).
  const restart = (T: number, change?: SpreadChange) => {
    const frontier = active.filter((i) => {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      return stencil.some((m) => target(r, c, m) >= 0);
    });
    active = frontier;
    const nm = stencil.length;
    // Share of each step covered by T under the old conditions (NaN: no step to that neighbour). The old
    // conditions are those just before T (a slowdown starting at T does not apply yet).
    const before = T - 1e-9;
    const covered = new Float64Array(frontier.length * nm).fill(NaN);
    frontier.forEach((i, f) => {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const dep = departures.get(i);
      stencil.forEach((m, k) => {
        if (target(r, c, m) < 0) return;
        const cost = stepCost(i, r, c, m, before);
        const from = dep ? dep[k] : arrival[i];
        covered[f * nm + k] = cost > 0 && cost < Infinity ? Math.min(1, Math.max(0, (T - from) / cost)) : 0;
      });
    });
    const nextDepartures = new Map<number, Float64Array>();
    for (const x of touched) {
      if (done[x]) continue;
      arrival[x] = Infinity;
      if (fireIntensity) fireIntensity[x] = 0;
    }
    touched = [];
    heap.clear();
    if (change)
      rates.setConditions(
        change.windSpeedMs,
        change.windDirectionDeg,
        change.bases ?? rates.currentBases,
      );
    for (const { i, t } of forced) {
      if (done[i] || !(t < arrival[i])) continue;
      setArrival(i, t);
      if (fireIntensity) fireIntensity[i] = 0;
    }
    frontier.forEach((i, f) => {
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const dep = new Float64Array(nm).fill(T);
      stencil.forEach((m, k) => {
        const share = covered[f * nm + k];
        if (Number.isNaN(share)) return;
        const cost = stepCost(i, r, c, m, T);
        if (!(cost < Infinity)) return; // blocked now: a later change starts this step afresh
        dep[k] = T - share * cost;
        relax(i, r, c, m, (r + m.dr) * cols + (c + m.dc), T + (1 - share) * cost);
      });
      nextDepartures.set(i, dep);
    });
    departures = nextDepartures;
  };

  for (;;) {
    const tNext = heap.size > 0 ? heap.peekKey() : Infinity;
    const ev = events[nextEvent];
    if (ev && ev.t <= tNext && ev.t <= duration) {
      nextEvent++;
      restart(ev.t, ev.change);
      continue;
    }
    if (heap.size === 0) break;
    const t = tNext;
    const i = heap.pop();
    if (t > arrival[i] || done[i]) continue; // stale entry
    if (t > duration) break;
    done[i] = 1;
    active.push(i);
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
        // A containment line in place is bare ground, and a drop in force is wet: an ember landing on them goes out.
        if (baseRate[k] > 0 && !done[k] && ts < arrival[k] && ts <= duration && !lineAt(k, ts) && !dropAt(k, ts)) {
          setArrival(k, ts);
          forced.push({ i: k, t: ts });
          fireIntensity![k] = 0; // a new spot fire starts small
        }
      }
    }
    for (const m of stencil) {
      const j = target(r, c, m);
      if (j < 0 || arrival[j] <= t) continue;
      const cost = stepCost(i, r, c, m, t);
      if (cost < Infinity) relax(i, r, c, m, j, t + cost);
    }
  }
  for (let x = 0; x < n; x++) result[x] = done[x] ? arrival[x] : Infinity;
  return result;
}
