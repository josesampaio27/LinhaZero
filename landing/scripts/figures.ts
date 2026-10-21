// The map figures of the /motor and /calibracao pages, drawn straight from the grids and a real fire, one pixel per
// cell (the page enlarges them without smoothing). No image tools: a small PNG writer on node:zlib.
//   npx tsx landing/scripts/figures.ts
// Writes landing/public/figures/:
//   camada-{combustivel,relevo,copas,edificios}.png   the Guimarães 100 m grid, layer by layer
//   alijo-{fisico,calibrado}.png                       Alijó 2019 from the ignition: simulated arrival by hour, with the
//                                                      observed perimeter of the last observation over it
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { calibrationFor } from "../../engine/src/calibration";
import { prepareGrid } from "../../engine/src/grid";
import { simulate } from "../../engine/src/simulate";
import type { PreparedGrid } from "../../engine/src/types";
import { loadGridFromDir } from "../../engine/scripts/load-grid-node";
import { loadCase, scenarioOf } from "../../engine/scripts/reference";

const ROOT = join(import.meta.dirname, "../..");
const OUT = join(ROOT, "landing/public/figures");
mkdirSync(OUT, { recursive: true });

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/** A PNG of rows × cols RGB pixels. */
function png(file: string, cols: number, rows: number, pixel: (i: number) => RGB) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cols, 0);
  ihdr.writeUInt32BE(rows, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(rows * (1 + cols * 3));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const [R, G, B] = pixel(r * cols + c);
      const o = r * (1 + cols * 3) + 1 + c * 3;
      raw[o] = R;
      raw[o + 1] = G;
      raw[o + 2] = B;
    }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFileSync(join(OUT, file), Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  console.log(`${file}: ${cols}×${rows}`);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * Math.max(0, Math.min(1, t)))) as RGB;
const GROUND = hex("#111615");
const NONE = hex("#1f2927");

/** Hillshade from the elevation (sun from the north-west), 0 dark to 1 lit. */
function hillshade(g: PreparedGrid): Float32Array {
  const { rows, cols, cellSize } = g.header;
  const z = g.elevation;
  const out = new Float32Array(rows * cols);
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const at = (rr: number, cc: number) => z[Math.min(rows - 1, Math.max(0, rr)) * cols + Math.min(cols - 1, Math.max(0, cc))];
      const dzdx = (at(r, c + 1) - at(r, c - 1)) / (2 * cellSize);
      const dzdy = (at(r + 1, c) - at(r - 1, c)) / (2 * cellSize);
      const slope = Math.atan(Math.hypot(dzdx, dzdy) * 2);
      const aspect = Math.atan2(dzdy, -dzdx);
      out[r * cols + c] = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(az - aspect));
    }
  return out;
}

// 1. The Guimarães grid, layer by layer.
const g = prepareGrid(loadGridFromDir(join(ROOT, "web/public/grids/guimaraes")));
const { rows, cols } = g.header;
const GROUP: Record<string, RGB> = { F: hex("#a9925a"), M: hex("#4f8a5b"), V: hex("#9fb35a"), H: hex("#d8c46a") };
const groupOf = (code: number) => g.header.fuelTable[code]?.rothermel?.group;
png("camada-combustivel.png", cols, rows, (i) => (g.barrier[i] ? hex("#d9d2c3") : GROUP[groupOf(g.fuel[i]) ?? ""] ?? NONE));
const shade = hillshade(g);
let zmin = Infinity, zmax = -Infinity;
for (const v of g.elevation) {
  zmin = Math.min(zmin, v);
  zmax = Math.max(zmax, v);
}
png("camada-relevo.png", cols, rows, (i) => {
  const t = (g.elevation[i] - zmin) / (zmax - zmin);
  return mix(mix(hex("#24302d"), hex("#8fa39b"), t), hex("#e5ebe8"), shade[i] * 0.45);
});
png("camada-copas.png", cols, rows, (i) => {
  const c = g.canopy?.[i] ?? 0;
  return c > 100 ? NONE : mix(NONE, hex("#3f9a5c"), c / 80);
});
png("camada-edificios.png", cols, rows, (i) => (g.buildings[i] ? mix(hex("#6b7773"), hex("#ffffff"), Math.min(1, g.buildings[i] / 12)) : g.barrier[i] ? hex("#2b3533") : GROUND));

// 2. Alijó 2019 from the ignition, physical and calibrated: the arrival hour in the fire ramp (yellow first, red
// last), the observed perimeter of the last observation in white.
const fire = loadCase("Alijo_24072019", join(ROOT, "data-prep/out/reference"));
const last = fire.observationMinutes[fire.observationMinutes.length - 1];
const RAMP = ["#f6d35a", "#f0963a", "#de5a2a", "#b8302a"].map(hex);
const ramp = (t: number): RGB => {
  const x = Math.max(0, Math.min(0.999, t)) * (RAMP.length - 1);
  const k = Math.floor(x);
  return mix(RAMP[k], RAMP[k + 1] ?? RAMP[k], x - k);
};
const fr = fire.grid.header.rows, fc = fire.grid.header.cols;
const edge = new Uint8Array(fr * fc);
const burned = (i: number) => fire.observed[i] <= last;
for (let r = 0; r < fr; r++)
  for (let c = 0; c < fc; c++) {
    const i = r * fc + c;
    if (!burned(i)) continue;
    const out = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
      const rr = r + dr, cc = c + dc;
      return rr < 0 || cc < 0 || rr >= fr || cc >= fc || !burned(rr * fc + cc);
    });
    if (out) edge[i] = 1;
  }
const fshade = hillshade(fire.grid);
for (const [name, params] of [["fisico", {}], ["calibrado", calibrationFor(100).params]] as const) {
  const a = simulate(fire.grid, scenarioOf(fire, "rothermel", params)).arrivalMin;
  png(`alijo-${name}.png`, fc, fr, (i) => {
    if (edge[i]) return [255, 255, 255];
    if (a[i] <= last) return ramp(a[i] / last);
    return mix(hex("#161d1c"), hex("#3a4644"), fshade[i] * 0.8);
  });
}
console.log(`Alijó: última observação ao minuto ${last}`);
