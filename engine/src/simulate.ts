import { MinHeap } from "./heap";
import { nearestBurnable } from "./grid";
import { buildInterventionLayers } from "./interventions";
import { computeMetrics } from "./metrics";
import { DEFAULT_PARAMS, type ModelParams } from "./params";
import { createRng, hashNormal, hashRandom, RANDOM_PURPOSE } from "./random";
import { DEFAULT_MOISTURE, type FuelMoisture, type SurfaceBase } from "./rothermel";
import { computeArrival, type SpreadInput } from "./spread";
import { fuelBases, RothermelRates } from "./surface";
import type { CellRef, PreparedGrid, RunMetrics, Scenario, SimulationResult, WeatherStep } from "./types";

const crownOf = (p: ModelParams) => ({ enabled: p.crownFire >= 0.5, rateAdj: p.crownAdj });

/** Dead fuel moisture shifted by a calibration offset, never below 1%. */
function withDeadOffset(m: FuelMoisture, offset: number): FuelMoisture {
  if (!offset) return m;
  const d = (v: number) => Math.max(0.01, v + offset);
  return { ...m, d1: d(m.d1), d10: d(m.d10), d100: d(m.d100) };
}

/**
 * Runs a scenario on a prepared grid. Returns arrival minutes, metrics and, when the scenario
 * has an ensemble, the fraction of wind-perturbed runs in which each cell burned within
 * durationMin. arrivalMin and metrics always come from the unperturbed run.
 *
 * With scenario.weatherSteps the wind (and, for Rothermel, the fuel moisture) changes during the fire;
 * an ensemble run shifts the direction and scales the speed of every step by the same draw.
 *
 * Pairing contract: run k depends only on the ensemble options (seed, runs, jitters, calibration
 * samples) and the base weather, never on the interventions, so two decisions simulated with the same
 * options see the same wind and parameters in run k and their `runs` can be compared one to one (see
 * comparePaired). Keep the number of
 * random draws per run independent of the scenario if more perturbations are added.
 */
