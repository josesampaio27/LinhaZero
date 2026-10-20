// Spread rates for the Rothermel model: per-fuel behaviour at the scenario's moisture, and per-cell
// head fire (fuel × wind × slope) computed lazily, only for the cells the fire reaches.
import { computeSlopeAspect } from "./grid";
import { crownFire } from "./crown";
import { groupRosAdj } from "./params";

/** Tree cover (%) below which a forest fuel cell has no canopy to carry a crown fire. */
export const CROWN_MIN_COVER_PCT = 30;
import {
  headFire,
  WIND_20FT_PER_10M,
  windAdjustmentFactor,
  prepareFuelBed,
  surfaceBase,
  type FuelMoisture,
  type SurfaceBase,
} from "./rothermel";
import type { PreparedGrid } from "./types";

interface Terrain {
  /** Slope as rise over run. */
  slopeTan: Float32Array;
  /** Direction of steepest ascent, degrees clockwise from north. */
  upslopeDeg: Float32Array;
}

const terrainCache = new WeakMap<PreparedGrid, Map<number, Terrain>>();

/** Box mean of the elevation over cells within halfWidth cells (clamped at the edges). */
function boxSmooth(z: Float32Array, rows: number, cols: number, halfWidth: number): Float32Array {
  const tmp = new Float32Array(z.length);
  const out = new Float32Array(z.length);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0, k = 0;
      for (let d = -halfWidth; d <= halfWidth; d++) {
        const cc = c + d;
        if (cc < 0 || cc >= cols) continue;
        s += z[r * cols + cc];
        k++;
      }
      tmp[r * cols + c] = s / k;
    }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let s = 0, k = 0;
      for (let d = -halfWidth; d <= halfWidth; d++) {
        const rr = r + d;
        if (rr < 0 || rr >= rows) continue;
        s += tmp[rr * cols + c];
        k++;
      }
      out[r * cols + c] = s / k;
    }
  return out;
}

/**
 * Slope and upslope direction of every cell (Horn's method), cached per prepared grid; with
 * smoothM > 0 the elevation is first box-averaged over ±smoothM (ModelParams.demSmoothM).
 */
export function terrainOf(grid: PreparedGrid, smoothM = 0): Terrain {
  let byGrid = terrainCache.get(grid);
  if (!byGrid) terrainCache.set(grid, (byGrid = new Map()));
  let t = byGrid.get(smoothM);
  if (!t) {
    const { rows, cols, cellSize } = grid.header;
    const half = Math.round(smoothM / cellSize);
    const { slopeDeg, aspectDeg } = computeSlopeAspect(
      half > 0 ? boxSmooth(grid.elevation, rows, cols, half) : grid.elevation,
      rows,
      cols,
      cellSize,
    );
    const slopeTan = new Float32Array(slopeDeg.length);
    const upslopeDeg = new Float32Array(slopeDeg.length);
    for (let i = 0; i < slopeDeg.length; i++) {
      slopeTan[i] = Math.tan((slopeDeg[i] * Math.PI) / 180);
      upslopeDeg[i] = (aspectDeg[i] + 180) % 360;
    }
    t = { slopeTan, upslopeDeg };
    byGrid.set(smoothM, t);
  }
  return t;
}

/**
 * No-wind, no-slope behaviour of every fuel code at the given moisture, indexed by code.
 * Throws if a burnable fuel (baseRate > 0) has no Rothermel parameters.
 */
export function fuelBases(
  grid: PreparedGrid,
  moisture: FuelMoisture,
  /** Multiplier of every fuel's spread rate (calibration): one number, or per fuel group. */
  rosAdj: number | Parameters<typeof groupRosAdj>[0] = 1,
): (SurfaceBase | null)[] {
  const bases: (SurfaceBase | null)[] = new Array(256).fill(null);
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(grid.header.fuelTable)) {
    const code = Number(key);
    if (!(entry.baseRate > 0)) continue;
    if (!entry.rothermel) {
      missing.push(`${code} (${entry.label})`);
      continue;
    }
    const base = surfaceBase(prepareFuelBed(entry.rothermel, moisture), moisture);
    const adj = typeof rosAdj === "number" ? rosAdj : groupRosAdj(rosAdj, entry.rothermel.group);
    bases[code] = adj === 1 ? base : { ...base, r0: base.r0 * adj, rosAdj: adj };
  }
  if (missing.length) {
    throw new Error(
      `Modelo de Rothermel: faltam os parâmetros dos combustíveis ${missing.join(", ")}`,
    );
  }
  return bases;
}

