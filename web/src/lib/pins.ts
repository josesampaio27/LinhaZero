import type maplibregl from "maplibre-gl";
import type { LngLat } from "./projection";

/**
 * An HTML element pinned to a lng/lat, centred on it. Like maplibregl.Marker minus the terrain
 * occlusion test: that reads the depth framebuffer (a GPU sync) per marker on every move, and the
 * synced second map gets a `moveend` on every frame, which forces it for every label. This only
 * projects, once per rendered frame. Returns a function that removes the element.
 */
export function pin(map: maplibregl.Map, el: HTMLElement, lngLat: LngLat): () => void {
  el.classList.add("pin");
  map.getCanvasContainer().appendChild(el);
  const place = () => {
    const p = map.project(lngLat);
    el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`;
  };
  place();
  map.on("render", place);
  return () => {
    map.off("render", place);
    el.remove();
  };
}
