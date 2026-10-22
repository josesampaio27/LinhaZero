// Spread rates for the Rothermel model: per-fuel behaviour at the scenario's moisture, and per-cell
// head fire (fuel × wind × slope) computed lazily, only for the cells the fire reaches.
import { computeSlopeAspect } from "./grid";
import { crownFire } from "./crown";
import { groupFactor, groupRosAdj } from "./params";
import { terrainWind, type TerrainWind } from "./terrain-wind";

/** Tree cover (%) below which a forest fuel cell has no canopy to carry a crown fire. */
export const CROWN_MIN_COVER_PCT = 30;
import {
  andersonShrubRate,
  headFire,
  lengthToBreadthTaylor,
  WIND_20FT_PER_10M,
  windAdjustmentFactor,
  prepareFuelBed,
  surfaceBase,
  DEFAULT_MOISTURE,
  type FuelMoisture,
  type SurfaceBase,
} from "./rothermel";
import type { GridData, PreparedGrid } from "./types";

interface Terrain {
  /** Slope as rise over run. */
  slopeTan: Float32Array;
  /** Direction of steepest ascent, degrees clockwise from north. */
  upslopeDeg: Float32Array;
}

// Keyed on the elevation array, not the grid: a grid copied with other fuel (a variant, or the spent
// cells of an interval restart) shares its relief, and recomputing it was a large part of each run.
const terrainCache = new WeakMap<Float32Array, Map<string, Terrain>>();

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
 * Slope and upslope direction of every cell (Horn's method), cached per elevation raster; with
 * smoothM > 0 the elevation is first box-averaged over ±smoothM (ModelParams.demSmoothM).
 */
export function terrainOf(grid: PreparedGrid, smoothM = 0): Terrain {
  let byGrid = terrainCache.get(grid.elevation);
  if (!byGrid) terrainCache.set(grid.elevation, (byGrid = new Map()));
  const key = `${smoothM}|${grid.header.cellSize}|${grid.header.cols}`;
  let t = byGrid.get(key);
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
    byGrid.set(key, t);
  }
  return t;
}

/**
 * No-wind, no-slope behaviour of every fuel code at the given moisture, indexed by code.
 * Throws if a burnable fuel (baseRate > 0) has no Rothermel parameters.
 */
export function fuelBases(
  grid: Pick<GridData, "header">,
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
    const groupAdj = typeof rosAdj === "number" ? 1 : groupFactor(rosAdj, entry.rothermel.group);
    bases[code] = adj === 1 && groupAdj === 1 ? base : { ...base, r0: base.r0 * adj, rosAdj: adj, groupAdj };
  }
  if (missing.length) {
    throw new Error(
      `Modelo de Rothermel: faltam os parâmetros dos combustíveis ${missing.join(", ")}`,
    );
  }
  return bases;
}

/** Wind of the reference conditions the map shows (10 km/h at 10 m, open ground). */
export const REFERENCE_WIND_KMH = 10;

/**
 * The head fire rate (m/min) of every cell under reference conditions: a REFERENCE_WIND_KMH wind, flat
 * ground, the default fuel moisture and the given calibration (rosAdj, windAdj, crownRatio), with the
 * shelter of the cell's own tree cover, as in the simulation. 0 where nothing burns. Surface fire only.
 * This is what the map colours and the cell inspector show, so they speak the simulation's model.
 */
