// Line ends that rest on something the fire cannot go around: a road, a river, water, an area with no fuel, or the edge
// of the simulated zone. place_intervention stretches open lines to such a spot; check_plan flags the ends that do not
// reach one. Pure functions, tested in Node.
import { isBurnable, projectedToGrid, type GridData, type ProjectedPoint } from "@linha-zero/engine";
import { gridPoint } from "./places";

/** How far an end may be stretched to find support. */
export const ANCHOR_MAX_M = 1000;

/** What holds a line end at a cell (itself or a neighbour), in words; null when nothing does. */
export function anchorAt(grid: GridData, row: number, col: number): string | null {
  const { rows, cols } = grid.header;
  let found: string | null = null;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) return "o limite da zona simulada";
      const i = r * cols + c;
      // Barrier codes: 1 = water, 2 and up = a road or river that wide (docs/referencia/formato-grelha.md).
      if (grid.barrier[i] === 1) return "água";
      if (grid.barrier[i] > 1) return "uma estrada ou rio";
      if (!isBurnable(grid, i)) found = "uma zona sem combustível";
    }
  }
  return found;
}

export interface AnchoredLine {
  coords: ProjectedPoint[];
  /** What happened at each end, in words, for the assistant to report. */
  note: string;
}

/**
 * Stretches each end of a straight two-point line outward, along the line, to the first cell that anchors it, at most
 * `maxM` metres. An end with nothing within reach stays where it was.
 */
export function anchorLine(grid: GridData, coords: ProjectedPoint[], maxM = ANCHOR_MAX_M): AnchoredLine {
  const { header } = grid;
  if (coords.length !== 2) return { coords, note: "" };
  const [a, b] = coords.map(([x, y]) => projectedToGrid(header, x, y));
  // Grid points as (row, col), the line's direction in cells.
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return { coords, note: "" };
  const dir = { row: (b.y - a.y) / len, col: (b.x - a.x) / len };
  const steps = Math.floor(maxM / header.cellSize);

  const stretch = (from: { x: number; y: number }, sign: number) => {
    for (let k = 0; k <= steps; k++) {
      const row = from.y + sign * dir.row * k;
      const col = from.x + sign * dir.col * k;
      if (row < 0 || col < 0 || row >= header.rows || col >= header.cols) break;
      const what = anchorAt(grid, Math.floor(row), Math.floor(col));
      if (what) return { point: gridPoint(header, row, col), what, m: k * header.cellSize };
    }
    return null;
  };

  const ends = [stretch(a, -1), stretch(b, 1)];
  const out: ProjectedPoint[] = [ends[0]?.point ?? coords[0], ends[1]?.point ?? coords[1]];
  const words = ends.map((e) => (!e ? `sem apoio a menos de ${km(maxM)}` : e.m === 0 ? `apoiada em ${e.what}` : `prolongada ${km(e.m)} até ${e.what}`));
  const note = words[0] === words[1] ? `As duas pontas: ${words[0]}.` : `Pontas: ${words[0]}; ${words[1]}.`;
  return { coords: out, note };
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
