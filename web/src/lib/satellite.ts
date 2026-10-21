/**
 * The satellite base map: DGT's 2023 satellite orthoimage of mainland Portugal (OrtoSat 2023, 30 cm, open data,
 * no fees), asked from its WMS as Web Mercator tiles.
 *
 * That WMS draws every tile on request (about 0.35 s), answers over HTTP/1.1 (the browser keeps 6 requests open
 * to it at a time) and sends no cache headers, so the browser never reuses a tile. Asked like a tile service,
 * a screen queued for seconds and both maps (A and B) fetched every tile. So:
 * - tiles are 512 px: a quarter of the requests, each about as fast as a 256 px one;
 * - one store, shared by both maps, keeps the tiles of this session: a tile is fetched once, a tile both maps
 *   ask for at the same time is one request, and a tile still loading is cancelled only when no map wants it.
 */
const WMS =
  "https://ortos.dgterritorio.gov.pt/wms/ortosat2023?service=WMS&request=GetMap&version=1.3.0" +
  "&layers=ortoSat2023-CorVerdadeira&styles=&crs=EPSG:3857&width=512&height=512&format=image/jpeg&bbox=";

export const SATELLITE_PROTOCOL = "dgtsat";
export const SATELLITE_TILE_SIZE = 512;
/** Tile URL template for the map source: MapLibre fills the bbox, the protocol below fetches it. */
export const SATELLITE_TILES = `${SATELLITE_PROTOCOL}://{bbox-epsg-3857}`;

/** About 90 KB each: 300 tiles keep a few screens of both maps within ~27 MB. */
const MAX_TILES = 300;

interface Entry {
  promise: Promise<ArrayBuffer>;
  controller: AbortController;
  /** Requests still waiting for this tile; at 0 an unfinished fetch is cancelled. */
  waiting: number;
  done: boolean;
}

/**
 * A tile handler for maplibregl.addProtocol: the WMS URL for each tile URL, a shared fetch per tile, the tiles
 * kept in memory (oldest dropped first) and a fetch cancelled once every request for it is.
 */
export function createTileStore(fetchTile: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>, maxTiles = MAX_TILES) {
  const store = new Map<string, Entry>(); // insertion order: least recently used first

  const start = (bbox: string): Entry => {
    const controller = new AbortController();
    const entry: Entry = { controller, waiting: 0, done: false, promise: Promise.resolve(new ArrayBuffer(0)) };
    entry.promise = fetchTile(WMS + bbox, controller.signal).then(
      (data) => {
        entry.done = true;
        return data;
      },
      (error: unknown) => {
        // A failed or cancelled tile is not kept: the next request tries again.
        if (store.get(bbox) === entry) store.delete(bbox);
        throw error;
      },
    );
    store.set(bbox, entry);
    while (store.size > maxTiles) store.delete(store.keys().next().value!);
    return entry;
  };

  const handler = async ({ url }: { url: string }, abortController: AbortController): Promise<{ data: ArrayBuffer }> => {
    const bbox = url.slice(SATELLITE_PROTOCOL.length + 3);
    let entry = store.get(bbox);
    if (entry) {
      store.delete(bbox); // most recently used again
      store.set(bbox, entry);
    } else {
      entry = start(bbox);
    }
    const shared = entry;
    const signal = abortController.signal;
    shared.waiting++;
    try {
      const data = await new Promise<ArrayBuffer>((resolve, reject) => {
        const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
        shared.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
      });
      // A copy: the caller may transfer or detach the buffer, and the store keeps its own.
      return { data: data.slice(0) };
    } finally {
      shared.waiting--;
      if (shared.waiting === 0 && !shared.done) {
        shared.controller.abort();
        if (store.get(bbox) === shared) store.delete(bbox);
      }
    }
  };

  return { handler, size: () => store.size };
}

/** The browser fetch of one tile, failing on an HTTP error so a bad answer is never kept. */
export async function fetchTile(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Imagem de satélite: HTTP ${res.status}`);
  return res.arrayBuffer();
}