export function referenceHeadRates(
  grid: GridData,
  params: { rosAdj: number; windAdj: number; crownRatio: number },
  moisture: FuelMoisture = DEFAULT_MOISTURE,
  windKmh = REFERENCE_WIND_KMH,
): Float32Array {
  const bases = fuelBases(grid, moisture, params.rosAdj);
  const out = new Float32Array(grid.fuel.length);
  const wind10 = windKmh / 3.6;
  for (let i = 0; i < out.length; i++) {
    const base = bases[grid.fuel[i]];
    if (!base || grid.barrier[i] > 0) continue;
    const cover = grid.canopy?.[i];
    const waf =
      base.bed.params.underCanopy && cover !== undefined && cover <= 100
        ? windAdjustmentFactor(base.bed.params.depthM, cover / 100, undefined, params.crownRatio)
        : base.bed.waf;
    out[i] = headFire(base, wind10 * WIND_20FT_PER_10M * waf * params.windAdj, 0, 0, 0).ros;
  }
  return out;
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
  /** What makes up each cell's head rate (for the explanation of a result): r0 and the wind and slope parts. */
  private readonly r0: Float32Array;
  private readonly windPart: Float32Array;
  private readonly slopePart: Float32Array;
  /** 1 where the head rate is the crown fire's. */
  private readonly crowning: Uint8Array;
  private readonly terrain: Terrain;
  private wind10mMs = 0;
  private windToDeg = 0;
  private cellWind: TerrainWind | null = null;

  constructor(
    private readonly grid: PreparedGrid,
    private bases: (SurfaceBase | null)[],
    /** Multiplier of the midflame wind (calibration). */
    private readonly windAdj = 1,
    /** Crown fire in forest fuels with canopy parameters (crown.ts); rateAdj multiplies its rate. */
    private readonly crown: { enabled: boolean; rateAdj: number } = { enabled: false, rateAdj: 1 },
    /** Wind limit (headFire): 1 Rothermel 1972, 2 Andrews et al. 2013, 0 none. */
    private readonly windLimit = 1,
    /**
     * Crown ratio for the sheltered wind factor, DEM smoothing, and the stage B model switches
     * (ModelParams.crownRatio, demSmoothM, shrubModel, shapeModel, terrainWind).
     */
    private readonly terrainOptions: { crownRatio?: number; demSmoothM?: number; shrubModel?: number; shapeModel?: number; terrainWind?: number } = {},
  ) {
    const n = grid.header.rows * grid.header.cols;
    this.ros = new Float32Array(n);
    this.cosHead = new Float32Array(n);
    this.sinHead = new Float32Array(n);
    this.headRad = new Float32Array(n);
    this.ecc = new Float32Array(n);
    this.intensityPerRate = new Float32Array(n);
    this.done = new Uint8Array(n);
    this.r0 = new Float32Array(n);
    this.windPart = new Float32Array(n);
    this.slopePart = new Float32Array(n);
    this.crowning = new Uint8Array(n);
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
    // Wind over the relief (M8): each cell's own speed and direction from the zone's wind.
    this.cellWind = this.terrainOptions.terrainWind === 1 ? terrainWind(this.grid, fromDeg) : null;
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

  /**
   * Why cell i spreads as it does under the current conditions: its head rate (m/min), the no-wind no-slope
   * rate of its fuel (r0, calibration included), the wind and slope parts (head = r0 × (1 + wind + slope))
   * and whether the crown fire sets the head rate.
   */
  factors(i: number): { headRate: number; r0: number; windPart: number; slopePart: number; crown: boolean } {
    if (this.done[i] === 0) this.compute(i);
    return { headRate: this.ros[i], r0: this.r0[i], windPart: this.windPart[i], slopePart: this.slopePart[i], crown: this.crowning[i] === 1 };
  }

  private compute(i: number): void {
    this.done[i] = 1;
    this.crowning[i] = 0;
    const base = this.bases[this.grid.fuel[i]];
    if (!base || !(base.r0 > 0)) {
      this.ros[i] = 0;
      this.r0[i] = 0;
      this.windPart[i] = 0;
      this.slopePart[i] = 0;
      return;
    }
    // Litter and understory fuels are sheltered by the cell's tree cover when the grid has it;
    // otherwise (no layer, no data, or a shrub or grass model) the fuel model's own factor applies.
    const cover = this.grid.canopy?.[i];
    const waf =
      base.bed.params.underCanopy && cover !== undefined && cover <= 100
        ? windAdjustmentFactor(base.bed.params.depthM, cover / 100, undefined, this.terrainOptions.crownRatio ?? 1)
        : base.bed.waf;
    // The 10-m wind of this cell: the zone's, or adjusted for the relief (M8).
    const cw = this.cellWind;
    const wind10 = cw ? this.wind10mMs * cw.speedFactor[i] : this.wind10mMs;
    const windTo = cw ? (cw.fromDeg[i] + 180) % 360 : this.windToDeg;
    const wind = wind10 * WIND_20FT_PER_10M * waf * this.windAdj;
    const h = headFire(
      base,
      wind,
      windTo,
      this.terrain.slopeTan[i],
      this.terrain.upslopeDeg[i],
      this.windLimit === 2 ? "revised" : this.windLimit !== 0,
    );
    let { ros, headDeg, eccentricity, windPart, slopePart } = h;
    let r0 = base.r0;
    // Intensity per unit of the rate in use: heat per area, over the calibration factor when the rate carries it.
    let adj = base.rosAdj ?? 1;
    const u10Kmh = wind10 * 3.6;
    // Open shrublands (M4): the empirical rate of Anderson et al. (2015) for wind and fuel, with Rothermel's slope
    // effect relative to its calm-wind rate, added as a vector as in Rothermel. Rothermel still decides whether the
    // fuel burns at all (moisture of extinction). Of the calibration, only the shrub group's own factor
    // (rosAdjShrub) applies, so the calibration can tune the model; 1 = the published rate. It takes the measured
    // 10-m wind, so windAdj (a midflame wind factor for Rothermel) does not apply.
    if (this.terrainOptions.shrubModel === 1 && base.bed.params.group === "V" && h.ros > 0) {
      const height = base.bed.params.depthM;
      const deadPct = base.d1 * 100;
      const calm = andersonShrubRate(0, height, deadPct) * (base.groupAdj ?? 1);
      const phiW = andersonShrubRate(u10Kmh, height, deadPct) / andersonShrubRate(0, height, deadPct) - 1;
      const phiS = base.bed.slopeK * this.terrain.slopeTan[i] * this.terrain.slopeTan[i];
      const wr = (windTo * Math.PI) / 180;
      const sr = (this.terrain.upslopeDeg[i] * Math.PI) / 180;
      const x = phiW * Math.sin(wr) + phiS * Math.sin(sr);
      const y = phiW * Math.cos(wr) + phiS * Math.cos(sr);
      const phiE = Math.hypot(x, y);
      headDeg = phiE > 0 ? ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360 : this.terrain.upslopeDeg[i];
      const head = (headDeg * Math.PI) / 180;
      r0 = calm;
      ros = calm * (1 + phiE);
      windPart = phiW * Math.cos(wr - head);
      slopePart = phiS * Math.cos(sr - head);
      adj = base.groupAdj ?? 1; // intensity from the uncalibrated rate, as for Rothermel
    }
    // Fire shape (M4): length-to-breadth from the 10-m wind, forest curve under trees, grassland curve in the open.
    if (this.terrainOptions.shapeModel === 1) {
      const lb = lengthToBreadthTaylor(u10Kmh, base.bed.params.group === "F" || base.bed.params.group === "M");
      eccentricity = Math.sqrt(lb * lb - 1) / lb;
    }
    const rad = (headDeg * Math.PI) / 180;
    this.ros[i] = ros;
    this.r0[i] = r0;
    this.windPart[i] = windPart;
    this.slopePart[i] = slopePart;
    this.headRad[i] = rad;
    this.cosHead[i] = Math.cos(rad);
    this.sinHead[i] = Math.sin(rad);
    this.ecc[i] = eccentricity;
    this.intensityPerRate[i] = h.ros > 0 ? h.intensityKwM / h.ros / adj : 0;
    const surfaceKwM = h.intensityKwM / adj;
    // Crown fire: where there are trees (canopy layer ≥ 30% cover, or no data), an intense enough
    // surface fire climbs into the crowns and spreads at the crown rate if that is faster. The shape
    // (eccentricity) stays the surface fire's.
    const canopy = base.bed.params.crown;
    if (this.crown.enabled && canopy && h.ros > 0 && !(cover !== undefined && cover <= 100 && cover < CROWN_MIN_COVER_PCT)) {
      const c = crownFire(canopy, surfaceKwM, wind10 * 3.6, base.d1 * 100, this.crown.rateAdj);
      if (c && c.rate > h.ros) {
        this.ros[i] = c.rate;
        this.crowning[i] = 1;
        // Physical intensity at Cruz's rate (c.rate / rateAdj): the surface and the canopy fuel both burn
        // at it. Per unit of the adjusted rate in use, that is their heat per unit rate over rateAdj.
        const heatPerRate = h.intensityKwM / h.ros + c.extraIntensityPerRate;
        this.intensityPerRate[i] = heatPerRate / (this.crown.rateAdj > 0 ? this.crown.rateAdj : 1);
      }
    }
  }
}
