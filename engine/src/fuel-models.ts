import type { FuelParams } from "./rothermel";

// Anderson (1982) 13 fire behaviour fuel models, as tabulated in BehavePlus. Kept in the published
// units (tons/acre, ft, 1/ft, %) so they can be checked against the source at a glance.
// FUMOD uses NFFL 4 and NFFL 11 directly; the rest serve as tests and references.

const TONS_ACRE_TO_KG_M2 = 0.22417;
const PER_FT_TO_PER_M = 1 / 0.3048;
const FT_TO_M = 0.3048;
const STANDARD_HEAT_KJ_KG = 18608; // 8000 Btu/lb
const SAV_10H = 109; // 1/ft
const SAV_100H = 30; // 1/ft

/** [1 h, 10 h, 100 h, live herbaceous, live woody] loads (t/ac), depth (ft), 1 h SAV (1/ft), live SAV (1/ft), Mx (%). */
type Row = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const ANDERSON_ROWS: Record<number, Row> = {
  1: [0.74, 0, 0, 0, 0, 1.0, 3500, 1500, 12],
  2: [2.0, 1.0, 0.5, 0.5, 0, 1.0, 3000, 1500, 15],
  3: [3.01, 0, 0, 0, 0, 2.5, 1500, 1500, 25],
  4: [5.01, 4.01, 2.0, 0, 5.01, 6.0, 2000, 1500, 20],
  5: [1.0, 0.5, 0, 0, 2.0, 2.0, 2000, 1500, 20],
  6: [1.5, 2.5, 2.0, 0, 0, 2.5, 1750, 1500, 25],
  7: [1.13, 1.87, 1.5, 0, 0.37, 2.5, 1750, 1550, 40],
  8: [1.5, 1.0, 2.5, 0, 0, 0.2, 2000, 1500, 30],
  9: [2.92, 0.41, 0.15, 0, 0, 0.2, 2500, 1500, 25],
  10: [3.01, 2.0, 5.01, 0, 2.0, 1.0, 2000, 1500, 25],
  11: [1.5, 4.51, 5.51, 0, 0, 1.0, 1500, 1500, 15],
  12: [4.01, 14.03, 16.53, 0, 0, 2.3, 1500, 1500, 20],
  13: [7.01, 23.04, 28.05, 0, 0, 3.0, 1500, 1500, 25],
};

function fromRow([
  w1,
  w10,
  w100,
  wh,
  ww,
  depthFt,
  sav1,
  savLive,
  mx,
]: Row): FuelParams {
  const t = TONS_ACRE_TO_KG_M2;
  const s = PER_FT_TO_PER_M;
  return {
    depthM: depthFt * FT_TO_M,
    deadMoistExt: mx / 100,
    heatKjKg: STANDARD_HEAT_KJ_KG,
    load: [w1 * t, w10 * t, w100 * t, wh * t, ww * t],
    sav: [sav1 * s, SAV_10H * s, SAV_100H * s, savLive * s, savLive * s],
  };
}

/** Anderson (1982) fuel models 1–13 in SI units, keyed by model number. */
export const ANDERSON_13: Readonly<Record<number, FuelParams>> =
  Object.fromEntries(
    Object.entries(ANDERSON_ROWS).map(([k, row]) => [Number(k), fromRow(row)]),
  );
