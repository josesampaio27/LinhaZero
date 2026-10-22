import { useSyncExternalStore } from "react";

// How the maps look (base map, contours, 3D relief), shared by the simulation and the grid editor and remembered
// in this browser. If storage is unavailable, the choices still last for the session.

export interface MapPrefs {
  /** One base map under the grid at a time. */
  baseMap: "osm" | "satellite" | null;
  contours: boolean;
  terrain3d: boolean;
}

const KEY = "linha-zero:mapa";
const DEFAULTS: MapPrefs = { baseMap: "osm", contours: true, terrain3d: true };

function load(): MapPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MapPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let prefs: MapPrefs = load();
const listeners = new Set<() => void>();

export function setMapPrefs(patch: Partial<MapPrefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or full storage: keep the choice for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The map options; re-renders when either page changes them. */
export function useMapPrefs(): MapPrefs {
  return useSyncExternalStore(subscribe, () => prefs);
}
