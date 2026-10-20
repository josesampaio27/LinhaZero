// Generates the hero's fire once, as GeoJSON in WGS84: the same fire on the Guimarães grid under decision A and
// decision B, the cells classed by the hour the fire arrives (h1..h4). Run from the repo root:
//   npx tsx landing/scripts/hero-fire.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  comparePaired,
  decodeGrid,
  gridLayerNames,
  prepareGrid,
  rasterizePolygon,
  rasterizePolyline,
  simulate,
  type GridHeader,
  type LayerBuffers,
  type Scenario,
} from "@linha-zero/engine";
import { gridToLngLat, lngLatToGrid } from "../../web/src/lib/projection";

const dir = "web/public/grids/guimaraes";
const header: GridHeader = JSON.parse(readFileSync(`${dir}/header.json`, "utf8"));
const buffers = Object.fromEntries(
  gridLayerNames(header).map((layer) => {
    const b = readFileSync(`${dir}/${header.layers[layer]!}`);
    return [layer, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)];
  }),
) as LayerBuffers;
const grid = decodeGrid(header, buffers);
const prepared = prepareGrid(grid);
const { rows, cols } = header;

// Up on the western flank of the Penha hill, on a dry afternoon; the wind from the south-west pushes the
// fire north-east over the ridge.
const ign = lngLatToGrid(header, -8.276, 41.423);
const ignition = { row: Math.floor(ign.y), col: Math.floor(ign.x) };
const wind = { directionDeg: 220, speedMs: 9 };
const durationMin = 240;
const moisture = { d1: 0.04, d10: 0.05, d100: 0.07, liveHerb: 0.3, liveWoody: 0.8 };
const base: Omit<Scenario, "interventions"> = { ignition, wind, durationMin, spreadModel: "rothermel", moisture };

// Downwind unit vector in grid cells (x east, y south) and its perpendicular.
const th = (wind.directionDeg * Math.PI) / 180;
const d = { x: -Math.sin(th), y: Math.cos(th) }, p = { x: -d.y, y: d.x };
const at = (along: number, across: number) => ({ x: ign.x + d.x * along + p.x * across, y: ign.y + d.y * along + p.y * across });
// A: a containment line across the head, 2.2 km downwind, ready at minute 45.
const linePts = [at(22, -14), at(22, -5), at(22, 5), at(22, 14)];
const line = rasterizePolyline(linePts, rows, cols);
// B: direct attack on the head of the fire, 800 m downwind, from minute 30.
const attack = rasterizePolygon([at(3, -5), at(13, -5), at(13, 5), at(3, 5)], rows, cols);

const A = simulate(prepared, { ...base, interventions: [{ kind: "containmentLine", cells: line, startMin: 45 }] });
const B = simulate(prepared, { ...base, interventions: [{ kind: "suppression", cells: attack, startMin: 30, rateFactor: 0.2 }] });

/** Class of a cell under a decision: the hour the fire arrives, or null if it does not burn. */
function cellClass(arrival: Float32Array, i: number): string | null {
  const t = arrival[i];
  return t <= durationMin ? `h${Math.min(4, Math.ceil(t / 60) || 1)}` : null;
}

/** One rectangle per run of same-class cells in a row, so the file stays small; keys are "<decision>/<class>". */
const polygons = new Map<string, GeoJSON.Position[][][]>();
for (const [decision, res] of [["A", A], ["B", B]] as const) {
  for (let r = 0; r < rows; r++) {
    for (let c0 = 0; c0 < cols; ) {
      const k = cellClass(res.arrivalMin, r * cols + c0);
      let c1 = c0 + 1;
      while (c1 < cols && cellClass(res.arrivalMin, r * cols + c1) === k) c1++;
      if (k) {
        const key = `${decision}/${k}`;
        const ring = [[c0, r], [c1, r], [c1, r + 1], [c0, r + 1], [c0, r]].map(([x, y]) => gridToLngLat(header, x, y).map((v) => +v.toFixed(5)));
        (polygons.get(key) ?? polygons.set(key, []).get(key)!).push([ring]);
      }
      c0 = c1;
    }
  }
}

const feature = (properties: Record<string, unknown>, geometry: GeoJSON.Geometry): GeoJSON.Feature => ({ type: "Feature", properties, geometry });
const out: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    ...[...polygons].map(([key, coordinates]) => {
      const [decision, k] = key.split("/");
      return feature({ kind: "fire", decision, class: k }, { type: "MultiPolygon", coordinates });
    }),
    feature({ kind: "ignition" }, { type: "Point", coordinates: gridToLngLat(header, ignition.col + 0.5, ignition.row + 0.5) }),
  ],
};
writeFileSync("landing/public/hero/fire.json", JSON.stringify(out));
const ha = (r: typeof A) => r.metrics.burnedHaByHour.at(-1);
console.log(`ignição ${ignition.row},${ignition.col}; A (linha): ${ha(A)} ha, ${A.metrics.buildingsReached} edifícios; B (ataque): ${ha(B)} ha, ${B.metrics.buildingsReached} edifícios`);
for (const [name, res] of [["A", A], ["B", B]] as const)
  console.log(`villages ${name}:`, res.metrics.villages.filter((v) => v.firstArrivalMin !== null).map((v) => `${v.name}@${Math.round(v.firstArrivalMin!)}`).join(", "));
console.log("classes:", [...polygons].map(([k, p]) => `${k}=${p.length}`).join(" "));

