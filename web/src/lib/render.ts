import { computeSlopeAspect, type GridData } from "@linha-zero/engine";

// Colours for the synthetic fuel codes; other codes get a colour from their base rate.
const FUEL_COLORS: Record<number, [number, number, number]> = {
  1: [233, 228, 166], // Herbáceo
  2: [181, 201, 138], // Mato
  3: [94, 140, 74], // Floresta
  4: [227, 201, 154], // Agrícola
};
const BARRIER: [number, number, number] = [120, 132, 150];
const BUILDING: [number, number, number] = [122, 74, 42];

function fuelColor(grid: GridData, code: number): [number, number, number] {
  if (grid.header.name === "sintetica" && FUEL_COLORS[code]) return FUEL_COLORS[code];
  const rate = grid.header.fuelTable[code]?.baseRate ?? 0;
  if (rate <= 0) return [205, 205, 200];
  // Slow fuels dark green, fast fuels pale yellow.
  const t = Math.min(1, rate / 20);
  return [Math.round(80 + 155 * t), Math.round(130 + 98 * t), Math.round(70 + 96 * t)];
}

function toDataUrl(canvas: HTMLCanvasElement, img: ImageData): string {
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

function makeCanvas(cols: number, rows: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  return c;
}

/** CSS colour of a fuel code on the offline base map, for legends and tables. */
export function fuelSwatch(grid: GridData, code: number): string {
  const [r, g, b] = fuelColor(grid, code);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Vertical exaggeration of the hillshade, so gentle valleys and ridges still show. */
const SHADE_Z = 2;

/** Hillshade multiplier per cell (light from the north-west). */
function hillshade(grid: GridData): Float32Array {
  const { rows, cols, cellSize } = grid.header;
  const { slopeDeg, aspectDeg } = computeSlopeAspect(grid.elevation, rows, cols, cellSize);
  const out = new Float32Array(rows * cols);
  const zen = (45 * Math.PI) / 180;
  const az = (315 * Math.PI) / 180;
  for (let i = 0; i < out.length; i++) {
    const s = Math.atan(SHADE_Z * Math.tan((slopeDeg[i] * Math.PI) / 180));
    const a = (aspectDeg[i] * Math.PI) / 180;
    const shade = Math.max(0, Math.cos(zen) * Math.cos(s) + Math.sin(zen) * Math.sin(s) * Math.cos(az - a));
    out[i] = 0.25 + 1.0 * shade;
  }
  return out;
}

/** Fills an image cell by cell with colour(i) times the hillshade. */
function shaded(grid: GridData, colour: (i: number) => [number, number, number]): string {
  const { rows, cols } = grid.header;
  const k = hillshade(grid);
  const img = new ImageData(cols, rows);
  for (let i = 0; i < rows * cols; i++) {
    const rgb = colour(i);
    img.data[i * 4] = Math.min(255, rgb[0] * k[i]);
    img.data[i * 4 + 1] = Math.min(255, rgb[1] * k[i]);
    img.data[i * 4 + 2] = Math.min(255, rgb[2] * k[i]);
    img.data[i * 4 + 3] = 255;
  }
  return toDataUrl(makeCanvas(cols, rows), img);
}

/** Offline base map: fuel colours modulated by hillshade, barriers and buildings. Returns a PNG data URL. */
export function renderTerrain(grid: GridData): string {
  return shaded(grid, (i) =>
    grid.buildings[i] > 0 ? BUILDING : grid.barrier[i] === 1 ? BARRIER : fuelColor(grid, grid.fuel[i]),
  );
}

export type LayerView = "fuel" | "elevation" | "slope" | "village";

/** Slope classes for the grid editor: slope is what speeds the fire uphill. */
export const SLOPE_CLASSES: { upToDeg: number; rgb: [number, number, number]; label: string }[] = [
  { upToDeg: 10, rgb: [167, 201, 140], label: "< 10°" },
  { upToDeg: 20, rgb: [240, 214, 110], label: "10–20°" },
  { upToDeg: 30, rgb: [232, 140, 60], label: "20–30°" },
  { upToDeg: Infinity, rgb: [196, 52, 44], label: "> 30°" },
];

const ELEVATION_STOPS: [number, [number, number, number]][] = [
  [0, [92, 145, 84]],
  [0.4, [214, 206, 132]],
  [0.75, [163, 112, 72]],
  [1, [240, 236, 228]],
];

/** One layer of the grid as an image: fuel (the base map), elevation, slope class, or the place each cell belongs to. */
export function renderLayer(grid: GridData, view: LayerView): string {
  if (view === "fuel") return renderTerrain(grid);
  if (view === "elevation") {
    let lo = Infinity, hi = -Infinity;
    for (const z of grid.elevation) {
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
    const span = hi > lo ? hi - lo : 1;
    return shaded(grid, (i) => ramp(ELEVATION_STOPS, (grid.elevation[i] - lo) / span));
  }
  if (view === "slope") {
    const { rows, cols, cellSize } = grid.header;
    const { slopeDeg } = computeSlopeAspect(grid.elevation, rows, cols, cellSize);
    return shaded(grid, (i) => (SLOPE_CLASSES.find((c) => slopeDeg[i] < c.upToDeg) ?? SLOPE_CLASSES[0]).rgb);
  }
  // Places: each in its own colour, everything else a mid grey so the hillshade still reads.
  return shaded(grid, (i) => {
    const v = grid.village[i];
    if (!v) return [190, 188, 180];
    const hue = (v * 137.508) % 360;
    return hsl(hue, 0.55, 0.55);
  });
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Cells where mask[i] is set, in one translucent colour (the edited cells in the grid editor). */
export function renderMask(mask: Uint8Array, cols: number, rows: number, rgb: [number, number, number]): string {
  const img = new ImageData(cols, rows);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 150;
  }
  return toDataUrl(makeCanvas(cols, rows), img);
}

// Arrival-time ramp: yellow (early) -> orange -> red -> dark red (late).
const ARRIVAL_STOPS: [number, [number, number, number]][] = [
  [0, [255, 224, 102]],
  [0.35, [249, 115, 22]],
  [0.7, [200, 30, 30]],
  [1, [90, 0, 0]],
];
// Probability ramp: pale (unlikely) -> deep purple-red (certain).
const PROB_STOPS: [number, [number, number, number]][] = [
  [0, [254, 240, 138]],
  [0.5, [234, 88, 12]],
  [1, [127, 29, 29]],
];

function ramp(stops: [number, [number, number, number]][], t: number): [number, number, number] {
  for (let s = 1; s < stops.length; s++) {
    const [t1, c1] = stops[s];
    const [t0, c0] = stops[s - 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return stops[stops.length - 1][1];
}

/** Reusable renderer for the fire layer of one map. */
export class FireRenderer {
  private canvas: HTMLCanvasElement;
  private img: ImageData;

  constructor(private cols: number, private rows: number) {
    this.canvas = makeCanvas(cols, rows);
    this.img = new ImageData(cols, rows);
  }

  /** Cells with arrival <= t (minutes), coloured by arrival time over durationMin. */
  arrival(arrivalMin: Float32Array | null, t: number, durationMin: number): string {
    const d = this.img.data;
    d.fill(0);
    if (arrivalMin) {
      for (let i = 0; i < arrivalMin.length; i++) {
        const a = arrivalMin[i];
        if (!(a <= t)) continue;
        const [r, g, b] = ramp(ARRIVAL_STOPS, Math.min(1, a / durationMin));
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
        d[i * 4 + 3] = 215;
      }
    }
    return toDataUrl(this.canvas, this.img);
  }

  /** Burn probability (0..1); cells below 2% stay transparent. */
  probability(p: Float32Array | null): string {
    const d = this.img.data;
    d.fill(0);
    if (p) {
      for (let i = 0; i < p.length; i++) {
        if (p[i] < 0.02) continue;
        const [r, g, b] = ramp(PROB_STOPS, p[i]);
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
        d[i * 4 + 3] = 90 + 140 * p[i];
      }
    }
    return toDataUrl(this.canvas, this.img);
  }

  /** Cells with arrival <= t, coloured by fireline intensity class (INTENSITY_CLASSES). */
  intensity(intensityKwM: Float32Array | null, arrivalMin: Float32Array | null, t: number): string {
    const d = this.img.data;
    d.fill(0);
    if (intensityKwM && arrivalMin) {
      for (let i = 0; i < intensityKwM.length; i++) {
        if (!(arrivalMin[i] <= t)) continue;
        const k = INTENSITY_CLASSES.findIndex((c) => intensityKwM[i] < c.upToKwM);
        const [r, g, b] = INTENSITY_CLASSES[k < 0 ? INTENSITY_CLASSES.length - 1 : k].rgb;
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
        d[i * 4 + 3] = 225;
      }
    }
    return toDataUrl(this.canvas, this.img);
  }

  get size(): [number, number] {
    return [this.cols, this.rows];
  }
}

export const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Fireline intensity classes by what can work against the fire (Alexander; the thresholds of "Ataque" in the engine). */
export const INTENSITY_CLASSES: { upToKwM: number; rgb: [number, number, number]; label: string }[] = [
  { upToKwM: 500, rgb: [253, 224, 71], label: "< 500 kW/m · meios terrestres" },
  { upToKwM: 2000, rgb: [249, 115, 22], label: "500–2000 · máquinas" },
  { upToKwM: 4000, rgb: [220, 38, 38], label: "2000–4000 · meios aéreos" },
  { upToKwM: Infinity, rgb: [76, 5, 25], label: "> 4000 · fora de controlo" },
];
