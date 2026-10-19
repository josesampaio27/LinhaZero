import type { GridData } from "@linha-zero/engine";

export interface PlaceStats {
  id: number;
  name: string;
  /** Centre, in grid cells (fractional). */
  row: number;
  col: number;
  buildings: number;
}

/** Centre and building count of every place that has cells in the grid. One pass over the grid. */
export function placeStats(grid: GridData): PlaceStats[] {
  const { rows, cols, villages } = grid.header;
  const sums = new Map<number, { r: number; c: number; n: number; b: number }>();
  for (let i = 0; i < rows * cols; i++) {
    const v = grid.village[i];
    if (!v) continue;
    const s = sums.get(v) ?? { r: 0, c: 0, n: 0, b: 0 };
    s.r += Math.floor(i / cols) + 0.5;
    s.c += (i % cols) + 0.5;
    s.n++;
    s.b += grid.buildings[i];
    sums.set(v, s);
  }
  return villages
    .filter((v) => sums.has(v.id))
    .map((v) => {
      const s = sums.get(v.id)!;
      return { id: v.id, name: v.name, row: s.r / s.n, col: s.c / s.n, buildings: s.b };
    });
}

/** "Em X" inside a place, otherwise "Perto de X (1,2 km)" for the nearest one; null if the grid has no places. */
export function describeCell(grid: GridData, places: PlaceStats[], row: number, col: number): string | null {
  const here = grid.header.villages.find((v) => v.id === grid.village[row * grid.header.cols + col]);
  if (here) return `Em ${here.name}`;
  let best: PlaceStats | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = Math.hypot(p.row - row - 0.5, p.col - col - 0.5);
    if (d < bestD) [best, bestD] = [p, d];
  }
  if (!best) return null;
  const km = (bestD * grid.header.cellSize) / 1000;
  return `Perto de ${best.name} (${km.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km)`;
}
