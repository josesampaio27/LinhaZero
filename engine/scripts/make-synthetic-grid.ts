// Generates web/public/grids/sintetica/: a 150x150 grid of 100 m cells with a hill, a river valley,
// a road, shrub and forest patches and two villages. Deterministic (fixed seed). It is a test grid: the engine tests,
// the benchmark and infra/smoke.sh use it, but it is not listed in grids/index.json, so the app, the API and ingest
// do not offer it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rasterizePolyline, type GridPoint } from "../src/geometry";
import { createRng } from "../src/random";
import type { GridHeader } from "../src/types";
import { readFileSync } from "node:fs";
const FUEL_PARAMS = JSON.parse(readFileSync(new URL("../test/fixtures/fuel-params.json", import.meta.url), "utf8"));

const ROWS = 150;
const COLS = 150;
const CELL = 100;
const NAME = "sintetica";
// Somewhere east of Guimarães, in PT-TM06 metres (north-west corner).
const ORIGIN_X = -17500;
const ORIGIN_Y = 207500;

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../../web/public/grids", NAME);

const FUEL = { none: 0, grass: 1, shrub: 2, forest: 3, farm: 4 } as const;

const rng = createRng(2035);
const n = ROWS * COLS;
const idx = (r: number, c: number) => r * COLS + c;

/** Smooth value noise in [0, 1) built from a coarse random lattice, bilinearly interpolated. */
function valueNoise(scaleCells: number): Float32Array {
  const lr = Math.ceil(ROWS / scaleCells) + 2;
  const lc = Math.ceil(COLS / scaleCells) + 2;
  const lattice = Array.from({ length: lr * lc }, () => rng());
  const out = new Float32Array(n);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const fy = r / scaleCells, fx = c / scaleCells;
      const y0 = Math.floor(fy), x0 = Math.floor(fx);
      const ty = fy - y0, tx = fx - x0;
      const sy = ty * ty * (3 - 2 * ty), sx = tx * tx * (3 - 2 * tx);
      const v00 = lattice[y0 * lc + x0], v01 = lattice[y0 * lc + x0 + 1];
      const v10 = lattice[(y0 + 1) * lc + x0], v11 = lattice[(y0 + 1) * lc + x0 + 1];
      out[idx(r, c)] = (v00 * (1 - sx) + v01 * sx) * (1 - sy) + (v10 * (1 - sx) + v11 * sx) * sy;
    }
  }
  return out;
}

// River: winding north-south line in the west third of the grid.
const riverCol = (r: number) => 38 + 7 * Math.sin(r / 18) + 3 * Math.sin(r / 7);
// Road: east-west from the river bridge to the east edge, in the south.
const roadRow = (c: number) => 118 + 4 * Math.sin(c / 15);

// --- Elevation (metres) ---
const elevation = new Float32Array(n);
const roughness = valueNoise(12);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const hill = 380 * Math.exp(-((r - 45) ** 2 + (c - 98) ** 2) / (2 * 20 ** 2));
    const ridge = 120 * Math.exp(-((r - 110) ** 2 + (c - 20) ** 2) / (2 * 25 ** 2));
    const valley = -90 * Math.exp(-((c - riverCol(r)) ** 2) / (2 * 9 ** 2));
    const tilt = 0.6 * (ROWS - r); // gentle rise to the north
    elevation[idx(r, c)] = 220 + hill + ridge + valley + tilt + 40 * (roughness[idx(r, c)] - 0.5);
  }
}

// --- Barriers: river (2 cells wide) and road, rasterized 4-connected ---
const barrier = new Uint8Array(n);
const mark = (pts: GridPoint[]) => {
  for (const cell of rasterizePolyline(pts, ROWS, COLS)) barrier[idx(cell.row, cell.col)] = 1;
};
const riverPts: GridPoint[] = [];
for (let r = -1; r <= ROWS + 1; r += 2) riverPts.push({ x: riverCol(r) + 0.5, y: r });
mark(riverPts);
mark(riverPts.map((p) => ({ x: p.x + 1, y: p.y })));
const roadPts: GridPoint[] = [];
for (let c = Math.floor(riverCol(118)); c <= COLS + 1; c += 2) roadPts.push({ x: c, y: roadRow(c) + 0.5 });
mark(roadPts);

