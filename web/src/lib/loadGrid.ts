import {
  decodeGrid,
  hashGrid,
  gridLayerNames,
  parseSavedScenario,
  savedScenarioGrid,
  type GridData,
  type GridHeader,
  type LayerBuffers,
  type SavedScenario,
} from "@linha-zero/engine";

export interface GridIndexEntry {
  name: string;
  label: string;
}

export interface GridBundle {
  /** Folder name under grids/. */
  name: string;
  data: GridData;
  buffers: LayerBuffers;
  /** hashGrid of the grid: what a grid variant must be based on. */
  sha256: string;
}

const base = `${import.meta.env.BASE_URL}grids`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível carregar ${url} (${res.status})`);
  return res;
}

const scenarioBase = `${import.meta.env.BASE_URL}scenarios`;

export async function fetchScenarioIndex(): Promise<GridIndexEntry[]> {
  return (await fetchOk(`${scenarioBase}/index.json`)).json();
}

export async function fetchScenario(name: string): Promise<unknown> {
  return (await fetchOk(`${scenarioBase}/${encodeURIComponent(name)}.json`)).json();
}

/** Validates a scenario file (from a URL or a local file) against the header of its grid. */
export async function readSavedScenario(raw: unknown): Promise<SavedScenario> {
  return parseSavedScenario(raw, await fetchGridHeader(savedScenarioGrid(raw)));
}

export async function fetchGridIndex(): Promise<GridIndexEntry[]> {
  return (await fetchOk(`${base}/index.json`)).json();
}

export async function fetchGridHeader(name: string): Promise<GridHeader> {
  return (await fetchOk(`${base}/${encodeURIComponent(name)}/header.json`)).json();
}

/** Downloads a grid's header and layers from web/public/grids/<name>/. */
export async function fetchGrid(name: string): Promise<GridBundle> {
  const header = await fetchGridHeader(name);
  const entries = await Promise.all(
    gridLayerNames(header).map(async (layer) => {
      const buf = await (await fetchOk(`${base}/${name}/${header.layers[layer]!}`)).arrayBuffer();
      return [layer, buf] as const;
    }),
  );
  const buffers = Object.fromEntries(entries) as LayerBuffers;
  const data = decodeGrid(header, buffers);
  return { name, data, buffers, sha256: hashGrid(data) };
}

/** A real fire's observed perimeters (GeoJSON, WGS84; property `minute` after the ignition). */
export interface ObservedFire {
  fire: string;
  source: string;
  features: { type: "Feature"; properties: { minute: number; label: string }; geometry: unknown }[];
}

/** The observed perimeters of a replay grid (header.observed), or null for an ordinary grid. */
export async function fetchObservedFire(name: string, header: GridHeader): Promise<ObservedFire | null> {
  if (!header.observed) return null;
  const geo = await (await fetchOk(`${base}/${encodeURIComponent(name)}/${header.observed.file}`)).json();
  return { fire: header.observed.fire, source: header.observed.source, features: geo.features };
}
