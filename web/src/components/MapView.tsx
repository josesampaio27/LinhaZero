import { useEffect, useRef, useState } from "react";
import maplibregl, { type CanvasSource, type GeoJSONSource, type ImageSource, type StyleSpecification } from "maplibre-gl";
import type { GridData, ProjectedPoint } from "@linha-zero/engine";
import { gridBounds, gridCorners, gridToLngLat, projectedToLngLat, type LngLat } from "../lib/projection";
import { demTilePixels } from "../lib/dem-tile";
import { pin } from "../lib/pins";
import { placeStats } from "../lib/places";
import { contourSegments, contourStep } from "../lib/contours";
import type { Incident } from "../api/client";
import { dayHour } from "../lib/weather";
import { createTileStore, fetchTile, SATELLITE_PROTOCOL, SATELLITE_TILE_SIZE, SATELLITE_TILES } from "../lib/satellite";

/** A shape being drawn: a line or a polygon ring, in EPSG:3763. */
export interface Draft {
  line: boolean;
  coords: [number, number][];
}

/** A finished shape on the map: an intervention or a grid edit. `kind` picks the colour. */
export interface MapShape {
  kind: string;
  line: boolean;
  coords: [number, number][]; // EPSG:3763
}

interface Props {
  title: string;
  /** Extra class on the wrapper, e.g. which decision this map shows. */
  className?: string;
  accent: string;
  grid: GridData | null;
  terrainUrl: string | null;
  /** Pixels drawn over the terrain, one per grid cell: the fire, or the edited cells in the grid editor. */
  fire: ImageData | null;
  showOsm: boolean;
  /** The satellite image under the grid (DGT, needs internet). */
  showSatellite?: boolean;
  /** A real fire's observed perimeters: those observed up to `upToMin` are drawn, the latest one bold. */
  observed?: { features: { type: "Feature"; properties: { minute: number }; geometry: unknown }[]; upToMin: number } | null;
  /** Tilted camera over the grid elevation. */
  terrain3d?: boolean;
  /** Contour lines from the grid elevation. */
  contours?: boolean;
  ignition: ProjectedPoint | null; // EPSG:3763
  shapes: MapShape[];
  draft: Draft | null;
  interactive: boolean; // crosshair cursor + clicks consumed by a tool
  incidents?: Incident[];
  onReady?: (map: maplibregl.Map) => void;
  onClick?: (lngLat: LngLat) => void;
  onDblClick?: (lngLat: LngLat) => void;
  /** Pointer position over the map, or null when it leaves. On touch screens: where a long press happened. */
  onHover?: (lngLat: LngLat | null) => void;
  /**
   * Paint mode (cell selection in the grid editor): a left-button or one-finger drag calls onPaint instead of panning
   * the map. "start" and "move" carry the pointer position; erase is true while Shift or Alt is held.
   */
  paint?: boolean;
  onPaint?: (lngLat: LngLat | null, phase: "start" | "move" | "end", erase: boolean) => void;
  /** Moves the view to `bounds` ([w, s], [e, n]) once per `key`, e.g. the burned extent after each run. */
  fitBounds?: { key: string; bounds: [LngLat, LngLat] } | null;
  /** An active incident marker was clicked: sets the ignition there. */
  onIncidentClick?: (lngLat: LngLat) => void;
  children?: React.ReactNode;
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Contribuidores do OpenStreetMap",
    },
    // DGT's 2023 satellite orthoimage, through a store both maps share (lib/satellite.ts). A 512 px tile
    // at zoom 17 has about 0.45 m per pixel here (the image has 0.3 m); closer, the map enlarges it.
    satellite: {
      type: "raster",
      tiles: [SATELLITE_TILES],
      tileSize: SATELLITE_TILE_SIZE,
      maxzoom: 17,
      attribution: "OrtoSat 2023 © DGT",
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e9e7e1" } },
    { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
  ],
};

/** STYLE with the page's own background outside the grid (light or dark theme). */
function themedStyle(): StyleSpecification {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--sunk").trim() || "#e9e7e1";
  return { ...STYLE, layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }, ...STYLE.layers.slice(1)] };
}

const MAX_LABELS = 20;