// --- Villages: burnable farmland with scattered buildings ---
const villages = [
  { id: 1, name: "Souto do Monte", row: 30, col: 128, radius: 6 },
  { id: 2, name: "Vila Fria", row: 92, col: 72, radius: 5 },
];
const buildings = new Uint16Array(n);
const village = new Uint16Array(n);
const farmMask = new Uint8Array(n);
for (const v of villages) {
  for (let r = v.row - v.radius * 2; r <= v.row + v.radius * 2; r++) {
    for (let c = v.col - v.radius * 2; c <= v.col + v.radius * 2; c++) {
      if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
      const d = Math.hypot(r - v.row, c - v.col);
      const i = idx(r, c);
      if (d <= v.radius * 2) farmMask[i] = 1;
      if (d <= v.radius && barrier[i] === 0 && rng() < 0.8 - (0.5 * d) / v.radius) {
        buildings[i] = 1 + Math.floor(rng() * (d < v.radius / 2 ? 8 : 4));
        village[i] = v.id;
      }
    }
  }
}

// --- Fuel ---
const fuel = new Uint8Array(n);
const patches = valueNoise(9);
const grassNoise = valueNoise(6);
for (let i = 0; i < n; i++) {
  if (barrier[i] === 1) fuel[i] = FUEL.none;
  else if (farmMask[i] === 1) fuel[i] = FUEL.farm;
  else if ((elevation[i] > 470 && patches[i] > 0.35) || patches[i] > 0.7) fuel[i] = FUEL.forest;
  else if (grassNoise[i] > 0.72) fuel[i] = FUEL.grass;
  else fuel[i] = FUEL.shrub;
}

// --- Write ---
const header: GridHeader = {
  name: NAME,
  crs: "EPSG:3763",
  originX: ORIGIN_X,
  originY: ORIGIN_Y,
  cellSize: CELL,
  rows: ROWS,
  cols: COLS,
  layers: {
    fuel: "fuel.u8",
    elevation: "elevation.f32",
    barrier: "barrier.u8",
    buildings: "buildings.u16",
    village: "village.u16",
  },
  villages: villages.map(({ id, name }) => ({ id, name })),
  // Illustrative values, to be replaced by the real table derived from the FUMOD map.
  // Rothermel parameters of FUMOD models (the only spread model of the app): herbáceo → V-Ha,
  // mato → V-MAa, folhada → F-EUC, agrícola → V-Hb.
  fuelTable: {
    0: { label: "Não ardível", baseRate: 0 },
    1: { label: "Herbáceo", baseRate: 15, rothermel: FUEL_PARAMS["231"].rothermel },
    2: { label: "Mato", baseRate: 8, rothermel: FUEL_PARAMS["233"].rothermel },
    3: { label: "Floresta (folhada)", baseRate: 3, rothermel: FUEL_PARAMS["211"].rothermel },
    4: { label: "Agrícola", baseRate: 4, rothermel: FUEL_PARAMS["232"].rothermel },
  },
};

mkdirSync(outDir, { recursive: true });
const write = (file: string, arr: ArrayBufferView) =>
  writeFileSync(join(outDir, file), new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
write(header.layers.fuel, fuel);
write(header.layers.elevation, elevation);
write(header.layers.barrier, barrier);
write(header.layers.buildings, buildings);
write(header.layers.village, village);
writeFileSync(join(outDir, "header.json"), JSON.stringify(header, null, 2));

const totalBuildings = buildings.reduce((a, b) => a + b, 0);
console.log(`Grelha "${NAME}" escrita em ${outDir}: ${ROWS}x${COLS}, ${totalBuildings} edifícios.`);
