// Suggest a third decision (stage C, M10): containment lines across the fire's path to what it threatens, each
// added to a decision's own actions and simulated, keeping the ones that spare the most buildings, then the most
// area. No logistics (M9 is out of scope): the user says when a line can be ready and how wide it is, and only
// places the fire reaches after that minute are tried.
import { firePath } from "./explain";
import { rasterizePolyline } from "./geometry";
import { gridToProjected } from "./grid";
import { simulate } from "./simulate";
import type { ProjectedPoint } from "./scenario";
import type { Intervention, Metrics, PreparedGrid, Scenario } from "./types";

export interface SuggestOptions {
  /** Minute from which a new line holds (when it is ready on the ground). */
  readyMin: number;
  /** Width of the new line (m): what the crews could open by then. */
  widthM: number;
  /** Line lengths to try (m). */
  lengthsM?: number[];
  /** How many threatened places to aim at (earliest reached first). */
  targets?: number;
  /** How many suggestions to return. */
  top?: number;
}

export interface LineSuggestion {
  /** The line's two ends (EPSG:3763), ready to draw as a containment line. */
  coords: [ProjectedPoint, ProjectedPoint];
  startMin: number;
  widthM: number;
  lengthM: number;
  /** What it was aimed at: a place's name, or null for the head of the fire. */
  target: string | null;
  /** Where it crosses the fire's path (a cell): lines of different lengths at one crossing are alternatives. */
  crossing: number;
  /** Buildings reached and hectares burned at the end, with the line added. */
  metrics: Metrics;
  buildingsSaved: number;
  haSaved: number;
}

export interface SuggestResult {
  base: Metrics;
  suggestions: LineSuggestion[];
  /** Candidate lines simulated. */
  tried: number;
}

/** Fractions of the path's time window (after the line is ready) at which candidate lines cross it. */
const ALONG = [0.25, 0.5, 0.75];
/** A line needs this margin (min) between being ready and the fire arriving where it stands. */
const MARGIN_MIN = 15;

const finalHa = (m: Metrics) => m.burnedHaByHour[m.burnedHaByHour.length - 1] ?? 0;

/**
 * Candidate containment lines for `scenario` (one decision: its interventions stay, the new line is added), each
 * simulated without random draws. Returns the best `top` that spare buildings or area, best first.
 */
export function suggestLines(grid: PreparedGrid, scenario: Scenario, opts: SuggestOptions): SuggestResult {
  const { readyMin, widthM, lengthsM = [500, 1000, 2000], targets = 3, top = 3 } = opts;
  const { rows, cols, cellSize, villages } = grid.header;
  const plain: Scenario = { ...scenario, ensemble: undefined, explain: true };
  const base = simulate(grid, plain);
  const arrival = base.arrivalMin;
  const explain = base.explain;
  if (!explain) return { base: base.metrics, suggestions: [], tried: 0 };

  // What the fire threatens: the first cell of each place it reaches (earliest first), else the head of the fire.
  const aims: { cell: number; name: string | null }[] = [];
  const reached = base.metrics.villages.filter((v) => v.firstArrivalMin !== null).sort((a, b) => a.firstArrivalMin! - b.firstArrivalMin!);
  for (const v of reached.slice(0, targets)) {
    let best = -1;
    for (let i = 0; i < arrival.length; i++) if (grid.village[i] === v.id && (best < 0 || arrival[i] < arrival[best])) best = i;
    if (best >= 0) aims.push({ cell: best, name: villages.find((x) => x.id === v.id)?.name ?? null });
  }
  if (!aims.length) {
    let head = -1;
    for (let i = 0; i < arrival.length; i++) if (arrival[i] <= scenario.durationMin && (head < 0 || arrival[i] > arrival[head])) head = i;
    if (head >= 0) aims.push({ cell: head, name: null });
  }

  const tried: LineSuggestion[] = [];
  const seen = new Set<string>();
  for (const aim of aims) {
    const path = firePath(explain, arrival, aim.cell);
    // Path cells the fire reaches late enough for a line to be ready there first.
    const late = path.filter((c) => arrival[c] >= readyMin + MARGIN_MIN);
    if (late.length < 3) continue;
    const t0 = arrival[late[0]];
    const t1 = arrival[late[late.length - 1]];
    for (const f of ALONG) {
      const k = late.findIndex((c) => arrival[c] >= t0 + f * (t1 - t0));
      if (k < 0) continue;
      // Direction of the path around the crossing point, and the line across it.
      const a = late[Math.max(0, k - 2)];
      const b = late[Math.min(late.length - 1, k + 2)];
      const dx = (b % cols) - (a % cols);
      const dy = Math.floor(b / cols) - Math.floor(a / cols);
      const norm = Math.hypot(dx, dy);
      if (norm === 0) continue;
      const px = -dy / norm;
      const py = dx / norm;
      const cx = (late[k] % cols) + 0.5;
      const cy = Math.floor(late[k] / cols) + 0.5;
      for (const lengthM of lengthsM) {
        const half = lengthM / 2 / cellSize;
        const ends = [
          { x: cx - px * half, y: cy - py * half },
          { x: cx + px * half, y: cy + py * half },
        ];
        // A line cannot be opened where the fire already is when it should be ready.
        const cells = rasterizePolyline(ends, rows, cols).filter(({ row, col }) => !(arrival[row * cols + col] < readyMin));
        if (cells.length < 2) continue;
        const key = cells.map((c) => c.row * cols + c.col).sort((x, y) => x - y).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const line: Intervention = { kind: "containmentLine", cells, startMin: readyMin, widthM };
        const r = simulate(grid, { ...plain, explain: false, interventions: [...scenario.interventions, line] });
        const p = ends.map((e) => gridToProjected(grid.header, e.x, e.y));
        tried.push({
          coords: [
            [p[0].x, p[0].y],
            [p[1].x, p[1].y],
          ],
          startMin: readyMin,
          widthM,
          lengthM,
          target: aim.name,
          crossing: late[k],
          metrics: r.metrics,
          buildingsSaved: base.metrics.buildingsReached - r.metrics.buildingsReached,
          haSaved: finalHa(base.metrics) - finalHa(r.metrics),
        });
      }
    }
  }
  // Worth suggesting: it spares a building, or at least 10 cells and 2% of the area that burns.
  const cellHa = (cellSize * cellSize) / 10_000;
  const minHa = Math.max(10 * cellHa, 0.02 * finalHa(base.metrics));
  // Most buildings spared, then most area; at equal gain the shorter line (less work). One line per crossing point.
  const useful = tried
    .filter((s) => s.buildingsSaved > 0 || s.haSaved >= minHa)
    .sort((x, y) => y.buildingsSaved - x.buildingsSaved || y.haSaved - x.haSaved || x.lengthM - y.lengthM);
  const crossings = new Set<number>();
  const best = useful.filter((s) => !crossings.has(s.crossing) && crossings.add(s.crossing));
  return { base: base.metrics, suggestions: best.slice(0, top), tried: tried.length };
}