/** Tooltips of MapLibre's own controls, in Portuguese. */
const MAP_LOCALE = {
  "NavigationControl.ZoomIn": "Aproximar",
  "NavigationControl.ZoomOut": "Afastar",
  "NavigationControl.ResetBearing": "Repor a orientação (arrastar para rodar)",
  "AttributionControl.ToggleAttribution": "Mostrar ou esconder a atribuição",
};
const LONG_PRESS_MS = 500;
/** A finger that moves more than this (px) is panning, not pressing. */
const PRESS_SLOP = 10;
const TOUCH_END = ["touchmove", "touchend", "touchcancel"] as const;

// 3D relief from the grid's own elevation (works offline): a "griddem://<key>/z/x/y" protocol that
// renders Terrarium-encoded DEM tiles (see dem-tile.ts). The elevation never changes for a grid key,
// so tiles are cached and shared by both maps: the protocol runs on the main thread.
const dems = new Map<string, GridData>();
const DEM_TILE = 256;
const demTiles = new Map<string, ArrayBuffer>();
const DEM_TILES_MAX = 512; // ponytail: FIFO cap, ~20 MB of PNG; an LRU if a session ever thrashes it
maplibregl.addProtocol(SATELLITE_PROTOCOL, createTileStore(fetchTile).handler);

maplibregl.addProtocol("griddem", async ({ url }) => {
  const hit = demTiles.get(url);
  if (hit) return { data: hit.slice(0) }; // a copy: MapLibre transfers the buffer to its worker
  const [key, z, x, y] = url.slice("griddem://".length).split("/");
  const grid = dems.get(decodeURIComponent(key));
  const img = grid
    ? new ImageData(demTilePixels(grid.header, grid.elevation, +z, +x, +y, DEM_TILE), DEM_TILE, DEM_TILE)
    : new ImageData(DEM_TILE, DEM_TILE);
  const canvas = new OffscreenCanvas(DEM_TILE, DEM_TILE);
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  const data = await (await canvas.convertToBlob()).arrayBuffer();
  if (demTiles.size >= DEM_TILES_MAX) demTiles.delete(demTiles.keys().next().value!);
  demTiles.set(url, data);
  return { data: data.slice(0) };
});

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Contours per grid key: ~160 ms to build on a real grid, so built once on first show and shared by both maps.
const contourCache = new Map<string, GeoJSON.FeatureCollection>();

/** Contour lines as one MultiLineString per level; every fifth level is an index contour. */
function contourFeatures(grid: GridData): GeoJSON.FeatureCollection {
  const { rows, cols } = grid.header;
  let lo = Infinity, hi = -Infinity;
  for (const z of grid.elevation) {
    if (!Number.isFinite(z)) continue; // nodata would make the whole span NaN
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
  }
  const step = contourStep(hi - lo);
  const byLevel = new Map<number, GeoJSON.Position[][]>();
  for (const s of contourSegments(grid.elevation, rows, cols, step)) {
    const lines = byLevel.get(s.level) ?? byLevel.set(s.level, []).get(s.level)!;
    lines.push([gridToLngLat(grid.header, ...s.a), gridToLngLat(grid.header, ...s.b)]);
  }
  return {
    type: "FeatureCollection",
    features: [...byLevel].map(([level, coordinates]) => ({
      type: "Feature",
      properties: { index: level % (step * 5) === 0 },
      geometry: { type: "MultiLineString", coordinates },
    })),
  };
}

function shapeFeatures(items: MapShape[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((d) => {
      const ring = d.coords.map(([x, y]) => projectedToLngLat(x, y));
      const geometry: GeoJSON.Geometry = d.line
        ? { type: "LineString", coordinates: ring }
        : { type: "Polygon", coordinates: [[...ring, ring[0]]] };
      return { type: "Feature", properties: { kind: d.kind }, geometry };
    }),
  };
}

function draftFeatures(draft: Draft | null, hover: LngLat | null): GeoJSON.FeatureCollection {
  if (!draft) return EMPTY;
  const pts = draft.coords.map(([x, y]) => projectedToLngLat(x, y));
  const line = hover ? [...pts, hover] : pts;
  if (!draft.line && line.length >= 3) line.push(line[0]);
  const features: GeoJSON.Feature[] = pts.map((p) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: p },
  }));
  if (line.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } });
  return { type: "FeatureCollection", features };
}

