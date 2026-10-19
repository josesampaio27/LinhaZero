import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type ImageSource, type StyleSpecification } from "maplibre-gl";
import type { GridData, ProjectedPoint } from "@linha-zero/engine";
import { gridBounds, gridCorners, gridToLngLat, lngLatToGrid, projectedToLngLat, type LngLat } from "../lib/projection";
import { placeStats } from "../lib/places";
import { contourSegments, contourStep } from "../lib/contours";
import type { Incident } from "../api/client";
import { dayHour } from "../lib/weather";

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
  /** Image drawn over the terrain: the fire, or the edited cells in the grid editor. */
  fireUrl: string | null;
  showOsm: boolean;
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
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#e9e7e1" } },
    { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
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
// renders Terrarium-encoded DEM tiles. Points outside the grid take the nearest edge cell.
const dems = new Map<string, GridData>();
const DEM_TILE = 256;
maplibregl.addProtocol("griddem", async ({ url }) => {
  const [key, z, x, y] = url.slice("griddem://".length).split("/");
  const grid = dems.get(decodeURIComponent(key));
  const img = new ImageData(DEM_TILE, DEM_TILE);
  if (grid) {
    const { rows, cols } = grid.header;
    const n = 2 ** +z;
    for (let py = 0; py < DEM_TILE; py++) {
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (+y + (py + 0.5) / DEM_TILE)) / n))) * 180) / Math.PI;
      for (let px = 0; px < DEM_TILE; px++) {
        const lng = ((+x + (px + 0.5) / DEM_TILE) / n) * 360 - 180;
        const g = lngLatToGrid(grid.header, lng, lat);
        const c = Math.min(cols - 1, Math.max(0, Math.floor(g.x)));
        const r = Math.min(rows - 1, Math.max(0, Math.floor(g.y)));
        const v = grid.elevation[r * cols + c] + 32768;
        const o = (py * DEM_TILE + px) * 4;
        // ImageData rounds, Terrarium needs floor.
        img.data[o] = Math.floor(v / 256);
        img.data[o + 1] = Math.floor(v % 256);
        img.data[o + 2] = Math.floor((v % 1) * 256);
        img.data[o + 3] = 255;
      }
    }
  }
  const canvas = new OffscreenCanvas(DEM_TILE, DEM_TILE);
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return { data: await (await canvas.convertToBlob()).arrayBuffer() };
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
      map.addLayer({
        id: "drawings-line",
        type: "line",
        source: "drawings",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["match", ["get", "kind"], "addBarrier", "#334155", "#1e3a8a"], "line-width": 4 },
      });
      map.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#111827", "line-width": 2, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "draft-points",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#fff", "circle-stroke-color": "#111827", "circle-stroke-width": 2 },
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
    map.on("touchstart", (e) => {
      lastTouch = Date.now();
      window.clearTimeout(press);
      if (e.points.length !== 1) return;
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
      handlers.current.onHover?.([e.lngLat.lng, e.lngLat.lat]);
      if (!draftRef.current) return;
      hover.current = [e.lngLat.lng, e.lngLat.lat];
      (map.getSource("draft") as GeoJSONSource | undefined)?.setData(draftFeatures(draftRef.current, hover.current));
    });
    map.on("mouseout", () => Date.now() - lastTouch > 1000 && handlers.current.onHover?.(null));
    mapRef.current = map;
    return () => {
      window.clearTimeout(press);
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
  const { grid, terrainUrl, fireUrl, showOsm, terrain3d, contours, ignition, shapes, draft, interactive, incidents } = props;
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
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

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
    map.addSource("fire", { type: "image", url: blank, coordinates });
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
    if (!map || !gridKey || !fireUrl) return;
    (map.getSource("fire") as ImageSource | undefined)?.updateImage({ url: fireUrl });
  }, [map, gridKey, fireUrl]);

  useEffect(() => {
    if (!map || !map.getLayer("terrain")) return;
    map.setLayoutProperty("osm", "visibility", showOsm ? "visible" : "none");
    map.setPaintProperty("terrain", "raster-opacity", showOsm ? 0.35 : 1);
  }, [map, gridKey, showOsm]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!map || !grid || !gridKey || !map.getLayer("contours")) return;
    if (contours) {
      if (!contourCache.has(gridKey)) contourCache.set(gridKey, contourFeatures(grid));
      (map.getSource("contours") as GeoJSONSource).setData(contourCache.get(gridKey)!);
    }
    map.setLayoutProperty("contours", "visibility", contours ? "visible" : "none");
  }, [map, gridKey, contours]);

  useEffect(() => {
    if (!map || !gridKey) return;
    map.setTerrain(terrain3d ? { source: "dem", exaggeration: 3 } : null);
    if (terrain3d) {
      map.dragRotate.enable();
      map.touchPitch.enable();
      map.easeTo({ pitch: 60 });
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
        return new maplibregl.Marker({ element: el }).setLngLat(gridToLngLat(grid.header, p.col, p.row)).addTo(map);
      });
    return () => markers.forEach((m) => m.remove());
  }, [map, gridKey]);

  useEffect(() => {
    if (!map || !ignition) return;
    const el = document.createElement("div");
    el.className = "ignition-marker";
    el.title = "Ponto de ignição";
    const m = new maplibregl.Marker({ element: el }).setLngLat(projectedToLngLat(ignition[0], ignition[1])).addTo(map);
    return () => {
      m.remove();
    };
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
      return new maplibregl.Marker({ element: el }).setLngLat([inc.lon, inc.lat]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, incidents]);

  return (
    <div className={`map-wrap ${props.className ?? ""}`}>
      <div className="map-title" style={{ borderColor: props.accent }}>
        {props.title}
      </div>
      <div ref={container} className="map" />
      {props.children}
    </div>
  );
}
