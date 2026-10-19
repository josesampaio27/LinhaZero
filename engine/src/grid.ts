import type { CellRef, GridData, GridHeader, LayerBuffers, LayerName, PreparedGrid, RequiredLayerName } from "./types";

/** Layers every grid has, in hashing order. */
export const LAYER_NAMES: RequiredLayerName[] = ["fuel", "elevation", "barrier", "buildings", "village"];
/** Layers a grid may have; they come after the required ones, in this order. */
export const OPTIONAL_LAYER_NAMES = ["canopy"] as const;

/** The layers of a grid: the required ones, then the optional ones its header lists. */
export function gridLayerNames(header: GridHeader): LayerName[] {
  return [...LAYER_NAMES, ...OPTIONAL_LAYER_NAMES.filter((name) => header.layers[name] !== undefined)];
}

/** Decodes the raw little-endian layer buffers of a grid into typed arrays, checking their sizes. */
export function decodeGrid(header: GridHeader, buffers: LayerBuffers): GridData {
  const n = header.rows * header.cols;
  const check = <T extends { length: number }>(name: LayerName, arr: T): T => {
    if (arr.length !== n) {
      throw new Error(`Layer "${name}" has ${arr.length} values, expected ${n}`);
    }
    return arr;
  };
  return {
    header,
    fuel: check("fuel", new Uint8Array(buffers.fuel)),
    elevation: check("elevation", new Float32Array(buffers.elevation)),
    barrier: check("barrier", new Uint8Array(buffers.barrier)),
    buildings: check("buildings", new Uint16Array(buffers.buildings)),
    village: check("village", new Uint16Array(buffers.village)),
    ...(header.layers.canopy !== undefined && {
      canopy: check("canopy", new Uint8Array(required(buffers.canopy, "canopy"))),
    }),
  };
}

function required(buf: ArrayBuffer | undefined, name: LayerName): ArrayBuffer {
  if (!buf) throw new Error(`Layer "${name}" is listed in the header but was not loaded`);
  return buf;
}

/** Whether a cell can burn: no barrier or road on it, and a fuel that burns. */
export function isBurnable(grid: GridData, i: number): boolean {
  return grid.barrier[i] === 0 && (grid.header.fuelTable[grid.fuel[i]]?.baseRate ?? 0) > 0;
}

/**
 * The burnable cell nearest to `cell` within `maxDistanceM` (the cell itself if it burns), or null.
 * An ignition clicked on a road, a river or a non-burnable patch moves there (a fire on a road burns
 * the verge next to it).
 */
export function nearestBurnable(grid: GridData, cell: CellRef, maxDistanceM = 200): CellRef | null {
  const { rows, cols, cellSize } = grid.header;
  if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols) return null;
  if (isBurnable(grid, cell.row * cols + cell.col)) return cell;
  const reach = Math.floor(maxDistanceM / cellSize);
  let best: CellRef | null = null,
    bestD = Infinity;
  for (let dr = -reach; dr <= reach; dr++)
    for (let dc = -reach; dc <= reach; dc++) {
      const r = cell.row + dr,
        c = cell.col + dc,
        d = dr * dr + dc * dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols || d >= bestD || d * cellSize * cellSize > maxDistanceM * maxDistanceM) continue;
      if (isBurnable(grid, r * cols + c)) {
        best = { row: r, col: c };
        bestD = d;
      }
    }
  return best;
}

/** Derives the per-cell base spread rate (m/min) for simulation; the spread step reads elevation directly. */
export function prepareGrid(grid: GridData): PreparedGrid {
  const { rows, cols, fuelTable } = grid.header;
  const n = rows * cols;
  const baseRate = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (grid.barrier[i] !== 0) continue; // 1 = barrier; 2-255 = breakable strip (road) of that many metres
    const entry = fuelTable[grid.fuel[i]];
    baseRate[i] = entry ? Math.max(0, entry.baseRate) : 0;
  }
  return { ...grid, baseRate };
}

/**
 * Computes slope (degrees) and downslope aspect (degrees clockwise from north) from
 * elevation (metres) using Horn's method, clamping at the grid edges.
 */
export function computeSlopeAspect(
  elevation: Float32Array,
  rows: number,
  cols: number,
  cellSize: number,
): { slopeDeg: Float32Array; aspectDeg: Float32Array } {
  const slopeDeg = new Float32Array(rows * cols);
  const aspectDeg = new Float32Array(rows * cols);
  const z = (r: number, c: number) =>
    elevation[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = z(r - 1, c - 1), b = z(r - 1, c), cc = z(r - 1, c + 1);
      const d = z(r, c - 1), f = z(r, c + 1);
      const g = z(r + 1, c - 1), h = z(r + 1, c), k = z(r + 1, c + 1);
      const dzEast = (cc + 2 * f + k - (a + 2 * d + g)) / (8 * cellSize);
      const dzNorth = (a + 2 * b + cc - (g + 2 * h + k)) / (8 * cellSize);
      const i = r * cols + c;
      slopeDeg[i] = (Math.atan(Math.hypot(dzEast, dzNorth)) * 180) / Math.PI;
      const asp = (Math.atan2(-dzEast, -dzNorth) * 180) / Math.PI;
      aspectDeg[i] = asp < 0 ? asp + 360 : asp;
    }
  }
  return { slopeDeg, aspectDeg };
}

/** Converts projected coordinates (metres, EPSG:3763) to fractional grid coordinates (cell units). */
export function projectedToGrid(header: GridHeader, x: number, y: number): { x: number; y: number } {
  return { x: (x - header.originX) / header.cellSize, y: (header.originY - y) / header.cellSize };
}

/** Converts fractional grid coordinates (cell units) to projected coordinates (metres, EPSG:3763). */
export function gridToProjected(header: GridHeader, gx: number, gy: number): { x: number; y: number } {
  return { x: header.originX + gx * header.cellSize, y: header.originY - gy * header.cellSize };
}
