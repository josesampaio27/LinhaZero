import { prepareGrid } from "../src/grid";
import type { FuelParams } from "../src/rothermel";
import type { GridData, PreparedGrid, Scenario } from "../src/types";

export interface TestGridOptions {
  rows: number;
  cols: number;
  cellSize?: number;
  /** Elevation in metres for each cell (default flat). */
  elevation?: (r: number, c: number) => number;
  barrier?: (r: number, c: number) => boolean;
  buildings?: (r: number, c: number) => number;
  village?: (r: number, c: number) => number;
  /** Base rate of the single burnable fuel, m/min. */
  baseRate?: number;
  /** Rothermel parameters of the single burnable fuel. */
  rothermel?: FuelParams;
  /** Tree canopy cover, % (adds the optional canopy layer). */
  canopy?: (r: number, c: number) => number;
}

/** Builds a uniform-fuel test grid. */
export function makeGrid(o: TestGridOptions): PreparedGrid {
  const n = o.rows * o.cols;
  const grid: GridData = {
    header: {
      name: "test",
      crs: "EPSG:3763",
      originX: 0,
      originY: 0,
      cellSize: o.cellSize ?? 10,
      rows: o.rows,
      cols: o.cols,
      layers: { fuel: "", elevation: "", barrier: "", buildings: "", village: "" },
      villages: [{ id: 1, name: "Aldeia" }],
      fuelTable: { 0: { label: "Não combustível", baseRate: 0 }, 1: { label: "Mato", baseRate: o.baseRate ?? 8, rothermel: o.rothermel } },
    },
    fuel: new Uint8Array(n).fill(1),
    elevation: new Float32Array(n),
    barrier: new Uint8Array(n),
    buildings: new Uint16Array(n),
    village: new Uint16Array(n),
  };
  if (o.canopy) {
    grid.header.layers.canopy = "";
    grid.canopy = new Uint8Array(n);
  }
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const i = r * o.cols + c;
      if (o.elevation) grid.elevation[i] = o.elevation(r, c);
      if (o.barrier?.(r, c)) grid.barrier[i] = 1;
      if (o.buildings) grid.buildings[i] = o.buildings(r, c);
      if (o.village) grid.village[i] = o.village(r, c);
      if (grid.canopy && o.canopy) grid.canopy[i] = o.canopy(r, c);
    }
  }
  return prepareGrid(grid);
}

export function scenario(partial: Partial<Scenario> & Pick<Scenario, "ignition">): Scenario {
  return { wind: { directionDeg: 0, speedMs: 0 }, durationMin: 60, interventions: [], ...partial };
}

/** Number of burned cells from the ignition along a direction (dr, dc) until the first unburned one. */
export function reach(arrival: Float32Array, cols: number, r0: number, c0: number, dr: number, dc: number, rows = cols): number {
  let k = 0;
  for (;;) {
    const r = r0 + dr * (k + 1), c = c0 + dc * (k + 1);
    if (r < 0 || c < 0 || r >= rows || c >= cols || !Number.isFinite(arrival[r * cols + c])) return k;
    k++;
  }
}
