// Places by name for the assistant: it names villages, the ignition, the fire's head or flanks, or a point some
// distance from one of them; the app finds their cells. Pure functions, tested in Node.
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

/**
 * Places on the fire itself, found from a run of the decision (so they need no village): its head (the burning cell
 * farthest from the ignition) and its two flanks, left and right as seen looking from the ignition toward the head.
 */
export type FirePlace = "head" | "left" | "right";
const FIRE_PLACE_NAME: Record<FirePlace, string> = { head: "cabeça do fogo", left: "flanco esquerdo", right: "flanco direito" };
const FIRE_PLACE_ALIASES: Record<string, FirePlace> = { cabeca: "head", frente: "head", "flanco esquerdo": "left", "flanco direito": "right" };

/** The fire place a name refers to ("cabeça do fogo", "flanco esquerdo"…), or null. */
export function firePlaceOf(name: string): FirePlace | null {
  return FIRE_PLACE_ALIASES[normalize(name).replace(/ do fogo$/, "")] ?? null;
}

/** A place the assistant can name: a village of the grid (id), or a single point (id null). Centre in grid cells. */
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
  if (firePlaceOf(name)) return { error: `"${name}" só se pode usar em place_intervention e compare_placements.` };
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

/** The cells of a place (its village id), or the one cell of a point. */
export function placeCells(grid: GridData, place: NamedPlace): number[] {
  const { cols } = grid.header;
  if (place.id === null) return [Math.floor(place.row) * cols + Math.floor(place.col)];
  const cells: number[] = [];
  for (let i = 0; i < grid.village.length; i++) if (grid.village[i] === place.id) cells.push(i);
  return cells;
}

export const COMPASS = ["norte", "nordeste", "este", "sudeste", "sul", "sudoeste", "oeste", "noroeste"];

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

/**
 * The cell of the fire that `which` names, in a run that reached cells up to `durationMin`: the head is the burning
 * cell farthest from the ignition; a flank is the cell farthest to that side of the line from the ignition to the
 * head, among the cells not behind the ignition.
 */
export function firePlace(
  header: GridHeader,
  arrivalMin: Float32Array,
  ignition: ProjectedPoint,
  which: FirePlace,
  durationMin: number,
): { place: NamedPlace } | { error: string } {
  const { cols } = header;
  const ig = projectedToGrid(header, ignition[0], ignition[1]);
  // x to the east and y to the north, from the centre of the ignition cell.
  const x0 = Math.floor(ig.x) + 0.5;
  const y0 = -(Math.floor(ig.y) + 0.5);
  const at = (c: number) => ({ x: (c % cols) + 0.5 - x0, y: -(Math.floor(c / cols) + 0.5) - y0 });
  let head = -1;
  let far = 0;
  for (let c = 0; c < arrivalMin.length; c++) {
    if (!(arrivalMin[c] <= durationMin)) continue;
    const p = at(c);
    const d = Math.hypot(p.x, p.y);
    if (d > far || (d === far && head >= 0 && arrivalMin[c] < arrivalMin[head])) [head, far] = [c, d];
  }
  if (head < 0 || far < 2) return { error: `Em ${Math.round(durationMin)} min o fogo quase não sai da ignição: não há cabeça nem flancos.` };
  let cell = head;
  if (which !== "head") {
    const u = at(head);
    const ux = u.x / far;
    const uy = u.y / far;
    const side = which === "left" ? 1 : -1;
    let best = 0;
    cell = -1;
    for (let c = 0; c < arrivalMin.length; c++) {
      if (!(arrivalMin[c] <= durationMin)) continue;
      const p = at(c);
      if (p.x * ux + p.y * uy < 0) continue;
      // Positive to the left of the direction the head went.
      const lateral = side * (ux * p.y - uy * p.x);
      if (lateral > best || (lateral === best && cell >= 0 && arrivalMin[c] < arrivalMin[cell])) [cell, best] = [c, lateral];
    }
    if (cell < 0 || best < 1) return { error: `O fogo não se alarga para o ${FIRE_PLACE_NAME[which]}: escolher a cabeça do fogo ou um lugar.` };
  }
  return { place: { name: FIRE_PLACE_NAME[which], id: null, row: Math.floor(cell / cols) + 0.5, col: (cell % cols) + 0.5, buildings: 0 } };
}

/** A point `offsetM` metres from a place toward a compass direction ("norte"…"noroeste"); an error off the grid. */
export function offsetPlace(header: GridHeader, place: NamedPlace, offsetM: number, direction: string): { place: NamedPlace } | { error: string } {
  const k = COMPASS.indexOf(direction);
  if (k < 0) return { error: `offset_direction tem de ser um de: ${COMPASS.join(", ")}.` };
  const bearing = (k * 45 * Math.PI) / 180;
  const cells = offsetM / header.cellSize;
  const row = place.row - Math.cos(bearing) * cells;
  const col = place.col + Math.sin(bearing) * cells;
  if (row < 0 || col < 0 || row >= header.rows || col >= header.cols)
    return { error: `${km(offsetM)} a ${direction} de ${place.name} fica fora da zona simulada.` };
  return { place: { name: `${km(offsetM)} a ${direction} de ${place.name}`, id: null, row, col, buildings: 0 } };
}

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
