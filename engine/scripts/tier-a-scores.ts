// Sørensen from the ignition of every PT-FireSprd fire for "Simples", uncalibrated and calibrated
// Rothermel, by tier and region; writes the per-fire JSON that plot_tier_a.py draws.
//   tsx scripts/tier-a-scores.ts <out.json> [--cases <dir>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "./calibration-pool";
import { FULL_REFERENCE_DIR, REFERENCE_DIR } from "./reference";
import { PT_CALIBRATION, PT_CALIBRATION_SEEN } from "../src/calibration";

interface ManifestCase {
  fire: string;
  tier: string;
  region: string;
}
type ScoreKey = "legacy" | "uncalibrated" | "current";
interface FireScores extends ManifestCase {
  sorensen: Record<ScoreKey, number>;
}

const ci = process.argv.indexOf("--cases");
const CASES = ci >= 0 ? resolve(process.argv[ci + 1]) : FULL_REFERENCE_DIR;
const manifestPath = existsSync(join(CASES, "manifest.json")) ? join(CASES, "manifest.json") : REFERENCE_DIR + "/manifest.json";
const man: ManifestCase[] = (JSON.parse(readFileSync(manifestPath, "utf8")).cases as ManifestCase[]).filter((e) => existsSync(join(CASES, e.fire, "case.json")));
const all = man.map((_, i) => i);
const pool = new Pool(man.map((e) => ({ fire: e.fire, dir: CASES })));
const [legacy, uncal, cal] = await Promise.all([
  pool.scores(undefined, all, { metric: "cumulative", model: "legacy" }),
  pool.scores({}, all, { metric: "cumulative" }),
  pool.scores(PT_CALIBRATION, all, { metric: "cumulative" }),
]);
await pool.close();
const OLD = new Set(PT_CALIBRATION_SEEN);
const perFire: FireScores[] = man.map((e, i) => ({ fire: e.fire, tier: e.tier, region: e.region, sorensen: { legacy: legacy[i], uncalibrated: uncal[i], current: cal[i] } }));
writeFileSync(process.argv[2], JSON.stringify({ perFire }, null, 1));
const mean = (filter: (p: FireScores) => boolean, key: ScoreKey) => {
  const values = perFire.filter(filter).map((p) => p.sorensen[key]);
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(3) + ` (${values.length})`;
};
const groups: [string, (p: FireScores) => boolean][] = [
  ["tier A", (p) => p.tier === "A"],
  ["tier A novos", (p) => p.tier === "A" && !OLD.has(p.fire)],
  ["tier A Norte", (p) => p.tier === "A" && p.region === "Norte"],
  ["tier B", (p) => p.tier === "B"],
];
for (const [name, filter] of groups)
  console.log(name.padEnd(14), "Simples", mean(filter, "legacy"), "sem calib", mean(filter, "uncalibrated"), "calibrado", mean(filter, "current"));
const A = perFire.filter((p) => p.tier === "A");
console.log("calibrado > Simples em", A.filter((p) => p.sorensen.current > p.sorensen.legacy).length, "de", A.length);