/** Per-cell head fire and fire ellipse for one weather; reset with setWind or setConditions when it changes. */
export class RothermelRates {
  private readonly ros: Float32Array;
  private readonly cosHead: Float32Array;
  private readonly sinHead: Float32Array;
  /** Head bearing in radians (clockwise from north), for the sector rule. */
  private readonly headRad: Float32Array;
  private readonly ecc: Float32Array;
  /** Byram intensity per unit of spread rate, kW/m per m/min (intensity is proportional to the rate). */
  private readonly intensityPerRate: Float32Array;
  private readonly done: Uint8Array;
  private readonly terrain: Terrain;
  private wind10mMs = 0;
  private windToDeg = 0;

  constructor(
    private readonly grid: PreparedGrid,
    private bases: (SurfaceBase | null)[],
    /** Multiplier of the midflame wind (calibration). */
    private readonly windAdj = 1,
    /** Crown fire in forest fuels with canopy parameters (crown.ts); rateAdj multiplies its rate. */
    private readonly crown: { enabled: boolean; rateAdj: number } = { enabled: false, rateAdj: 1 },
    /** Wind limit (headFire): 1 Rothermel 1972, 2 Andrews et al. 2013, 0 none. */
    private readonly windLimit = 1,
    /** Crown ratio for the sheltered wind factor, and DEM smoothing (ModelParams.crownRatio, demSmoothM). */
    private readonly terrainOptions: { crownRatio?: number; demSmoothM?: number } = {},
  ) {
    const n = grid.header.rows * grid.header.cols;
    this.ros = new Float32Array(n);
    this.cosHead = new Float32Array(n);
    this.sinHead = new Float32Array(n);
    this.headRad = new Float32Array(n);
    this.ecc = new Float32Array(n);
    this.intensityPerRate = new Float32Array(n);
    this.done = new Uint8Array(n);
    this.terrain = terrainOf(grid, terrainOptions.demSmoothM ?? 0);
  }

  /** The 10-m wind in use: speed (m/s) and the direction it blows TOWARDS (degrees from north). */
  get wind(): { speedMs: number; toDeg: number } {
    return { speedMs: this.wind10mMs, toDeg: this.windToDeg };
  }

  /** Fuel behaviour in use (per fuel code). */
  get currentBases(): (SurfaceBase | null)[] {
    return this.bases;
  }

  /** Sets the 10-m open wind (direction it blows FROM, meteorological) and forgets cached cells. */
  setWind(speedMs: number, fromDeg: number): void {
    this.setConditions(speedMs, fromDeg, this.bases);
  }

  /** Sets the wind and the fuel behaviour at the current moisture (from fuelBases); forgets cached cells. */
  setConditions(speedMs: number, fromDeg: number, bases: (SurfaceBase | null)[]): void {
    this.wind10mMs = Math.max(0, speedMs);
    this.windToDeg = (((fromDeg + 180) % 360) + 360) % 360;
    this.bases = bases;
    this.done.fill(0);
  }

