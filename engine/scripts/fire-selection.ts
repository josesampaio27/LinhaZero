// Which PT-FireSprd fires make sense for calibrating the engine on a grid (ADR 0064). Decided from the data
// alone, before any model is scored on them, so the choice cannot be tuned to the results:
//   tsx scripts/fire-selection.ts --cases ../data-prep/out/reference-30m --grid ../web/public/grids/guimaraes-30m \
//     --out ../engine/reports/selection-30m.json
//
// Per fire, from the case (observed arrival and the FUMOD map of the case) and the target grid's fuel map:
//   nonBurnable  share of the area observed burned with a time that the fuel map says cannot burn (urban,
//                farmland, water, rock, roads): the map and the fire disagree there, and the engine
//                cannot reproduce it;
//   targetFuels  share of the burned burnable area in fuel models that cover at least 0.5% of the target
//                grid's burnable area: the fuels the engine actually burns there;
//   similarity   overlap of the burned fuel mix with the target grid's (Σ min of the two shares);
//   scorable     intervals with at least 5 ha of new observed area (what the calibration scores);
//   distanceKm   from the target grid's centre.
// Rule (fit): tier A (fuel map of the fire's own year), at least one scorable interval, nonBurnable ≤
// MAX_NON_BURNABLE and targetFuels ≥ MIN_TARGET_FUELS. Locked (read once, at the end, as a paired check):
// tier B fires within --locked-km of the target, under the same data rules; none by default, since their
// fuel map (2018) shows the regrowth after the fire (2016 scars: ~95% V-MH) or no fuel at all (2017 scars),
// not what burned (ADR 0064).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { prepareGrid } from "../src/grid";
import { loadGridFromDir } from "./load-grid-node";
import { intervalBounds } from "./intervals";
import { loadCase, REFERENCE_DIR } from "./reference";

export const MAX_NON_BURNABLE = 0.25;
export const MIN_TARGET_FUELS = 0.6;
export const MIN_TARGET_SHARE = 0.005;
export const MIN_NEW_HA = 5;
export const DEFAULT_LOCKED_KM = 0;

const args = process.argv.slice(2);
const text = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const CASES = resolve(text("cases", join(import.meta.dirname, "../../data-prep/out/reference-30m")));
const GRID = resolve(text("grid", join(import.meta.dirname, "../../web/public/grids/guimaraes-30m")));
const OUT = text("out", "");
const LOCKED_KM = Number(text("locked-km", String(DEFAULT_LOCKED_KM)));

interface Entry {
  fire: string;
  year: number;
  region: string;
  tier: "A" | "B";
  fit: boolean;
  centroid: [number, number];
}

// The target grid: burnable fuel shares and its centre.
const target = prepareGrid(loadGridFromDir(GRID));
const targetCounts = new Map<number, number>();
let targetBurnable = 0;
for (let i = 0; i < target.fuel.length; i++)
  if (target.baseRate[i] > 0) {
    targetCounts.set(target.fuel[i], (targetCounts.get(target.fuel[i]) ?? 0) + 1);
    targetBurnable++;
  }
const targetShare = new Map([...targetCounts].map(([k, v]) => [k, v / targetBurnable]));
const labelOf = (code: number) => target.header.fuelTable[code]?.label ?? String(code);
// The target's centre (lat, lon): --centre lat,lon, by default Guimarães.
const centre = text("centre", "41.4425,-8.2918").split(",").map(Number) as [number, number];

const km = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