/** One MapLibre map showing the offline terrain, the fire layer, interventions and markers. */
export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const hover = useRef<LngLat | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: themedStyle(),
      center: [-8.2, 41.5],
      zoom: 11,
      attributionControl: { compact: true },
      locale: MAP_LOCALE,
    });
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      map.addSource("drawings", { type: "geojson", data: EMPTY });
      map.addSource("draft", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "drawings-fill",
        type: "fill",
        source: "drawings",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": ["match", ["get", "kind"], "protectZone", "#16a34a", "setFuel", "#a16207", "removeBarrier", "#64748b", "burned", "#7f1d1d", "#0284c7"],
          "fill-opacity": ["match", ["get", "kind"], "burned", 0.45, 0.22],
        },
      });
      map.addLayer({
        id: "drawings-outline",
        type: "line",
        source: "drawings",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "line-color": ["match", ["get", "kind"], "protectZone", "#15803d", "setFuel", "#854d0e", "removeBarrier", "#475569", "burned", "#450a0a", "#0369a1"],
          "line-width": 2,
        },
      });
      // Lines by kind: containment lines dark blue, water drops light blue, retardant red; a backfire's
      // control line dashed orange (dashes cannot vary per feature, so it has its own layer).
      map.addLayer({
        id: "drawings-line",
        type: "line",
        source: "drawings",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "backfire"], ["!=", ["get", "kind"], "firePath"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "kind"], "addBarrier", "#334155", "aerialDrop", "#0ea5e9", "aerialDropRetardant", "#dc2626", "#1e3a8a"],
          "line-width": ["match", ["get", "kind"], "aerialDrop", 7, "aerialDropRetardant", 7, 4],
          "line-opacity": ["match", ["get", "kind"], "aerialDrop", 0.85, "aerialDropRetardant", 0.85, 1],
        },
      });
      // The fire's path to a point being explained: dark with a light halo, readable over the fire colours.
      map.addLayer({
        id: "drawings-path-halo",
        type: "line",
        source: "drawings",
        filter: ["==", ["get", "kind"], "firePath"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "drawings-path",
        type: "line",
        source: "drawings",
        filter: ["==", ["get", "kind"], "firePath"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#111827", "line-width": 3 },
      });
      map.addLayer({
        id: "drawings-backfire",
        type: "line",
        source: "drawings",
        filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "kind"], "backfire"]],
        paint: { "line-color": "#ea580c", "line-width": 4, "line-dasharray": [1.5, 1] },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#111827", "line-width": 2, "line-dasharray": [2, 2] },
      });
      // A real fire's observed perimeters, above the fire image and the drawings.
      map.addSource("observed", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "observed-halo",
        type: "line",
        source: "observed",
        filter: ["==", ["get", "latest"], true],
        paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "observed-line",
        type: "line",
        source: "observed",
        paint: {
          "line-color": "#111827",
          "line-width": ["case", ["==", ["get", "latest"], true], 2.5, 1],
          "line-opacity": ["case", ["==", ["get", "latest"], true], 1, 0.45],
          "line-dasharray": [3, 1.5],
        },
      });
      // Last: with 3D terrain, every background/fill/line/raster run is drawn to one texture per
      // tile, and a circle layer in the middle would split that into two runs (twice the textures).
      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#fff", "circle-stroke-color": "#111827", "circle-stroke-width": 2 },
      });
      setLoaded(true);
      handlers.current.onReady?.(map);
    });
    map.on("click", (e) => handlers.current.onClick?.([e.lngLat.lng, e.lngLat.lat]));
    map.on("dblclick", (e) => {
      if (handlers.current.interactive) e.preventDefault();
      handlers.current.onDblClick?.([e.lngLat.lng, e.lngLat.lat]);
    });
    // Touch: a long press inspects a point (there is no hover). Taps also fire emulated mouse events; those are ignored.
    let press: number | undefined;
    let lastTouch = 0;
    let painting: { erase: boolean } | null = null;
    const paintAt = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent, phase: "start" | "move") =>
      painting && handlers.current.onPaint?.([e.lngLat.lng, e.lngLat.lat], phase, painting.erase);
    const endPaint = () => {
      if (!painting) return;
      painting = null;
      handlers.current.onPaint?.(null, "end", false);
    };
    map.on("mousedown", (e) => {
      if (!handlers.current.paint || e.originalEvent.button !== 0 || Date.now() - lastTouch < 1000) return;
      painting = { erase: e.originalEvent.shiftKey || e.originalEvent.altKey };
      paintAt(e, "start");
    });
    window.addEventListener("mouseup", endPaint);
    map.on("touchmove", (e) => {
      if (e.points.length === 1) paintAt(e, "move");
      else endPaint(); // a second finger: pinch to zoom
    });
    map.on("touchend", endPaint);
    map.on("touchcancel", endPaint);
    map.on("touchstart", (e) => {
      lastTouch = Date.now();
      window.clearTimeout(press);
      if (e.points.length !== 1) return;
      if (handlers.current.paint) {
        painting = { erase: false };
        paintAt(e, "start");
        return;
      }
      const start = e.point;
      const at: LngLat = [e.lngLat.lng, e.lngLat.lat];
      press = window.setTimeout(() => handlers.current.onHover?.(at), LONG_PRESS_MS);
      const cancel = (ev: maplibregl.MapTouchEvent) => {
        if (ev.type === "touchmove" && ev.point.dist(start) <= PRESS_SLOP) return;
        window.clearTimeout(press);
        for (const t of TOUCH_END) map.off(t, cancel);
      };
      for (const t of TOUCH_END) map.on(t, cancel);
    });
    map.on("touchend", () => (lastTouch = Date.now())); // a long tap also ends with emulated mouse events
    map.on("mousemove", (e) => {
      if (Date.now() - lastTouch < 1000) return;
      paintAt(e, "move");
      // Not while dragging: the cell under the pointer changes every frame and each change re-renders the app.
      if (!map.isMoving()) handlers.current.onHover?.([e.lngLat.lng, e.lngLat.lat]);
      if (!draftRef.current) return;
      hover.current = [e.lngLat.lng, e.lngLat.lat];
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData(draftFeatures(draftRef.current, hover.current));
    });
    map.on("mouseout", () => Date.now() - lastTouch > 1000 && handlers.current.onHover?.(null));
    // The mouse leaving the map (also over its title or controls) clears the hover bar; a touch long press stays until
    // closed. Never during a drag: clearing it changes the bar's height, the map resizes, and the resize ends the drag.
    const el = container.current!;
    const leave = (e: PointerEvent) => e.pointerType === "mouse" && e.buttons === 0 && handlers.current.onHover?.(null);
    el.addEventListener("pointerleave", leave);
    mapRef.current = map;
    return () => {
      el.removeEventListener("pointerleave", leave);
      window.clearTimeout(press);
      window.removeEventListener("mouseup", endPaint);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const map = loaded ? mapRef.current : null;
  const observed = props.observed;
  useEffect(() => {
    const src = map?.getSource("observed") as GeoJSONSource | undefined;
    if (!src) return;
    const shown = observed ? observed.features.filter((f) => f.properties.minute <= observed.upToMin) : [];
    src.setData({
      type: "FeatureCollection",
      features: shown.map((f, i) => ({ ...f, properties: { ...f.properties, latest: i === shown.length - 1 } })),
    } as GeoJSON.FeatureCollection);
  }, [map, observed]);
  const { grid, terrainUrl, fire, showOsm, showSatellite = false, terrain3d, contours, ignition, shapes, draft, interactive, incidents } = props;
  // The fire layer is a canvas source: drawing into the canvas and re-uploading it skips the PNG
  // encode + fetch + decode an image source costs on every time step.
  const fireCanvas = useRef<HTMLCanvasElement>(null!);
  if (!fireCanvas.current) fireCanvas.current = document.createElement("canvas");
  // A grid variant gives a new grid object on every edit; the sources, the view and the labels only
  // depend on where the grid is, so they follow this key and read the latest grid from a ref.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const gridKey = grid
    ? `${grid.header.name}:${grid.header.originX}:${grid.header.originY}:${grid.header.cellSize}:${grid.header.rows}x${grid.header.cols}`
    : null;
  const needsFit = useRef(false);

  // Pages hidden with `hidden` give the map a zero size: resize when it shows again, and fit then if needed.
  useEffect(() => {
    if (!map) return;
    const el = container.current!;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === 0) return;
      map.resize();
      const g = gridRef.current;
      if (needsFit.current && g) {
        needsFit.current = false;
        map.fitBounds(gridBounds(g.header), { padding: 20, animate: false });
      }
      // Resizing clears the canvas and resize() only schedules a frame: paint now, before the browser
      // shows the blank canvas (a long one in 3D, where every terrain tile is drawn again).
      map.redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  // After a run: once per key, and only on a map with a size (the other follows through syncMaps).
  const fitKey = props.fitBounds?.key;
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    const f = handlers.current.fitBounds;
    if (!map || !f || lastFit.current === f.key || container.current!.clientWidth === 0) return;
    lastFit.current = f.key;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(f.bounds, { padding: 40, maxZoom: 16, duration: still ? 0 : 600 });
  }, [map, fitKey]);

  // Grid change: (re)create the image sources and fit the view.
  useEffect(() => {
    const grid = gridRef.current;
    if (!map || !grid || !gridKey) return;
    const coordinates = gridCorners(grid.header);
    map.setTerrain(null);
    for (const id of ["fire", "contours", "terrain", "dem"]) {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    }
    dems.set(gridKey, grid);
    map.addSource("dem", {
      type: "raster-dem",
      encoding: "terrarium",
      tiles: [`griddem://${encodeURIComponent(gridKey)}/{z}/{x}/{y}`],
      tileSize: DEM_TILE,
      maxzoom: 13,
    });
    const blank = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    map.addSource("terrain", { type: "image", url: blank, coordinates });
    fireCanvas.current.width = grid.header.cols; // resizing also clears it
    fireCanvas.current.height = grid.header.rows;
    map.addSource("fire", { type: "canvas", canvas: fireCanvas.current, coordinates, animate: false });
    map.addLayer({ id: "terrain", type: "raster", source: "terrain", paint: { "raster-fade-duration": 0 } }, "drawings-fill");
    map.addLayer(
      { id: "fire", type: "raster", source: "fire", paint: { "raster-fade-duration": 0, "raster-resampling": "nearest" } },
      "drawings-fill",
    );
    // Over the fire, so the slope stays readable where it burns. Filled when first shown (see contourCache).
    map.addSource("contours", { type: "geojson", data: EMPTY });
    map.addLayer(
      {
        id: "contours",
        type: "line",
        source: "contours",
        layout: { visibility: "none" },
        paint: {
          "line-color": "#5b3a1e",
          "line-opacity": ["case", ["get", "index"], 0.7, 0.4],
          "line-width": ["case", ["get", "index"], 1.4, 0.6],
        },
      },
      "drawings-fill",
    );
    if (container.current!.clientWidth === 0) needsFit.current = true;
    else map.fitBounds(gridBounds(grid.header), { padding: 20, animate: false });
  }, [map, gridKey]);

  useEffect(() => {
    if (!map || !gridKey || !terrainUrl) return;
    (map.getSource("terrain") as ImageSource | undefined)?.updateImage({ url: terrainUrl });
  }, [map, gridKey, terrainUrl]);

  useEffect(() => {
    const src = map?.getSource("fire") as CanvasSource | undefined;
    if (!map || !gridKey || !src) return;
    const canvas = fireCanvas.current;
    const ctx = canvas.getContext("2d")!;
    if (fire) ctx.putImageData(fire, 0, 0);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    // With animate off the texture is uploaded once; pause() re-uploads it while "playing".
    src.play();
    src.pause();
    // In 3D every tile is drawn once to a texture and reused until the camera moves; a new canvas
    // texture doesn't invalidate it (an image source does), so the fire would only show on the next pan.
    map.terrain?.tileManager.freeRtt();
    map.triggerRepaint();
  }, [map, gridKey, fire]);

  useEffect(() => {
    if (!map || !map.getLayer("terrain")) return;
    map.setLayoutProperty("osm", "visibility", showOsm ? "visible" : "none");
    map.setLayoutProperty("satellite", "visibility", showSatellite ? "visible" : "none");
    // With a base map under it, the grid's own image turns see-through.
    map.setPaintProperty("terrain", "raster-opacity", showOsm || showSatellite ? 0.35 : 1);
  }, [map, gridKey, showOsm, showSatellite]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!map || !grid || !gridKey || !map.getLayer("contours")) return;
    if (contours) {
      if (!contourCache.has(gridKey)) contourCache.set(gridKey, contourFeatures(grid));
      (map.getSource("contours") as GeoJSONSource).setData(contourCache.get(gridKey)!);
    }
    map.setLayoutProperty("contours", "visibility", contours ? "visible" : "none");
  }, [map, gridKey, contours]);

  // Turning the relief on loads DEM tiles and tilts the view, which looks rough: a cover with a
  // spinner hides it until the map is idle (tiles loaded, animation over).
  const [loading3d, setLoading3d] = useState(false);
  useEffect(() => {
    if (!map || !gridKey) return;
    map.setTerrain(terrain3d ? { source: "dem", exaggeration: 3 } : null);
    if (terrain3d) {
      map.dragRotate.enable();
      map.touchPitch.enable();
      setLoading3d(true);
      map.easeTo({ pitch: 60, animate: false });
      const done = () => setLoading3d(false);
      map.once("idle", done);
      return () => {
        map.off("idle", done);
        setLoading3d(false);
      };
    } else {
      map.dragRotate.disable();
      map.touchPitch.disable();
      map.easeTo({ pitch: 0, bearing: 0 });
    }
  }, [map, gridKey, terrain3d]);

  useEffect(() => {
    (map?.getSource("drawings") as GeoJSONSource | undefined)?.setData(shapeFeatures(shapes));
  }, [map, shapes]);

  useEffect(() => {
    draftRef.current = draft;
    if (!draft) hover.current = null;
    (map?.getSource("draft") as GeoJSONSource | undefined)?.setData(draftFeatures(draft, hover.current));
  }, [map, draft]);

  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor = interactive ? "crosshair" : "";
    if (interactive) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [map, interactive]);

  // Painting cells: a drag paints instead of panning, and Shift+drag erases instead of zooming to a box.
  const paint = !!props.paint;
  useEffect(() => {
    if (!map) return;
    for (const handler of [map.dragPan, map.boxZoom]) {
      if (paint) handler.disable();
      else handler.enable();
    }
  }, [map, paint]);

  // Village labels (HTML markers, so no glyph server is needed offline).
  useEffect(() => {
    const grid = gridRef.current;
    if (!map || !grid || !gridKey) return;
    // Real grids have dozens of places: label only the largest ones.
    const markers = placeStats(grid)
      .sort((a, b) => b.buildings - a.buildings)
      .slice(0, MAX_LABELS)
      .map((p) => {
        const el = document.createElement("div");
        el.className = "village-label";
        el.textContent = p.name;
        return pin(map, el, gridToLngLat(grid.header, p.col, p.row));
      });
    return () => markers.forEach((remove) => remove());
  }, [map, gridKey]);

  useEffect(() => {
    if (!map || !ignition) return;
    const el = document.createElement("div");
    el.className = "ignition-marker";
    el.title = "Ponto de ignição";
    return pin(map, el, projectedToLngLat(ignition[0], ignition[1]));
  }, [map, ignition]);

  // Active incidents (fogos.pt): clickable markers that set the ignition, whatever the current tool.
  useEffect(() => {
    if (!map || !incidents?.length) return;
    const markers = incidents.map((inc) => {
      const el = document.createElement("div");
      el.className = "incident-marker";
      const r = inc.resources;
      el.title = [
        inc.place,
        `${inc.status}${inc.startedAt ? ` · início ${dayHour(inc.startedAt)}` : ""}`,
        `${r.people} operacionais · ${r.vehicles} veículos · ${r.aerial} meios aéreos`,
      ].join("\n");
      el.addEventListener("click", (e) => {
        e.stopPropagation(); // otherwise the map click also fires and adds a vertex or ignites twice
        handlers.current.onIncidentClick?.([inc.lon, inc.lat]);
      });
      return pin(map, el, [inc.lon, inc.lat]);
    });
    return () => markers.forEach((remove) => remove());
  }, [map, incidents]);

  return (
    <div className={`map-wrap ${props.className ?? ""}`}>
      <div className="map-title" style={{ borderColor: props.accent }}>
        {props.title}
      </div>
      <div ref={container} className="map" />
      {loading3d && (
        <div className="map-loading" role="status">
          <span className="spinner" aria-hidden />A preparar o relevo…
        </div>
      )}
      {props.children}
    </div>
  );
}
