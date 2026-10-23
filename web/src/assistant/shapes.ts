// Where an action the assistant asks for goes on the map. The assistant names a place and a shape; these functions
// turn them into the drawn coordinates (EPSG:3763), from the fire's own path, so the model never writes coordinates
// (docs/decisoes/0079). Pure functions, tested in Node.
import { firePath, type GridHeader, type ProjectedPoint } from "@linha-zero/engine";
import type { FireRun } from "./context";
import { gridPoint, type NamedPlace } from "./places";

export type ShapeName = "across_path" | "fire_head" | "around_place" | "between_places";

export interface ShapeRequest {
  shape: ShapeName;
  /** A line (containment line, backfire, aerial drop) or a zone (attack, protected zone). */
  line: boolean;
  place: NamedPlace;
  /** The cells of `place` (its houses), for the path and the ring. */
  placeCells: number[];
  toPlace?: NamedPlace;
  /** The fire's arrival minute that picks the spot on its path (across_path, fire_head). */
  minute?: number;
  startMin: number;
  lengthM?: number;
  radiusM?: number;
}

export interface ShapeResult {
  coords: ProjectedPoint[];
  /** Where it ended up, in words, for the assistant to report. */
  where: string;
}

const DEFAULT_LENGTH_M = 1000;
const DEFAULT_HEAD_LENGTH_M = 500;
const DEFAULT_RADIUS_M = 300;
/** Cells on each side used for the direction of the path at a point: smooths the 16 step directions. */
const DIRECTION_SPAN = 3;

const fmtMin = (m: number) => `${Math.round(m)} min`;

/**
 * The fire's path to the first cell of the place it reaches, from a run of the decision without the new action:
 * cells from the ignition to the place. An error when the fire does not get there.
 */
export function pathToPlace(run: FireRun, cells: number[], placeName: string, durationMin: number): { path: number[] } | { error: string } {
  let target = -1;
  let first = Infinity;
  for (const c of cells) {
    if (run.arrivalMin[c] < first) {
      first = run.arrivalMin[c];
      target = c;
    }
  }
  if (target < 0 || !(first <= durationMin)) {
    return { error: `Nesta decisão o fogo não chega a ${placeName} em ${fmtMin(durationMin)}: não há caminho do fogo onde pôr a ação.` };
  }
  const path = firePath(run.explain, run.arrivalMin, target);
  if (path.length < 2) return { error: `${placeName} está na ignição: escolher um lugar mais à frente do fogo.` };
  return { path };
}