export function simulate(grid: PreparedGrid, scenario: Scenario): SimulationResult {
  const { rows, cols } = grid.header;
  const layers = buildInterventionLayers(scenario.interventions, rows, cols);
  const heap = new MinHeap(rows * cols);
  const gustShare = scenario.params?.gustShare ?? DEFAULT_PARAMS.gustShare;
  // Effective wind: the mean plus a share of the gust, where the weather has one.
  const withGust = (w: WeatherStep["wind"]) =>
    gustShare > 0 && w.gustMs !== undefined && w.gustMs > w.speedMs ? { ...w, speedMs: w.speedMs + gustShare * (w.gustMs - w.speedMs) } : w;
  const steps: WeatherStep[] = (
    scenario.weatherSteps?.length ? [...scenario.weatherSteps].sort((a, b) => a.fromMin - b.fromMin) : [{ fromMin: 0, wind: scenario.wind }]
  ).map((s) => ({ ...s, wind: withGust(s.wind) }));
  const rothermel = scenario.spreadModel === "rothermel";
  // Fuel behaviour per distinct moisture, computed once for all runs.
  const basesByMoisture = new Map<string, (SurfaceBase | null)[]>();
  const params = { ...DEFAULT_PARAMS, ...scenario.params };
  const basesFor = (m: FuelMoisture | undefined, p: ModelParams = params, tag = "") => {
    const moisture = withDeadOffset(m ?? scenario.moisture ?? DEFAULT_MOISTURE, p.deadMoistureOffset);
    const key = tag + JSON.stringify(moisture);
    let b = basesByMoisture.get(key);
    if (!b) basesByMoisture.set(key, (b = fuelBases(grid, moisture, p)));
    return b;
  };
  const first = steps[0];
  const firstBases = rothermel ? basesFor(first.moisture) : undefined;
  const base: SpreadInput = {
    // A point ignition on a road or a non-burnable cell starts on the nearest burnable cell (200 m).
    ignition: scenario.ignitions?.length ? scenario.ignition : (nearestBurnable(grid, scenario.ignition) ?? scenario.ignition),
    ignitions: scenario.ignitions,
    windDirectionDeg: first.wind.directionDeg,
    windSpeedMs: first.wind.speedMs,
    durationMin: scenario.durationMin,
    params,
    rates: firstBases && new RothermelRates(grid, firstBases, params.windAdj, crownOf(params), params.windLimit),
    bases: firstBases,
    changes: steps.slice(1).map((s) => ({
      fromMin: s.fromMin,
      windDirectionDeg: s.wind.directionDeg,
      windSpeedMs: s.wind.speedMs,
      bases: rothermel ? basesFor(s.moisture) : undefined,
    })),
  };
  const intensityKwM = rothermel ? new Float32Array(rows * cols) : undefined;
  const arrivalMin = computeArrival(grid, { ...base, intensityOut: intensityKwM, random: scenario.realisation }, layers, heap);
  const metrics = computeMetrics(grid, arrivalMin, scenario.durationMin);

  const ens = scenario.ensemble;
  if (!ens || ens.runs <= 0) return { arrivalMin, metrics, ...(intensityKwM && { intensityKwM }) };

  // Per-run parameters (Rothermel): calibration sample k mod n, then the perturbation of run k.
  const samples = rothermel && ens.paramSamples?.length ? ens.paramSamples : undefined;
  const pert = ens.perturb;
  const perturbsFuel = rothermel && !!pert && (pert.deadMoisturePts > 0 || pert.fuelLogSd > 0);
  const sampleInputs = new Map<number, SpreadInput>();
  // One rate cache per wind factor, reused by the runs (each run resets it with its own fuel behaviour).
  const ratesByWindAdj = new Map<string, RothermelRates>();
  const ratesFor = (p: ModelParams, b0: (SurfaceBase | null)[]) => {
    const key = `${p.windAdj}|${p.crownFire}|${p.crownAdj}|${p.windLimit}`;
    let r = ratesByWindAdj.get(key);
    if (!r) ratesByWindAdj.set(key, (r = new RothermelRates(grid, b0, p.windAdj, crownOf(p), p.windLimit)));
    return r;
  };
  const buildInput = (p: ModelParams, tag: string): SpreadInput => {
    const b0 = basesFor(first.moisture, p, tag);
    return {
      ...base,
      params: p,
      rates: ratesFor(p, b0),
      bases: b0,
      changes: base.changes?.map((c, k) => ({ ...c, bases: basesFor(steps[k + 1].moisture, p, tag) })),
    };
  };
  const inputFor = (run: number): SpreadInput => {
    if (!samples && !perturbsFuel) return base;
    const j = samples ? run % samples.length : 0;
    const p: ModelParams = { ...params, ...(samples ? samples[j] : {}) };
    if (!perturbsFuel) {
      let input = sampleInputs.get(j);
      if (!input) sampleInputs.set(j, (input = buildInput(p, `s${j}:`)));
      return input;
    }
    const d = (2 * hashRandom(ens.seed, run, RANDOM_PURPOSE.moisture, 0) - 1) * pert!.deadMoisturePts;
    // Lognormal with mean 1 (−σ²/2), so the runs are not faster on average than the main run.
    const sd = pert!.fuelLogSd;
    const g = (k: number) => Math.exp(sd * hashNormal(ens.seed, run, RANDOM_PURPOSE.fuelGroup, k) - (sd * sd) / 2);
    const q: ModelParams = {
      ...p,
      deadMoistureOffset: p.deadMoistureOffset + d,
      rosAdjLitter: p.rosAdjLitter * g(0),
      rosAdjUnderstory: p.rosAdjUnderstory * g(1),
      rosAdjShrub: p.rosAdjShrub * g(2),
      rosAdjGrass: p.rosAdjGrass * g(3),
    };
    // Fuel behaviour is built per run and not kept: every run's is different.
    basesByMoisture.forEach((_, key) => key.startsWith("r:") && basesByMoisture.delete(key));
    return buildInput(q, "r:");
  };
  const ignitionFor = (run: number): CellRef => {
    const r = pert?.ignitionRadiusM ?? 0;
    if (!(r > 0) || scenario.ignitions?.length) return base.ignition;
    const dist = (r * Math.sqrt(hashRandom(ens.seed, run, RANDOM_PURPOSE.ignition, 0))) / grid.header.cellSize;
    const ang = 2 * Math.PI * hashRandom(ens.seed, run, RANDOM_PURPOSE.ignition, 1);
    const row = Math.round(base.ignition.row - dist * Math.cos(ang));
    const col = Math.round(base.ignition.col + dist * Math.sin(ang));
    // Outside the grid or on something that cannot burn: keep the given point.
    if (row < 0 || col < 0 || row >= rows || col >= cols || !(grid.baseRate[row * cols + col] > 0)) return base.ignition;
    return { row, col };
  };

  const rng = createRng(ens.seed);
  const counts = new Uint16Array(rows * cols);
  const runs: RunMetrics[] = [];
  const cellHa = (grid.header.cellSize * grid.header.cellSize) / 10000;
  for (let run = 0; run < ens.runs; run++) {
    const dDir = (2 * rng() - 1) * ens.windDirJitterDeg;
    const speedFactor = 1 + ((2 * rng() - 1) * ens.windSpeedJitterPct) / 100;
    const input = inputFor(run);
    const perturbed: SpreadInput = {
      ...input,
      ignition: ignitionFor(run),
      random: { seed: ens.seed, run },
      windDirectionDeg: base.windDirectionDeg + dDir,
      windSpeedMs: Math.max(0, base.windSpeedMs * speedFactor),
      changes: input.changes?.map((c) => ({
        ...c,
        windDirectionDeg: c.windDirectionDeg + dDir,
        windSpeedMs: Math.max(0, c.windSpeedMs * speedFactor),
      })),
    };
    const a = computeArrival(grid, perturbed, layers, heap);
    // Same rules as computeMetrics, inlined to avoid a second pass over the grid.
    let burned = 0;
    let buildingsReached = 0;
    for (let i = 0; i < a.length; i++) {
      if (!(a[i] <= base.durationMin)) continue;
      counts[i]++;
      burned++;
      buildingsReached += grid.buildings[i];
    }
    // Cell count times cell area, so equal burned-cell counts give exactly equal hectares.
    runs.push({ buildingsReached, burnedHa: burned * cellHa });
  }
  const burnProbability = new Float32Array(rows * cols);
  for (let i = 0; i < counts.length; i++) burnProbability[i] = counts[i] / ens.runs;
  return { arrivalMin, burnProbability, runs, metrics, ...(intensityKwM && { intensityKwM }) };
}
