// Do roads and rivers hold the way the model says? Checks the rule a containment line uses (holdProbability:
// width / flame length) against the real fires of PT-FireSprd, on the roads and rivers of each case's grid.
//   npx tsx scripts/validate-holds.ts                  tier A fires, current calibration
//   npx tsx scripts/validate-holds.ts --tier B
// An event is a breakable barrier cell (a road or river, barrier 2-255 = its width in m) that the observed fire
// reached: at least one burnable neighbour burned by the last observation. It "held" unless the observed fire
// burned two opposite neighbours (fire on both sides). The prediction is holdProbability(width, flame length of
// the simulated fire in the neighbours, current calibration, no random draws). Events where the simulated fire did
// not reach a neighbour have no flame length and are left out.
// Limits: crews defended many roads, so "held" mixes width and firefighting; a fire that went round a road's end
// burns both sides too; widths are by road class, not measured.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PT_CALIBRATION } from "../src/calibration";
import { DEFAULT_PARAMS, holdProbability } from "../src/params";
import { createRng } from "../src/random";
import { flameLength } from "../src/rothermel";
import { simulate } from "../src/simulate";
import { FULL_REFERENCE_DIR, listCases, loadCase, scenarioOf } from "./reference";

const args = process.argv.slice(2);
const tier = args.includes("--tier") ? args[args.indexOf("--tier") + 1] : "A";
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../test/reference/manifest.json"), "utf8")).cases as { fire: string; tier: string }[];
const built = new Set(listCases(FULL_REFERENCE_DIR));
const fires = manifest.filter((c) => c.tier === tier && built.has(c.fire)).map((c) => c.fire);
const params = { ...DEFAULT_PARAMS, ...PT_CALIBRATION };

interface Event {
  fire: string;
  widthM: number;
  flameM: number;
  ratio: number;
  held: boolean;
  predicted: number;
}
const OPPOSITE: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];
const events: Event[] = [];
let noFlame = 0;
for (const fire of fires) {
  const c = loadCase(fire, FULL_REFERENCE_DIR);
  const { rows, cols } = c.grid.header;
  const end = c.observationMinutes[c.observationMinutes.length - 1];
  const sim = simulate(c.grid, scenarioOf(c, "rothermel", params));
  const intensity = sim.intensityKwM!;
  const burnable = (i: number) => c.grid.barrier[i] === 0 && c.grid.baseRate[i] > 0;
  const burned = (i: number) => burnable(i) && c.observed[i] <= end;
  for (let r = 1; r < rows - 1; r++) {
    for (let col = 1; col < cols - 1; col++) {
      const b = r * cols + col;
      const width = c.grid.barrier[b];
      if (width < 2) continue; // not a breakable road or river (0 none, 1 water)
      const around: number[] = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) around.push((r + dr) * cols + col + dc);
      if (!around.some(burned)) continue; // the real fire never got here
      const crossed = OPPOSITE.some(([dr, dc]) => burned((r + dr) * cols + col + dc) && burned((r - dr) * cols + col - dc));
      const kw = Math.max(0, ...around.filter(burned).map((i) => intensity[i]));
      if (!(kw > 0)) {
        noFlame++;
        continue;
      }
      const flame = flameLength(kw);
      events.push({ fire, widthM: width, flameM: flame, ratio: width / flame, held: !crossed, predicted: holdProbability(width, flame, params) });
    }
  }
}

const f2 = (v: number) => v.toFixed(2);
const held = events.filter((e) => e.held).length;
console.log(`tier ${tier}: ${fires.length} incêndios, ${events.length} células de estrada ou rio alcançadas (${noFlame} sem chama simulada, de fora)`);
console.log(`seguraram ${held} (${f2(held / events.length)}); o modelo previa em média ${f2(events.reduce((a, e) => a + e.predicted, 0) / events.length)}`);

// Observed against predicted, by predicted probability.
console.log("\nprevisto       células  seguraram (obs.)  previsto (média)");
for (const [lo, hi] of [[0, 0.1], [0.1, 0.3], [0.3, 0.7], [0.7, 0.9], [0.9, 1.01]]) {
  const bin = events.filter((e) => e.predicted >= lo && e.predicted < hi);
  if (!bin.length) continue;
  const obs = bin.filter((e) => e.held).length / bin.length;
  const pred = bin.reduce((a, e) => a + e.predicted, 0) / bin.length;
  console.log(`${f2(lo)}–${f2(Math.min(1, hi))}   ${String(bin.length).padStart(7)}  ${f2(obs).padStart(16)}  ${f2(pred).padStart(16)}`);
}
// By width over flame length.
console.log("\nlargura / chama  células  seguraram (obs.)");
for (const [lo, hi] of [[0, 1], [1, 2], [2, 5], [5, 10], [10, 1e9]]) {
  const bin = events.filter((e) => e.ratio >= lo && e.ratio < hi);
  if (bin.length) console.log(`${String(lo).padStart(4)}–${hi > 1e8 ? "∞" : hi}`.padEnd(17) + `${String(bin.length).padStart(7)}  ${f2(bin.filter((e) => e.held).length / bin.length).padStart(16)}`);
}

// The two parameters by maximum likelihood (grid search), with a bootstrap over fires for the 50% point.
function fit(es: Event[]): { r50: number; k: number } {
  let best = { r50: 1, k: 1, ll: -Infinity };
  for (let a = Math.log(0.1); a <= Math.log(50); a += 0.05) {
    for (let k = 0.25; k <= 10; k += 0.25) {
      let ll = 0;
      for (const e of es) {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, 1 / (1 + Math.exp(-k * (e.ratio - Math.exp(a))))));
        ll += e.held ? Math.log(p) : Math.log(1 - p);
      }
      if (ll > best.ll) best = { r50: Math.exp(a), k, ll };
    }
  }
  return best;
}
const all = fit(events);
const byFire = [...new Set(events.map((e) => e.fire))];
const rng = createRng(2035);
const boots: number[] = [];
for (let b = 0; b < 100; b++) {
  const pick = byFire.map(() => byFire[Math.floor(rng() * byFire.length)]);
  boots.push(fit(pick.flatMap((f) => events.filter((e) => e.fire === f))).r50);
}
boots.sort((a, b) => a - b);
console.log(`\najuste aos incêndios: segura a 50% com largura = ${f2(all.r50)} × chama (90%: ${f2(boots[5])} a ${f2(boots[94])}), inclinação ${f2(all.k)}`);
console.log(`em uso: ${params.holdWidthPerFlame} × chama, inclinação ${params.holdSteepness}`);
