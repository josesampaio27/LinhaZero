// Grid variants: an official grid plus a list of edits, made in the grid editor (docs/referencia/formato-variante.md).
// The official grid is never changed; applyVariant returns a new one. Errors are user-facing, so in Portuguese.
import { rasterizePolygon, rasterizePolyline } from "./geometry";
import { projectedToGrid } from "./grid";
import { canonicalJson, sha256Hex } from "./hash";
import { PARAM_RANGES, type ModelParams } from "./params";
import type { GridData, GridHeader } from "./types";

/** A point in EPSG:3763 metres: [x, y]. */
type Point = [number, number];

export type GridEdit =
  | { kind: "setFuel"; fuel: number; polygon: Point[] } // cells inside take this fuel code
  | { kind: "addBarrier"; line: Point[] } // cells along the line become non-burnable barrier
  | { kind: "removeBarrier"; polygon: Point[] }; // cells inside stop being barrier

export type GridEditKind = GridEdit["kind"];

export interface GridVariant {
  version: 1;
  id: string;
  name: string;
  description?: string;
  /** The official grid this variant edits; sha256 is hashGrid of that grid. */
  base: { grid: string; version?: string; sha256: string };
  /** New base spread rate (m/min) per fuel code. */
  fuelRates: Record<string, number>;
  /** Model coefficients overriding DEFAULT_PARAMS. */
  params: Partial<ModelParams>;
  /** Edits to the layers, applied in order. */
  edits: GridEdit[];
}

/** Rates above this (m/min) are almost certainly typos. */
const MAX_FUEL_RATE = 200;

/** SHA-256 of what the variant changes: the base grid hash, fuel rates, coefficients and edits (not the name). */
export function variantHash(v: GridVariant): string {
  const content = { base: v.base.sha256, fuelRates: v.fuelRates, params: v.params, edits: v.edits };
  return sha256Hex(new TextEncoder().encode(canonicalJson(content)));
}

/** An empty variant of a grid, ready for the editor. */
export function emptyVariant(header: GridHeader, sha256: string, id: string, name: string): GridVariant {
  return { version: 1, id, name, base: { grid: header.name, sha256 }, fuelRates: {}, params: {}, edits: [] };
}

/** Indices of the cells an edit touches. */
export function editCells(header: GridHeader, edit: GridEdit): number[] {
  const toGrid = (pts: Point[]) => pts.map(([x, y]) => projectedToGrid(header, x, y));
  const cells =
    edit.kind === "addBarrier"
      ? rasterizePolyline(toGrid(edit.line), header.rows, header.cols)
      : rasterizePolygon(toGrid(edit.polygon), header.rows, header.cols);
  return cells.map(({ row, col }) => row * header.cols + col);
}

/** Returns the grid with the variant applied: fuel rates first, then the edits in order. The input grid is not changed. */
export function applyVariant(grid: GridData, v: GridVariant): GridData {
  const fuelTable = { ...grid.header.fuelTable };
  for (const [code, rate] of Object.entries(v.fuelRates)) {
    fuelTable[Number(code)] = { ...fuelTable[Number(code)], baseRate: rate };
  }
  const fuel = grid.fuel.slice();
  const barrier = grid.barrier.slice();
  for (const edit of v.edits) {
    const cells = editCells(grid.header, edit);
    if (edit.kind === "setFuel") for (const i of cells) fuel[i] = edit.fuel;
    else for (const i of cells) barrier[i] = edit.kind === "addBarrier" ? 1 : 0;
  }
  return { ...grid, header: { ...grid.header, fuelTable }, fuel, barrier };
}

/** Throws unless the variant was made for exactly this grid (same hash). */
export function checkVariantBase(v: GridVariant, gridSha256: string): void {
  if (v.base.sha256 !== gridSha256) {
    throw new Error(`A variante "${v.name}" foi feita para outra versão da grelha "${v.base.grid}"`);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPoints = (v: unknown, min: number): v is Point[] =>
  Array.isArray(v) && v.length >= min && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));

function invalid(why: string): never {
  throw new Error(`Variante de grelha inválida: ${why}`);
}

