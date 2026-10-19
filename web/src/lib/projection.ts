import proj4 from "proj4";
import { gridToProjected, projectedToGrid, type GridHeader, type GridPoint } from "@linha-zero/engine";

// PT-TM06 / ETRS89 (EPSG:3763).
proj4.defs(
  "EPSG:3763",
  "+proj=tmerc +lat_0=39.66825833333333 +lon_0=-8.133108333333334 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
);
const toWgs = proj4("EPSG:3763", "EPSG:4326");

export type LngLat = [number, number];

/** EPSG:3763 metres -> [lng, lat]. */
export function projectedToLngLat(x: number, y: number): LngLat {
  return toWgs.forward([x, y]) as LngLat;
}

/** [lng, lat] -> EPSG:3763 metres. */
export function lngLatToProjected(lng: number, lat: number): [number, number] {
  return toWgs.inverse([lng, lat]) as [number, number];
}

export function gridToLngLat(header: GridHeader, gx: number, gy: number): LngLat {
  const p = gridToProjected(header, gx, gy);
  return projectedToLngLat(p.x, p.y);
}

export function lngLatToGrid(header: GridHeader, lng: number, lat: number): GridPoint {
  const [x, y] = lngLatToProjected(lng, lat);
  return projectedToGrid(header, x, y);
}

/** Grid corners as [lng, lat], in MapLibre image-source order: NW, NE, SE, SW. */
export function gridCorners(header: GridHeader): [LngLat, LngLat, LngLat, LngLat] {
  const { rows, cols } = header;
  return [gridToLngLat(header, 0, 0), gridToLngLat(header, cols, 0), gridToLngLat(header, cols, rows), gridToLngLat(header, 0, rows)];
}

export function gridBounds(header: GridHeader): [LngLat, LngLat] {
  const cs = gridCorners(header);
  const lngs = cs.map((c) => c[0]), lats = cs.map((c) => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