  /** Spread rate (m/min) of cell i in the direction whose bearing has the given cosine and sine. */
  rate(
    i: number,
    cosBearing: number,
    sinBearing: number,
    sectorCwRad = 0,
    sectorCcwRad = 0,
    /** The move's bearing in radians; needed with sectors. */
    bearingRad?: number,
  ): number {
    if (this.done[i] === 0) this.compute(i);
    const r = this.ros[i];
    if (r <= 0) return 0;
    const e = this.ecc[i];
    let cosTheta: number;
    if (bearingRad !== undefined && (sectorCwRad > 0 || sectorCcwRad > 0)) {
      // The move stands for part of the sector halfway to its neighbours: use the ellipse at the angle
      // of that part closest to the head, so a head fire between two moves keeps its rate.
      let delta = bearingRad - this.headRad[i]; // > 0: move clockwise of the head
      if (delta > Math.PI) delta -= 2 * Math.PI;
      else if (delta < -Math.PI) delta += 2 * Math.PI;
      const eff = delta > 0 ? delta - sectorCcwRad : -delta - sectorCwRad;
      cosTheta = eff <= 0 ? 1 : Math.cos(eff);
    } else cosTheta = cosBearing * this.cosHead[i] + sinBearing * this.sinHead[i];
    return (r * (1 - e)) / (1 - e * cosTheta);
  }

  /**
   * Fireline intensity (kW/m) of cell i for a fire spreading at `rate` (m/min) through it. Byram's
   * intensity is heat per area × rate, so a fire slowed by an intervention is also less intense.
   */
  intensity(i: number, rate: number): number {
    if (this.done[i] === 0) this.compute(i);
    return rate * this.intensityPerRate[i];
  }

  private compute(i: number): void {
    this.done[i] = 1;
    const base = this.bases[this.grid.fuel[i]];
    if (!base || !(base.r0 > 0)) {
      this.ros[i] = 0;
      return;
    }
    // Litter and understory fuels are sheltered by the cell's tree cover when the grid has it;
    // otherwise (no layer, no data, or a shrub or grass model) the fuel model's own factor applies.
    const cover = this.grid.canopy?.[i];
    const waf =
      base.bed.params.underCanopy && cover !== undefined && cover <= 100
        ? windAdjustmentFactor(base.bed.params.depthM, cover / 100, undefined, this.terrainOptions.crownRatio ?? 1)
        : base.bed.waf;
    const wind = this.wind10mMs * WIND_20FT_PER_10M * waf * this.windAdj;
    const h = headFire(
      base,
      wind,
      this.windToDeg,
      this.terrain.slopeTan[i],
      this.terrain.upslopeDeg[i],
      this.windLimit === 2 ? "revised" : this.windLimit !== 0,
    );
    const rad = (h.headDeg * Math.PI) / 180;
    this.ros[i] = h.ros;
    this.headRad[i] = rad;
    this.cosHead[i] = Math.cos(rad);
    this.sinHead[i] = Math.sin(rad);
    this.ecc[i] = h.eccentricity;
    // Intensity per unit rate from the physical (unadjusted) rate: I = heat per area × physical rate.
    const adj = base.rosAdj ?? 1;
    this.intensityPerRate[i] = h.ros > 0 ? h.intensityKwM / h.ros / adj : 0;
    const surfaceKwM = h.intensityKwM / adj;
    // Crown fire: where there are trees (canopy layer ≥ 30% cover, or no data), an intense enough
    // surface fire climbs into the crowns and spreads at the crown rate if that is faster. The shape
    // (eccentricity) stays the surface fire's.
    const canopy = base.bed.params.crown;
    if (this.crown.enabled && canopy && h.ros > 0 && !(cover !== undefined && cover <= 100 && cover < CROWN_MIN_COVER_PCT)) {
      const c = crownFire(canopy, surfaceKwM, this.wind10mMs * 3.6, base.d1 * 100, this.crown.rateAdj);
      if (c && c.rate > h.ros) {
        this.ros[i] = c.rate;
        // Physical intensity at Cruz's rate (c.rate / rateAdj): the surface and the canopy fuel both burn
        // at it. Per unit of the adjusted rate in use, that is their heat per unit rate over rateAdj.
        const heatPerRate = h.intensityKwM / h.ros + c.extraIntensityPerRate;
        this.intensityPerRate[i] = heatPerRate / (this.crown.rateAdj > 0 ? this.crown.rateAdj : 1);
      }
    }
  }
}
