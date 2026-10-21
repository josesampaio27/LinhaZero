import { describe, expect, it } from "vitest";
import { createTileStore, SATELLITE_TILES } from "../src/lib/satellite";

/** A fetch the test resolves or fails by hand, recording each call and whether it was cancelled. */
function fakeFetch() {
  const calls: { url: string; signal: AbortSignal; resolve: (b: ArrayBuffer) => void; reject: (e: unknown) => void }[] = [];
  const fetchTile = (url: string, signal: AbortSignal) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      calls.push({ url, signal, resolve, reject });
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  return { calls, fetchTile };
}

const tile = (bbox: string) => ({ url: SATELLITE_TILES.replace("{bbox-epsg-3857}", bbox) });
const bytes = (...v: number[]) => new Uint8Array(v).buffer;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("satellite tile store", () => {
  it("asks the WMS for the tile's box at 512 px", async () => {
    const f = fakeFetch();
    const s = createTileStore(f.fetchTile);
    void s.handler(tile("-924000,5076000,-922000,5078000"), new AbortController());
    expect(f.calls).toHaveLength(1);
    const url = new URL(f.calls[0].url);
    expect(url.origin).toBe("https://ortos.dgterritorio.gov.pt");
    expect(url.searchParams.get("bbox")).toBe("-924000,5076000,-922000,5078000");
    expect(url.searchParams.get("width")).toBe("512");
    expect(url.searchParams.get("crs")).toBe("EPSG:3857");
  });

  it("two maps asking for the same tile make one request, and a later ask reuses it", async () => {
    const f = fakeFetch();
    const s = createTileStore(f.fetchTile);
    const a = s.handler(tile("1,2,3,4"), new AbortController());
    const b = s.handler(tile("1,2,3,4"), new AbortController());
    expect(f.calls).toHaveLength(1);
    f.calls[0].resolve(bytes(7, 8));
    const [ra, rb] = await Promise.all([a, b]);
    expect([...new Uint8Array(ra.data)]).toEqual([7, 8]);
    expect([...new Uint8Array(rb.data)]).toEqual([7, 8]);
    expect(ra.data).not.toBe(rb.data); // each caller gets its own copy
    const c = await s.handler(tile("1,2,3,4"), new AbortController());
    expect([...new Uint8Array(c.data)]).toEqual([7, 8]);
    expect(f.calls).toHaveLength(1);
  });

  it("cancels the fetch only when every request for it is cancelled", async () => {
    const f = fakeFetch();
    const s = createTileStore(f.fetchTile);
    const ca = new AbortController();
    const cb = new AbortController();
    const a = s.handler(tile("1,2,3,4"), ca);
    const b = s.handler(tile("1,2,3,4"), cb);
    ca.abort();
    await expect(a).rejects.toThrow("Aborted");
    expect(f.calls[0].signal.aborted).toBe(false); // map B still wants it
    f.calls[0].resolve(bytes(1));
    expect([...new Uint8Array((await b).data)]).toEqual([1]);

    const cc = new AbortController();
    const c = s.handler(tile("5,6,7,8"), cc);
    cc.abort();
    await expect(c).rejects.toThrow("Aborted");
    expect(f.calls[1].signal.aborted).toBe(true); // nobody wants it: the request is freed
    await flush();
    expect(s.size()).toBe(1); // only the finished tile is kept
    void s.handler(tile("5,6,7,8"), new AbortController());
    expect(f.calls).toHaveLength(3); // asked again later: a new fetch
  });

  it("does not keep a failed tile", async () => {
    const f = fakeFetch();
    const s = createTileStore(f.fetchTile);
    const a = s.handler(tile("1,2,3,4"), new AbortController());
    f.calls[0].reject(new Error("HTTP 503"));
    await expect(a).rejects.toThrow("HTTP 503");
    expect(s.size()).toBe(0);
    void s.handler(tile("1,2,3,4"), new AbortController());
    expect(f.calls).toHaveLength(2);
  });

  it("drops the least recently used tile past the limit", async () => {
    const f = fakeFetch();
    const s = createTileStore(f.fetchTile, 2);
    for (const [i, box] of ["a", "b"].entries()) {
      const p = s.handler(tile(box), new AbortController());
      f.calls[i].resolve(bytes(i));
      await p;
    }
    await s.handler(tile("a"), new AbortController()); // "a" used again: "b" is now the oldest
    const p = s.handler(tile("c"), new AbortController());
    f.calls[2].resolve(bytes(2));
    await p;
    expect(s.size()).toBe(2);
    await s.handler(tile("a"), new AbortController());
    expect(f.calls).toHaveLength(3); // "a" was kept
    void s.handler(tile("b"), new AbortController());
    expect(f.calls).toHaveLength(4); // "b" was dropped
  });
});