// The cases' own manifest, or the committed one (fire, tier, region and observations do not depend on the cell size).
const manifestPath = existsSync(join(CASES, "manifest.json")) ? join(CASES, "manifest.json") : join(REFERENCE_DIR, "manifest.json");
const manifest: Entry[] = JSON.parse(readFileSync(manifestPath, "utf8")).cases;
const rowsOut = [];
for (const e of manifest) {
  if (!existsSync(join(CASES, e.fire, "case.json"))) continue;
  const c = loadCase(e.fire, CASES);
  const cellHa = (c.grid.header.cellSize * c.grid.header.cellSize) / 10_000;
  let burned = 0, nonBurnable = 0;
  const counts = new Map<number, number>();
  for (let i = 0; i < c.observed.length; i++) {
    const o = c.observed[i];
    if (!Number.isFinite(o)) continue; // Infinity: did not burn; NaN: burned at an unknown time
    burned++;
    if (!(c.grid.baseRate[i] > 0)) nonBurnable++;
    else counts.set(c.grid.fuel[i], (counts.get(c.grid.fuel[i]) ?? 0) + 1);
  }
  const burnable = burned - nonBurnable;
  let inTarget = 0, similarity = 0;
  for (const [code, k] of counts) {
    const share = k / burnable;
    const t = targetShare.get(code) ?? 0;
    if (t >= MIN_TARGET_SHARE) inTarget += share;
    similarity += Math.min(share, t);
  }
  const scorable = intervalBounds(c).filter(([a, b]) => {
    let k = 0;
    for (let i = 0; i < c.observed.length; i++) if (c.observed[i] > a && c.observed[i] <= b) k++;
    return k * cellHa >= MIN_NEW_HA;
  }).length;
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, k]) => `${labelOf(code)} ${Math.round((100 * k) / burnable)}%`);
  rowsOut.push({
    fire: e.fire,
    tier: e.tier,
    year: e.year,
    region: e.region,
    burnedHa: Math.round(burned * cellHa),
    cells: c.grid.header.rows * c.grid.header.cols,
    nonBurnable: nonBurnable / Math.max(1, burned),
    targetFuels: burnable ? inTarget : 0,
    similarity,
    scorable,
    distanceKm: km(centre, e.centroid),
    topFuels: top,
  });
}

type Row = (typeof rowsOut)[number];
const dataOk = (r: Row) => r.scorable >= 1 && r.nonBurnable <= MAX_NON_BURNABLE && r.targetFuels >= MIN_TARGET_FUELS;
const fit = rowsOut.filter((r) => r.tier === "A" && manifest.find((e) => e.fire === r.fire)!.fit && dataOk(r));
const locked = rowsOut.filter((r) => r.tier === "B" && r.distanceKm <= LOCKED_KM && dataOk(r));
const pct = (v: number) => `${Math.round(100 * v)}%`.padStart(4);
console.log("fogo                          tier  km   ha      não ardível  comb. alvo  semelhança  intervalos  combustíveis   → papel");
for (const r of rowsOut.sort((a, b) => a.distanceKm - b.distanceKm)) {
  const role = fit.includes(r) ? "AJUSTE" : locked.includes(r) ? "FECHADO" : "—";
  console.log(
    `${r.fire.padEnd(30)} ${r.tier}  ${String(Math.round(r.distanceKm)).padStart(4)} ${String(r.burnedHa).padStart(6)}   ${pct(r.nonBurnable)}         ${pct(r.targetFuels)}        ${pct(r.similarity)}       ${String(r.scorable).padStart(3)}      ${r.topFuels.join(", ").padEnd(40)} ${role}`,
  );
}
console.log(`\n${fit.length} fogos para ajustar, ${locked.length} fechados (só lidos no fim).`);
console.log(`Combustíveis da grelha alvo (≥ ${MIN_TARGET_SHARE * 100}% da área ardível): ${[...targetShare].filter(([, s]) => s >= MIN_TARGET_SHARE).sort((a, b) => b[1] - a[1]).map(([k, s]) => `${labelOf(k)} ${pct(s).trim()}`).join(", ")}`);

if (OUT) {
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        created: new Date().toISOString().slice(0, 10),
        cases: CASES,
        targetGrid: GRID,
        rule: { maxNonBurnable: MAX_NON_BURNABLE, minTargetFuels: MIN_TARGET_FUELS, minTargetShare: MIN_TARGET_SHARE, minNewHa: MIN_NEW_HA, lockedKm: LOCKED_KM },
        fit: fit.map((r) => r.fire),
        locked: locked.map((r) => r.fire),
        perFire: rowsOut,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`Escrito em ${OUT}`);
}
