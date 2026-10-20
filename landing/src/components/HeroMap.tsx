// The hero's 3D relief: OpenStreetMap over the Guimarães grid's elevation, under a tilted camera that follows
// the pointer. Two maps in sync show the same fire under decision A (left) and decision B (right), split by a
// divider the visitor drags. Loaded as its own chunk after the page is idle (see Hero.tsx).
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { demTilePixels } from "@web/lib/dem-tile";
import { fetchGrid } from "@web/lib/load-grid";

const GRID = "guimaraes";
/** The city centre: the camera looks at Guimarães, with the fire on the Penha hill to the east. */
const GUIMARAES: [number, number] = [-8.2918, 41.4425];
const ZOOM = 11.9;
const DEM_TILE = 256;
const PITCH = 58;
/** How far the camera swings with the pointer: bearing left/right, pitch up/down. */
const SWING_DEG = 22;
const TILT_DEG = 7;
/** The basemap's paint: desaturated and dimmed; labels stay legible. The posters are captured with the same values. */
const OSM_PAINT = { "raster-saturation": -0.7, "raster-contrast": -0.08, "raster-brightness-max": 0.8 };

/** Terrarium DEM tiles from the grid's own elevation, as in the interface's MapView; cached, both maps ask for the same tiles. */
let demGrid: Awaited<ReturnType<typeof fetchGrid>>["data"] | null = null;
const demTiles = new Map<string, ArrayBuffer>();
maplibregl.addProtocol("herodem", async ({ url }) => {
  const hit = demTiles.get(url);
  if (hit) return { data: hit.slice(0) }; // a copy: MapLibre transfers the buffer to its worker
  const [z, x, y] = url.slice("herodem://".length).split("/").map(Number);
  const img = demGrid
    ? new ImageData(demTilePixels(demGrid.header, demGrid.elevation, z, x, y, DEM_TILE), DEM_TILE, DEM_TILE)
    : new ImageData(DEM_TILE, DEM_TILE);
  const canvas = new OffscreenCanvas(DEM_TILE, DEM_TILE);
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const data = await (await canvas.convertToBlob()).arrayBuffer();
  demTiles.set(url, data);
  return { data: data.slice(0) };
});

interface Props {
  /** The element whose box the pointer is measured against (the whole hero, not just the map). */
  follow: React.RefObject<HTMLElement | null>;
  /** Both maps drawn: the poster underneath can fade. The canvases, A then B, for the poster capture. */
  onReady: (canvases: HTMLCanvasElement[]) => void;
  /** Keeps the drawing buffers so the canvases can be read back (the poster capture only). */
  readable?: boolean;
  /** Where the divider between A and B sits, 0 to 1 from the left; the scene around the map owns it. */
  split: number;
  /** True while the divider is being dragged: the camera holds still. */
  hold?: React.RefObject<boolean>;
}

export default function HeroMap({ follow, onReady, readable = false, split, hold }: Props) {
  const containerA = useRef<HTMLDivElement>(null);
  const containerB = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    let disposed = false;
    const maps: maplibregl.Map[] = [];
    let frame = 0;
    const target = { bearing: 0, pitch: PITCH };
    const current = { bearing: 0, pitch: PITCH };

    // Eases both cameras towards the target a bit per frame; stops when they get there.
    const step = () => {
      frame = 0;
      const db = target.bearing - current.bearing, dp = target.pitch - current.pitch;
      if (Math.abs(db) < 0.02 && Math.abs(dp) < 0.02) return;
      current.bearing += db * 0.08;
      current.pitch += dp * 0.08;
      for (const m of maps) m.jumpTo({ bearing: current.bearing, pitch: current.pitch });
      frame = requestAnimationFrame(step);
    };
    const nudge = () => { if (!frame) frame = requestAnimationFrame(step); };
    const onMove = (e: PointerEvent) => {
      const el = follow.current;
      if (!el || hold?.current) return;
      // Measured against the hero's box but tracked on the whole window, so the camera keeps following
      // beside the hero; clamped at the box's edges.
      // The page body stands for the whole window (the hero follows the pointer everywhere on the page).
      const r = el === document.body ? new DOMRect(0, 0, innerWidth, innerHeight) : el.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      target.bearing = clamp(((e.clientX - r.left) / r.width - 0.5) * 2) * SWING_DEG;
      target.pitch = PITCH + clamp(((e.clientY - r.top) / r.height - 0.5) * 2) * TILT_DEG;
      nudge();
    };
    const onLeave = () => { target.bearing = 0; target.pitch = PITCH; nudge(); };

    (async () => {
      const [{ data: grid }, fire] = await Promise.all([
        fetchGrid(GRID),
        fetch("/hero/fire.json").then((r) => r.json() as Promise<GeoJSON.FeatureCollection>),
      ]);
      if (disposed) return;
      demGrid = grid;
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--raised").trim() || "#1f2927";
      let idle = 0;
      for (const [container, decision] of [[containerA, "A"], [containerB, "B"]] as const) {
        const map = new maplibregl.Map({
          container: container.current!,
          style: {
            version: 8,
            sources: {
              osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
            },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": bg } },
              // The street map muted, so it sits calmly on the dark page under the fire (which keeps full strength).
              { id: "osm", type: "raster", source: "osm", paint: OSM_PAINT },
            ],
          },
          center: GUIMARAES,
          zoom: ZOOM,
          pitch: PITCH,
          interactive: false,
          attributionControl: false,
          maplibreLogo: false,
          canvasContextAttributes: { preserveDrawingBuffer: readable },
        });
        maps.push(map);
        map.on("load", () => {
          map.addSource("dem", { type: "raster-dem", tiles: ["herodem://{z}/{x}/{y}"], tileSize: DEM_TILE, encoding: "terrarium", maxzoom: 13 });
          map.addSource("fire", { type: "geojson", data: fire });
          // The cells burned under this decision, by the hour the fire arrives.
          map.addLayer({
            id: "fire", type: "fill", source: "fire",
            filter: ["all", ["==", ["get", "kind"], "fire"], ["==", ["get", "decision"], decision]],
            paint: {
              "fill-color": ["match", ["get", "class"], "h1", "#f6d35a", "h2", "#f0963a", "h3", "#de5a2a", "#b8302a"],
              "fill-opacity": 0.65,
              "fill-antialias": false,
            },
          });
          map.addLayer({
            id: "ignition", type: "circle", source: "fire", filter: ["==", ["get", "kind"], "ignition"],
            paint: { "circle-radius": 6, "circle-color": "#c0282b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
          });
          map.setTerrain({ source: "dem", exaggeration: 3 });
          map.once("idle", () => {
            if (++idle < 2) return;
            ready.current(maps.map((m) => m.getCanvas()));
            window.addEventListener("pointermove", onMove);
            document.documentElement.addEventListener("pointerleave", onLeave);
          });
        });
      }
    })().catch((e) => console.error("Relevo 3D indisponível; fica a imagem.", e));

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      for (const m of maps) m.remove();
    };
  }, [follow, readable, hold]);

  const pct = `${(split * 100).toFixed(2)}%`;

  return (
    <div className="relative h-full w-full select-none">
      <div className="absolute inset-0"><div ref={containerA} className="h-full w-full" aria-hidden="true" /></div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pct})` }}>
        <div ref={containerB} className="h-full w-full" aria-hidden="true" />
      </div>
    </div>
  );
}
