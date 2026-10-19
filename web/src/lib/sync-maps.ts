import type maplibregl from "maplibre-gl";

/** Keeps the camera of two maps in lockstep (pan and zoom). */
export function syncMaps(a: maplibregl.Map, b: maplibregl.Map): void {
  let syncing = false;
  const follow = (src: maplibregl.Map, dst: maplibregl.Map) => () => {
    if (syncing) return;
    syncing = true;
    dst.jumpTo({ center: src.getCenter(), zoom: src.getZoom(), bearing: src.getBearing(), pitch: src.getPitch() });
    syncing = false;
  };
  a.on("move", follow(a, b));
  b.on("move", follow(b, a));
  follow(a, b)();
}
