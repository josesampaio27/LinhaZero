// Sørensen from the ignition of every PT-FireSprd fire for "Simples", uncalibrated and calibrated
// Rothermel, by tier and region; writes the per-fire JSON that plot_tier_a.py draws.
//   tsx scripts/tier-a-scores.ts <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { Pool } from "./calibration-pool";
import { FULL_REFERENCE_DIR, REFERENCE_DIR } from "./reference";
import { PT_CALIBRATION } from "../src/calibration";
const man = JSON.parse(readFileSync(REFERENCE_DIR + "/manifest.json", "utf8")).cases;
const all = man.map((_: any, i: number) => i);
const pool = new Pool(man.map((e: any) => ({ fire: e.fire, dir: FULL_REFERENCE_DIR })));
const [legacy, uncal, cal] = await Promise.all([
  pool.scores(undefined, all, { metric: "cumulative", model: "legacy" }),
  pool.scores({}, all, { metric: "cumulative" }),
  pool.scores(PT_CALIBRATION, all, { metric: "cumulative" }),
]);
await pool.close();
const OLD = new Set(["Alijo_24072019", "Baiao_04092019", "CastroDaire_07092020", "OliveiraFrades_07092020", "SaoJoaoPesqueira_10072020", "Valenca_04092019", "Valpacos_13092019"]);
const perFire = man.map((e: any, i: number) => ({ fire: e.fire, tier: e.tier, region: e.region, sorensen: { legacy: legacy[i], uncalibrated: uncal[i], current: cal[i] } }));
writeFileSync(process.argv[2], JSON.stringify({ perFire }, null, 1));
const m = (f: (p: any) => boolean, k: string) => { const v = perFire.filter(f).map((p: any) => p.sorensen[k]); return (v.reduce((a: number, b: number) => a + b, 0) / v.length).toFixed(3) + ` (${v.length})`; };
for (const [name, f] of [["tier A", (p: any) => p.tier === "A"], ["tier A novos", (p: any) => p.tier === "A" && !OLD.has(p.fire)], ["tier A Norte", (p: any) => p.tier === "A" && p.region === "Norte"], ["tier B", (p: any) => p.tier === "B"]] as const)
  console.log(name.padEnd(14), "Simples", m(f, "legacy"), "sem calib", m(f, "uncalibrated"), "calibrado", m(f, "current"));
const A = perFire.filter((p: any) => p.tier === "A");
console.log("calibrado > Simples em", A.filter((p: any) => p.sorensen.current > p.sorensen.legacy).length, "de", A.length);