/** Builds the coordinates of a shape; an error message (Portuguese, for the assistant) when it cannot. */
export function buildShape(header: GridHeader, req: ShapeRequest, run: FireRun | null, durationMin: number): ShapeResult | { error: string } {
  const cellsOf = (m: number) => m / header.cellSize;
  switch (req.shape) {
    case "between_places": {
      if (!req.line) return { error: "between_places só serve para linhas (contenção, contrafogo, descarga aérea)." };
      if (!req.toPlace) return { error: "between_places precisa de to_place." };
      const a = req.place;
      const b = req.toPlace;
      const lengthM = Math.hypot(a.row - b.row, a.col - b.col) * header.cellSize;
      if (lengthM < header.cellSize) return { error: "Os dois lugares estão no mesmo sítio." };
      return {
        coords: [gridPoint(header, a.row, a.col), gridPoint(header, b.row, b.col)],
        where: `Linha reta de ${a.name} a ${b.name}, com ${km(lengthM)}.`,
      };
    }
    case "around_place": {
      const margin = cellsOf(req.radiusM ?? DEFAULT_RADIUS_M);
      // The farthest house from the centre, plus the margin: a circle that holds the whole place.
      let reach = 0;
      for (const c of req.placeCells) {
        const r = Math.floor(c / header.cols) + 0.5;
        const col = (c % header.cols) + 0.5;
        reach = Math.max(reach, Math.hypot(r - req.place.row, col - req.place.col));
      }
      const radius = reach + margin;
      const ring = circle(header, req.place.row, req.place.col, radius);
      return {
        coords: req.line ? [...ring, ring[0]] : ring,
        where: `${req.line ? "Anel" : "Zona"} à volta de ${req.place.name}, com ${km(radius * header.cellSize)} de raio.`,
      };
    }
    case "across_path":
    case "fire_head": {
      if (!run) return { error: "Falta a corrida do fogo para encontrar o caminho." };
      const found = pathToPlace(run, req.placeCells, req.place.name, durationMin);
      if ("error" in found) return found;
      const { path } = found;
      const arrival = run.arrivalMin[path[path.length - 1]];
      if (arrival <= req.startMin) {
        return {
          error: `O fogo chega a ${req.place.name} aos ${fmtMin(arrival)}, antes de a ação começar (aos ${fmtMin(req.startMin)}). Começar mais cedo ou escolher outro lugar.`,
        };
      }
      // Default: halfway in time between the start and the fire reaching the place, so the action is ready in time.
      const minute = req.minute ?? req.startMin + (arrival - req.startMin) / 2;
      // The first cell of the path the fire reaches at that minute; never the place itself.
      let k = path.findIndex((c) => run.arrivalMin[c] >= minute);
      if (k < 0) k = path.length - 1;
      k = Math.max(1, Math.min(k, path.length - 2));
      const at = path[k];
      const atMin = run.arrivalMin[at];
      const row = Math.floor(at / header.cols) + 0.5;
      const col = (at % header.cols) + 0.5;
      // Direction of the fire there: from a few cells before to a few cells after.
      const from = path[Math.max(0, k - DIRECTION_SPAN)];
      const to = path[Math.min(path.length - 1, k + DIRECTION_SPAN)];
      let dr = Math.floor(to / header.cols) - Math.floor(from / header.cols);
      let dc = (to % header.cols) - (from % header.cols);
      const norm = Math.hypot(dr, dc) || 1;
      dr /= norm;
      dc /= norm;
      const late = atMin < req.startMin ? ` Atenção: o fogo passa ali aos ${fmtMin(atMin)}, antes de a ação começar.` : "";
      const spot = `no caminho do fogo até ${req.place.name}, onde o fogo passa aos ${fmtMin(atMin)} (até ${req.place.name}: ${fmtMin(arrival)})`;
      if (req.line) {
        const lengthM = req.lengthM ?? (req.shape === "fire_head" ? DEFAULT_HEAD_LENGTH_M : DEFAULT_LENGTH_M);
        const half = cellsOf(lengthM) / 2;
        // Perpendicular to the fire's direction: (dr, dc) turned a quarter.
        const a = gridPoint(header, row - dc * half, col + dr * half);
        const b = gridPoint(header, row + dc * half, col - dr * half);
        return { coords: [a, b], where: `Linha de ${km(lengthM)} atravessada ${spot}.${late}` };
      }
      const radiusM = req.radiusM ?? DEFAULT_RADIUS_M;
      if (req.shape === "fire_head") {
        return { coords: circle(header, row, col, cellsOf(radiusM)), where: `Zona com ${km(radiusM)} de raio ${spot}.${late}` };
      }
      // A band across the path: as long as asked, as deep as the radius.
      const half = cellsOf(req.lengthM ?? DEFAULT_LENGTH_M) / 2;
      const depth = cellsOf(radiusM) / 2;
      const corner = (side: number, along: number) => gridPoint(header, row - dc * half * side + dr * depth * along, col + dr * half * side + dc * depth * along);
      return {
        coords: [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)],
        where: `Faixa de ${km(req.lengthM ?? DEFAULT_LENGTH_M)} atravessada ${spot}.${late}`,
      };
    }
  }
}

/** A 16-sided ring around a grid point (radius in cells). */
function circle(header: GridHeader, row: number, col: number, radius: number): ProjectedPoint[] {
  const n = 16;
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return gridPoint(header, row + radius * Math.sin(a), col + radius * Math.cos(a));
  });
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
