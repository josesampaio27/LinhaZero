// Places by name for the assistant: it names villages, the app finds their cells. Pure functions, tested in Node.
import type { GridData, GridHeader, ProjectedPoint } from "@linha-zero/engine";
import { gridToProjected, projectedToGrid } from "@linha-zero/engine";
import type { PlaceStats } from "../lib/places";

/** The name the assistant uses for the ignition point, accepted wherever a place is. */
export const IGNITION = "ignição";

/** Lower case, no accents, single spaces: "São Tomé " and "sao  tome" match. */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A place the assistant can name: a village of the grid, or the ignition. Centre in grid cells (fractional). */
export interface NamedPlace {
  name: string;
  id: number | null;
  row: number;
  col: number;
  buildings: number;
}

/**
 * The place a name refers to: an exact match first, then a single place whose name contains it or starts its words
 * with it. An error lists what matched when the name is ambiguous or unknown.
 */
export function resolvePlace(
  name: string,
  places: PlaceStats[],
  header: GridHeader,
  ignition: ProjectedPoint | null,
): { place: NamedPlace } | { error: string } {
  const query = normalize(name);
  if (!query) return { error: "Falta o nome do lugar." };
  if (query === normalize(IGNITION) || query === "ignicao do fogo" || query === "ponto de ignicao") {
    if (!ignition) return { error: "Ainda não há ignição." };
    const p = projectedToGrid(header, ignition[0], ignition[1]);
    return { place: { name: IGNITION, id: null, row: p.y, col: p.x, buildings: 0 } };
  }
  const exact = places.filter((p) => normalize(p.name) === query);
  if (exact.length === 1) return { place: exact[0] };
  const partial = exact.length > 1 ? exact : places.filter((p) => normalize(p.name).includes(query));
  if (partial.length === 1) return { place: partial[0] };
  if (partial.length > 1) {
    const names = partial.slice(0, 8).map((p) => p.name).join(", ");
    return { error: `"${name}" corresponde a vários lugares: ${names}${partial.length > 8 ? "…" : ""}. Usar o nome completo.` };
  }
  return { error: `Não há nenhum lugar "${name}" nesta zona. Usar find_places para ver os nomes.` };
}

/** The cells of a place (its village id), or the one cell of the ignition. */
export function placeCells(grid: GridData, place: NamedPlace): number[] {
  const { cols } = grid.header;
  if (place.id === null) return [Math.floor(place.row) * cols + Math.floor(place.col)];
  const cells: number[] = [];
  for (let i = 0; i < grid.village.length; i++) if (grid.village[i] === place.id) cells.push(i);
  return cells;
}

const COMPASS = ["norte", "nordeste", "este", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];

/** "2,3 km a nordeste": distance and direction from one grid point to another. */
export function distanceAndDirection(header: GridHeader, from: { row: number; col: number }, to: { row: number; col: number }): string {
  const dx = to.col - from.col;
  const dy = from.row - to.row; // rows grow southwards
  const km = (Math.hypot(dx, dy) * header.cellSize) / 1000;
  if (km < 0.05) return "no mesmo sítio";
  const bearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return `${km.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km a ${COMPASS[Math.round(bearing / 45) % 8]}`;
}

/** The centre of a cell, in EPSG:3763 metres. */
export function cellCentre(header: GridHeader, cell: number): ProjectedPoint {
  const p = gridToProjected(header, (cell % header.cols) + 0.5, Math.floor(cell / header.cols) + 0.5);
  return [Math.round(p.x), Math.round(p.y)];
}

/** A point given in grid cells (fractional), in EPSG:3763 metres. */
export function gridPoint(header: GridHeader, row: number, col: number): ProjectedPoint {
  const p = gridToProjected(header, col, row);
  return [Math.round(p.x), Math.round(p.y)];
}
