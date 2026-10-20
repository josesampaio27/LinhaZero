// Generates the hero's fire once, as GeoJSON in WGS84: the same fire on the Guimarães grid under decision A and
// decision B, the cells classed by the hour the fire arrives (h1..h4). Run from the repo root:
//   npx tsx landing/scripts/hero-fire.ts
import { readFileSync, writeFileSync } from "node:fs";
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

// The relief's contour lines as a small SVG, used as a mask for faint backgrounds on the page.
import { contourSegments } from "../../web/src/lib/contours";
{
  const step = 100;
  const byLevel = new Map<number, string[]>();
  for (const s of contourSegments(grid.elevation, rows, cols, step)) {
    (byLevel.get(s.level) ?? byLevel.set(s.level, []).get(s.level)!).push(`M${s.a[0].toFixed(1)} ${s.a[1].toFixed(1)}L${s.b[0].toFixed(1)} ${s.b[1].toFixed(1)}`);
  }
  const paths = [...byLevel].map(([, d]) => `<path d="${d.join("")}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" fill="none" stroke="#000" stroke-width="0.18" stroke-linecap="round">${paths}</svg>`;
  writeFileSync("landing/public/hero/contours.svg", svg);
  console.log(`contours.svg: ${byLevel.size} níveis, ${Math.round(svg.length / 1024)} KB`);
}