// The ensemble the interface runs (30 paired wind variations), for the "B é melhor em N de 30" sentence.
const ensemble = { runs: 30, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 2035 };
const EA = simulate(prepared, { ...base, ensemble, interventions: [{ kind: "containmentLine", cells: line, startMin: 45 }] });
const EB = simulate(prepared, { ...base, ensemble, interventions: [{ kind: "suppression", cells: attack, startMin: 30, rateFactor: 0.2 }] });
for (const key of ["buildingsReached", "burnedHa"] as const) {
  const c = comparePaired(EA.runs!, EB.runs!, key);
  console.log(`${key}: B melhor em ${c.bBetter}, A melhor em ${c.aBetter}, empate em ${c.ties} de ${c.runs}`);
}

// ---------- Background textures, drawn from the same data (docs/plano/landing.md §8) ----------
// One graphic language: fine single-weight lines or dots, in one colour, at low contrast, as small static SVGs
// that the page uses as CSS backgrounds. Each section that has one gets its own layer, not a repeated tile.
import { contourSegments } from "../../web/src/lib/contours";

/** Bilinear resample of a grid window [r0, r1) × [c0, c1) at k samples per cell, so the lines come out smooth. */
function resample(z: ArrayLike<number>, r0: number, c0: number, r1: number, c1: number, k: number) {
  const h = Math.round((r1 - r0) * k), w = Math.round((c1 - c0) * k), out = new Float32Array(h * w);
  const at = (r: number, c: number) => z[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fr = r0 + y / k, fc = c0 + x / k, r = Math.floor(fr), c = Math.floor(fc), tr = fr - r, tc = fc - c;
      out[y * w + x] = (at(r, c) * (1 - tc) + at(r, c + 1) * tc) * (1 - tr) + (at(r + 1, c) * (1 - tc) + at(r + 1, c + 1) * tc) * tr;
    }
  }
  return { z: out, h, w };
}

/** Marching-squares segments chained into polylines, as one SVG path string (0.1-unit precision). */
function contourPath(z: Float32Array, h: number, w: number, step: number, keep: (level: number) => boolean, minPoints = 2): string {
  const segs = contourSegments(z, h, w, step).filter((s) => keep(s.level));
  const key = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const ends = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s.a, s.b]) (ends.get(key(p)) ?? ends.set(key(p), []).get(key(p))!).push(i);
  });
  const used = new Uint8Array(segs.length);
  let d = "";
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i].a, segs[i].b];
    for (;;) {
      const tail = key(line.at(-1)!);
      const next = (ends.get(tail) ?? []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      line.push(key(segs[next].a) === tail ? segs[next].b : segs[next].a);
    }
    if (line.length < minPoints) continue; // tiny rings are noise at page scale
    d += "M" + line.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L");
  }
  return d;
}

function svgFile(name: string, w: number, h: number, body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  writeFileSync(`landing/public/textures/${name}`, svg);
  console.log(`textures/${name}: ${Math.round(svg.length / 1024)} KB`);
}
mkdirSync("landing/public/textures", { recursive: true });

// 1. The hero fire under decision A, as arrival lines every hour ("A resposta"). Cells the fire never
// reaches sit just past the last line, so the four-hour line closes.
{
  const t = Float32Array.from(A.arrivalMin, (v) => (Number.isFinite(v) && v <= durationMin ? v : durationMin + 30));
  let r0 = rows, r1 = 0, c0 = cols, c1 = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] > durationMin) continue;
    const r = Math.floor(i / cols), c = i % cols;
    r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
  }
  const m = 10, k = 4;
  const win = resample(t, r0 - m, c0 - m, r1 + m, c1 + m, k);
  const d = contourPath(win.z, win.h, win.w, 60, (l) => l >= 60 && l <= durationMin);
  svgFile("isocronas.svg", win.w, win.h, `<path d="${d}" fill="none" stroke="#e5ebe8" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
}

// 2. The relief of the Penha every 50 metres, around its summit ("Pedir acesso"), in a dark ink for the teal field.
{
  let best = ignition, top = -Infinity;
  for (let r = ignition.row - 25; r <= ignition.row + 25; r++) {
    for (let c = ignition.col - 25; c <= ignition.col + 25; c++) {
      const v = grid.elevation[r * cols + c];
      if (v > top) { top = v; best = { row: r, col: c }; }
    }
  }
  const m = 17, k = 2; // 50 m samples: smooth enough at page scale, and under 40 KB gzipped
  const win = resample(grid.elevation, best.row - m, best.col - m * 1.6, best.row + m, best.col + m * 1.6, k);
  const d = contourPath(win.z, win.h, win.w, 50, () => true);
  svgFile("penha-relevo.svg", win.w, win.h, `<path d="${d}" fill="none" stroke="#032a2e" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
  console.log(`Penha: cume a ${Math.round(top)} m na célula ${best.row},${best.col}`);
}

// 3. Every 100 m cell of the grid with four buildings or more, one dot sized by how many (the footer): the
// settlements, without the scatter of lone houses.
{
  const buckets: [number, number, number][] = [[4, 15, 0.3], [16, Infinity, 0.48]];
  const paths = buckets.map(() => "");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = grid.buildings[r * cols + c];
      const b = n ? buckets.findIndex(([lo, hi]) => n >= lo && n <= hi) : -1;
      if (b >= 0) paths[b] += `M${c + 0.5} ${r + 0.5}h0`;
    }
  }
  const body = paths.map((d, i) => `<path d="${d}" stroke="#e5ebe8" stroke-width="${buckets[i][2]}" stroke-linecap="round"/>`).join("");
  svgFile("edificios.svg", cols, rows, body);
}

// 4. The whole grid's relief every 50 metres, from the city to the Penha: the field behind "A resposta", edge
// to edge, under the hour lines of the fire.
{
  const win = resample(grid.elevation, 0, 0, rows, cols, 1);
  const d = contourPath(win.z, win.h, win.w, 50, () => true, 8);
  svgFile("guimaraes-relevo.svg", win.w, win.h, `<path d="${d}" fill="none" stroke="#e5ebe8" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
}