function parseEdit(raw: unknown, n: number, header: GridHeader): GridEdit {
  const where = `a alteração ${n}`;
  if (!isObject(raw)) invalid(`${where} não é um objeto`);
  if (raw.kind === "setFuel") {
    if (!Number.isInteger(raw.fuel) || !(String(raw.fuel) in header.fuelTable)) {
      invalid(`${where} usa um combustível que não existe nesta grelha (${String(raw.fuel)})`);
    }
    if (!isPoints(raw.polygon, 3)) invalid(`${where} precisa de uma área com pelo menos 3 pontos [x, y] em metros`);
    return { kind: "setFuel", fuel: raw.fuel as number, polygon: raw.polygon };
  }
  if (raw.kind === "addBarrier") {
    if (!isPoints(raw.line, 2)) invalid(`${where} precisa de uma linha com pelo menos 2 pontos [x, y] em metros`);
    return { kind: "addBarrier", line: raw.line };
  }
  if (raw.kind === "removeBarrier") {
    if (!isPoints(raw.polygon, 3)) invalid(`${where} precisa de uma área com pelo menos 3 pontos [x, y] em metros`);
    return { kind: "removeBarrier", polygon: raw.polygon };
  }
  invalid(`${where} tem um tipo desconhecido (${String(raw.kind)})`);
}

/** Validates a variant against the header of the grid it must apply to. The hash is checked separately (checkVariantBase). */
export function parseGridVariant(raw: unknown, header: GridHeader): GridVariant {
  if (!isObject(raw)) invalid("não é um objeto JSON");
  if (raw.version !== 1) invalid(`versão desconhecida (${String(raw.version)})`);
  const base = raw.base;
  if (!isObject(base) || typeof base.grid !== "string" || typeof base.sha256 !== "string") invalid("falta a grelha de base");
  if (base.grid !== header.name) invalid(`é para a grelha "${base.grid}", não para "${header.name}"`);
  if (base.version !== undefined && typeof base.version !== "string") invalid("a versão da grelha de base não é texto");

  const fuelRates: Record<string, number> = {};
  if (raw.fuelRates !== undefined) {
    if (!isObject(raw.fuelRates)) invalid("as velocidades por combustível não são um objeto");
    for (const [code, rate] of Object.entries(raw.fuelRates)) {
      if (!(code in header.fuelTable)) invalid(`o combustível ${code} não existe nesta grelha`);
      if (!Number.isFinite(rate) || (rate as number) < 0 || (rate as number) > MAX_FUEL_RATE) {
        invalid(`a velocidade do combustível ${code} tem de estar entre 0 e ${MAX_FUEL_RATE} m/min`);
      }
      fuelRates[code] = rate as number;
    }
  }

  const params: Partial<ModelParams> = {};
  if (raw.params !== undefined) {
    if (!isObject(raw.params)) invalid("os coeficientes não são um objeto");
    for (const [key, value] of Object.entries(raw.params)) {
      const range = PARAM_RANGES[key as keyof ModelParams];
      if (!range) invalid(`coeficiente desconhecido (${key})`);
      if (!Number.isFinite(value) || (value as number) < range[0] || (value as number) > range[1]) {
        invalid(`o coeficiente ${key} tem de estar entre ${range[0]} e ${range[1]}`);
      }
      params[key as keyof ModelParams] = value as number;
    }
  }

  if (raw.edits !== undefined && !Array.isArray(raw.edits)) invalid("as alterações não são uma lista");
  const edits = ((raw.edits as unknown[] | undefined) ?? []).map((e, i) => parseEdit(e, i + 1, header));

  return {
    version: 1,
    id: typeof raw.id === "string" && raw.id ? raw.id : `var-${variantHashOf(base.sha256, fuelRates, params, edits).slice(0, 12)}`,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Variante sem nome",
    description: typeof raw.description === "string" ? raw.description : undefined,
    base: { grid: base.grid, version: base.version as string | undefined, sha256: base.sha256 },
    fuelRates,
    params,
    edits,
  };
}

function variantHashOf(sha256: string, fuelRates: Record<string, number>, params: Partial<ModelParams>, edits: GridEdit[]): string {
  return variantHash({ version: 1, id: "", name: "", base: { grid: "", sha256 }, fuelRates, params, edits });
}
