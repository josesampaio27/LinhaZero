import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BURN_CHANCE_ENSEMBLE,
  calibrationFor,
  PT_CALIBRATION,
  PT_CALIBRATION_30M,
  PT_CALIBRATION_SAMPLES,
} from "../src/calibration";
import {
  DEFAULT_ENSEMBLE,
  parseWeatherSteps,
  rothermelEnsemble,
} from "../src/scenario";
import { cmaes } from "../scripts/cmaes";
import {
  fromGlobal,
  fromParams,
  penalty,
  toParams,
} from "../scripts/calibration-space";
import {
  distanceFrom,
  intervalCost,
  scoreIntervals,
} from "../scripts/intervals";
import { scenarioOf, type ReferenceCase } from "../scripts/reference";
import { ANDERSON_13 } from "../src/fuel-models";
import { comparePaired } from "../src/metrics";
import { DEFAULT_PARAMS, groupRosAdj } from "../src/params";
import { simulate } from "../src/simulate";
import { fuelBases } from "../src/surface";
import { DEFAULT_MOISTURE } from "../src/rothermel";
import { makeGrid, scenario } from "./helpers";

describe("CMA-ES", () => {
  it("finds the minimum of a rotated, badly scaled quadratic", async () => {
    const target = [0.3, -1.2, 2, 0.5, -0.4];
    const f = (x: number[]) =>
      x.reduce(
        (s, v, i) =>
          s +
          10 ** i *
            (v - target[i] + 0.3 * (x[(i + 1) % 5] - target[(i + 1) % 5])) ** 2,
        0,
      );
    const r = await cmaes(async (xs) => xs.map(f), [0, 0, 0, 0, 0], {
      sigma: 1,
      maxGenerations: 600,
      seed: 7,
      tolX: 1e-8,
    });
    r.x.forEach((v, i) => expect(v).toBeCloseTo(target[i], 4));
  });

  it("is reproducible with a seed", async () => {
    const f = (x: number[]) => x.reduce((s, v) => s + (v - 1) ** 2, 0);
    const run = () =>
      cmaes(async (xs) => xs.map(f), [3, 3, 3], {
        sigma: 1,
        maxGenerations: 20,
        seed: 11,
      });
    expect((await run()).x).toEqual((await run()).x);
  });
});

describe("calibration search space", () => {
  it("maps parameters to the search space and back", () => {
    const p = {
      rosAdjLitter: 0.5,
      rosAdjUnderstory: 2,
      rosAdjShrub: 1,
      rosAdjGrass: 3,
      windAdj: 2.5,
      holdWidthPerFlame: 5,
      deadMoistureOffset: -0.02,
    };
    const back = toParams(fromParams(p));
    for (const [k, v] of Object.entries(p))
      expect(back[k as keyof typeof back]).toBeCloseTo(v, 10);
  });

  it("folds a global rosAdj into the group factors", () => {
    const p = toParams(fromGlobal({ rosAdj: 0.5, windAdj: 2.5 }));
    expect(p.rosAdjShrub).toBeCloseTo(0.5, 10);
    expect(p.rosAdjGrass).toBeCloseTo(0.5, 10);
    expect(p.windAdj).toBeCloseTo(2.5, 10);
  });

  it("the prior is zero at the defaults and grows away from them", () => {
    const x0 = fromParams({});
    expect(penalty(x0)).toBe(0);
    expect(penalty(fromParams({ windAdj: 2 }))).toBeGreaterThan(0);
    expect(penalty(fromParams({ windAdj: 4 }))).toBeGreaterThan(
      penalty(fromParams({ windAdj: 2 })),
    );
  });
});

describe("spread factor per fuel group", () => {
  it("multiplies the no-wind rate of the fuels of that group only", () => {
    const grid = makeGrid({
      rows: 3,
      cols: 3,
      rothermel: { ...ANDERSON_13[5], group: "V" },
    });
    const plain = fuelBases(grid, DEFAULT_MOISTURE)[1]!.r0;
    expect(
      fuelBases(grid, DEFAULT_MOISTURE, {
        ...DEFAULT_PARAMS,
        rosAdjShrub: 2,
      })[1]!.r0,
    ).toBeCloseTo(2 * plain, 10);
    expect(
      fuelBases(grid, DEFAULT_MOISTURE, {
        ...DEFAULT_PARAMS,
        rosAdjGrass: 2,
      })[1]!.r0,
    ).toBeCloseTo(plain, 10);
    expect(
      groupRosAdj({ ...DEFAULT_PARAMS, rosAdj: 0.5, rosAdjShrub: 3 }, "V"),
    ).toBeCloseTo(1.5, 10);
    expect(
      groupRosAdj(
        { ...DEFAULT_PARAMS, rosAdj: 0.5, rosAdjShrub: 3 },
        undefined,
      ),
    ).toBeCloseTo(0.5, 10);
  });

  it("wetter dead fuel (moisture offset) spreads slower", () => {
    const grid = makeGrid({ rows: 41, cols: 41, rothermel: ANDERSON_13[1] });
    const s = {
      ignition: { row: 20, col: 20 },
      wind: { directionDeg: 270, speedMs: 3 },
      durationMin: 20,
      spreadModel: "rothermel" as const,
    };
    const burned = (deadMoistureOffset: number) =>
      simulate(
        grid,
        scenario({ ...s, params: { deadMoistureOffset } }),
      ).arrivalMin.filter((a) => a <= 20).length;
    expect(burned(0.03)).toBeLessThan(burned(0));
    expect(burned(-0.02)).toBeGreaterThan(burned(0));
  });
});

describe("calibration samples in the ensemble", () => {
  const grid = makeGrid({ rows: 61, cols: 61, rothermel: ANDERSON_13[1] });
  const samples = [{ windAdj: 0.5 }, { windAdj: 1 }, { windAdj: 2 }];
  const s = scenario({
    ignition: { row: 30, col: 30 },
    wind: { directionDeg: 270, speedMs: 3 },
    durationMin: 25,
    spreadModel: "rothermel",
    ensemble: {
      runs: 9,
      windDirJitterDeg: 0,
      windSpeedJitterPct: 0,
      seed: 5,
      paramSamples: samples,
    },
  });

  it("run k uses sample k mod n, and the main run keeps the scenario's parameters", () => {
    const r = simulate(grid, s);
    const ha = r.runs!.map((x) => x.burnedHa);
    expect(ha[0]).toBeLessThan(ha[1]);
    expect(ha[1]).toBeLessThan(ha[2]);
    expect(ha[3]).toBe(ha[0]);
    expect(ha[5]).toBe(ha[2]);
    const plain = simulate(grid, { ...s, ensemble: undefined });
    expect(r.arrivalMin).toEqual(plain.arrivalMin);
  });

  it("still pairs: the same decision gives ties in every run", () => {
    const a = simulate(grid, s).runs!;
    expect(comparePaired(a, simulate(grid, s).runs!, "burnedHa").ties).toBe(9);
  });

  it("without samples the runs are as before", () => {
    const none = {
      ...s,
      ensemble: { ...s.ensemble!, paramSamples: undefined },
    };
    const empty = { ...s, ensemble: { ...s.ensemble!, paramSamples: [] } };
    expect(simulate(grid, empty).runs).toEqual(simulate(grid, none).runs);
  });
});

describe("interval scoring", () => {
  it("chamfer distance is exact along rows and diagonals", () => {
    const src = new Uint8Array(25);
    src[12] = 1; // centre of 5 × 5
    const d = distanceFrom(src, 5, 5);
    expect(d[14]).toBe(2);
    expect(d[0]).toBeCloseTo(2 * Math.SQRT2, 6);
  });

  it("scores a perfect simulation as perfect, and a slower one as worse", () => {
    // A synthetic "observed" fire: the engine's own run with the case's weather, observed every 40 minutes.
    const grid = makeGrid({
      rows: 81,
      cols: 81,
      cellSize: 30,
      rothermel: { ...ANDERSON_13[1], group: "H" },
    });
    const header = grid.header;
    const centre = (r: number, c: number): [number, number] => [
      header.originX + (c + 0.5) * 30,
      header.originY - (r + 0.5) * 30,
    ];
    const hours = [0, 1, 2].map((h) => ({
      timeUtc: new Date(Date.UTC(2020, 7, 1, 12 + h))
        .toISOString()
        .replace(".000", ""),
      tempC: 30,
      rhPct: 20,
      windSpeedMs: 1,
      windFromDeg: 270,
      cloudPct: 0,
    }));
    const obsTimes = [40, 80, 120];
    const c: ReferenceCase = {
      fire: "synthetic",
      dir: "",
      grid,
      observed: new Float32Array(81 * 81).fill(Infinity),
      t0Utc: hours[0].timeUtc,
      ignitionArea: [centre(40, 20), centre(40, 20), centre(40, 20)],
      observationMinutes: obsTimes,
      fuelYear: 2020,
      fuelYearMatches: true,
      centroid: [41.4, -8.3],
      weather: hours,
    };
    const truth = simulate(grid, scenarioOf(c, "rothermel")).arrivalMin;
    c.observed = truth.map((a) =>
      !(a <= 120) ? Infinity : a === 0 ? 0 : obsTimes.find((t) => a <= t)!,
    );
    const self = scoreIntervals(c, undefined, { minNewHa: 0 });
    expect(self).toHaveLength(3);
    for (const s of self) expect(s.sorensen).toBeGreaterThan(0.8);
    const slower = scoreIntervals(c, { rosAdjGrass: 0.3 }, { minNewHa: 0 });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(slower.map(intervalCost))).toBeGreaterThan(
      mean(self.map(intervalCost)) + 0.2,
    );
    for (const s of slower) expect(s.simulatedNew).toBeLessThan(s.observedNew);
  });
});

describe("restarting from the observed fire", () => {
  // The engine's own fire, observed every 40 minutes, scored against itself: each interval restarts from
  // the cells observed burned (their centre covered), credited SEED_SHARE of the way to their edges.
  // Restarting from their centres lost up to a third of an interval's growth at 30 m in a light wind.
  const selfRatios = (cell: number, windMs: number) => {
    const n = Math.round(3000 / cell) | 1;
    const mid = (n - 1) / 2;
    const grid = makeGrid({
      rows: n,
      cols: n,
      cellSize: cell,
      rothermel: { ...ANDERSON_13[1], group: "H" },
    });
    const hours = [0, 1, 2, 3].map((h) => ({
      timeUtc: new Date(Date.UTC(2020, 7, 1, 12 + h))
        .toISOString()
        .replace(".000", ""),
      tempC: 30,
      rhPct: 20,
      windSpeedMs: windMs,
      windFromDeg: 270,
      cloudPct: 0,
    }));
    const obsTimes = [40, 80, 120, 160];
    const { originX, originY } = grid.header;
    const at = (r: number, c: number): [number, number] => [
      originX + (c + 0.5) * cell,
      originY - (r + 0.5) * cell,
    ];
    const c: ReferenceCase = {
      fire: "synthetic",
      dir: "",
      grid,
      observed: new Float32Array(n * n).fill(Infinity),
      t0Utc: hours[0].timeUtc,
      ignitionArea: [at(mid, mid - 5), at(mid, mid - 5), at(mid, mid - 5)],
      observationMinutes: obsTimes,
      fuelYear: 2020,
      fuelYearMatches: true,
      centroid: [41.4, -8.3],
      weather: hours,
    };
    const truth = simulate(grid, scenarioOf(c, "rothermel")).arrivalMin;
    c.observed = truth.map((a) =>
      !(a <= 160) ? Infinity : a === 0 ? 0 : obsTimes.find((t) => a <= t)!,
    );
    return scoreIntervals(c, undefined, { minNewHa: 0 })
      .slice(1)
      .map((s) => s.simulatedNew / s.observedNew);
  };

  // (At 100 m a 1 m/s fire grows a handful of cells per interval: too few to measure a ratio.)
  for (const [cell, wind] of [
    [30, 1],
    [30, 6],
    [100, 6],
  ])
    it(`keeps the growth of each interval at ${cell} m with a ${wind} m/s wind`, () => {
      const ratios = selfRatios(cell, wind);
      for (const ratio of ratios) {
        expect(ratio).toBeGreaterThan(0.8);
        expect(ratio).toBeLessThan(1.15);
      }
      const meanLog =
        ratios.reduce((a, r) => a + Math.log(r), 0) / ratios.length;
      expect(Math.abs(meanLog)).toBeLessThan(0.08);
    });
});

describe("calibration report (engine/reports)", () => {
  const dir = join(import.meta.dirname, "../reports");
  // The 100 m reports; the 30 m ones (pt-firesprd-30m-*) are checked below.
  const reports = readdirSync(dir)
    .filter((f) => /^pt-firesprd-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const latest = JSON.parse(
    readFileSync(join(dir, reports[reports.length - 1]), "utf8"),
  );

  it("has the fit, the samples and the held-out scores", () => {
    expect(latest.samples.length).toBeGreaterThanOrEqual(10);
    expect(latest.heldOut.newFires.fires).toBeGreaterThanOrEqual(20);
    for (const k of ["fitted", "uncalibrated", "current", "legacy"]) {
      expect(Number.isFinite(latest.heldOut.newFires.cost[k])).toBe(true);
      expect(Number.isFinite(latest.heldOut.newFires.sorensen[k])).toBe(true);
    }
    // On fires it never saw, calibrated Rothermel beats both the uncalibrated model and "Simples".
    expect(latest.heldOut.newFires.sorensen.current).toBeGreaterThan(
      latest.heldOut.newFires.sorensen.uncalibrated,
    );
    expect(latest.heldOut.newFires.sorensen.uncalibrated).toBeGreaterThan(
      latest.heldOut.newFires.sorensen.legacy + 0.05,
    );
  });

  it("the engine follows the report's verdict", () => {
    if (latest.adopt) {
      expect(PT_CALIBRATION).toEqual(latest.best);
      expect(PT_CALIBRATION_SAMPLES).toEqual(latest.samples);
    } else {
      // Not adopted: the previous calibration stays, without the rejected samples.
      expect(PT_CALIBRATION).not.toEqual(latest.best);
      expect(PT_CALIBRATION_SAMPLES).toHaveLength(0);
    }
  });
});

describe("30 m calibration report (ADR 0064)", () => {
  const dir = join(import.meta.dirname, "../reports");
  const reports = readdirSync(dir)
    .filter((f) => f.startsWith("pt-firesprd-30m-") && f.endsWith(".json"))
    .sort();
  const latest = JSON.parse(readFileSync(join(dir, reports[reports.length - 1]), "utf8"));

  it("was fitted at 30 m against the physical model, on the selected fires", () => {
    expect(latest.provenance.cellSizes).toEqual([30]);
    expect(latest.heldOut.newFires.fires).toBeGreaterThanOrEqual(15);
    expect(latest.samples.length).toBeGreaterThanOrEqual(10);
    // The incumbent is the physical model, so "current" and "uncalibrated" are the same scores.
    expect(latest.heldOut.newFires.cost.current).toBeCloseTo(latest.heldOut.newFires.cost.uncalibrated, 9);
    // Rothermel beats "Simples" on fires it never saw.
    expect(latest.heldOut.newFires.sorensen.uncalibrated).toBeGreaterThan(latest.heldOut.newFires.sorensen.legacy + 0.05);
  });

  it("the engine follows the report's verdict", () => {
    const fine = calibrationFor(30);
    expect(fine.params).toBe(PT_CALIBRATION_30M);
    expect(calibrationFor(100).params).toBe(PT_CALIBRATION);
    // Adopted: the fit. Not adopted (2026-10-20): the 100 m values, which beat the physical model on the
    // 30 m fires they never saw (ADR 0064, Resultados); never the rejected fit.
    if (latest.adopt) expect(PT_CALIBRATION_30M).toEqual(latest.best);
    else {
      expect(PT_CALIBRATION_30M).not.toEqual(latest.best);
      expect(PT_CALIBRATION_30M).toEqual(PT_CALIBRATION);
    }
  });
});

describe("ensemble perturbations (moisture, fuel, ignition)", () => {
  const grid = makeGrid({
    rows: 81,
    cols: 81,
    rothermel: { ...ANDERSON_13[1], group: "H" },
  });
  const ens = {
    runs: 20,
    windDirJitterDeg: 15,
    windSpeedJitterPct: 20,
    seed: 9,
  };
  const base = {
    ignition: { row: 40, col: 40 },
    wind: { directionDeg: 270, speedMs: 3 },
    durationMin: 25,
    spreadModel: "rothermel" as const,
  };
  const run = (perturb?: {
    deadMoisturePts: number;
    fuelLogSd: number;
    ignitionRadiusM: number;
  }) => simulate(grid, scenario({ ...base, ensemble: { ...ens, perturb } }));
  const spread = (r: ReturnType<typeof run>) => {
    const ha = r.runs!.map((x) => x.burnedHa);
    return Math.max(...ha) - Math.min(...ha);
  };
  const uncertain = (p: Float32Array) =>
    p.filter((v) => v > 0.05 && v < 0.95).length;

  it("zero perturbation gives the wind-only runs exactly", () => {
    expect(
      run({ deadMoisturePts: 0, fuelLogSd: 0, ignitionRadiusM: 0 }).runs,
    ).toEqual(run().runs);
  });

  it("each perturbation widens the spread of outcomes", () => {
    const wind = run();
    expect(
      spread(run({ deadMoisturePts: 0.03, fuelLogSd: 0, ignitionRadiusM: 0 })),
    ).toBeGreaterThan(spread(wind));
    expect(
      spread(run({ deadMoisturePts: 0, fuelLogSd: 0.4, ignitionRadiusM: 0 })),
    ).toBeGreaterThan(spread(wind));
    expect(
      uncertain(
        run({ deadMoisturePts: 0, fuelLogSd: 0, ignitionRadiusM: 100 })
          .burnProbability!,
      ),
    ).toBeGreaterThan(uncertain(wind.burnProbability!));
  });

  it("still pairs, and the main run is unperturbed", () => {
    const p = { deadMoisturePts: 0.02, fuelLogSd: 0.3, ignitionRadiusM: 50 };
    const a = run(p);
    expect(comparePaired(a.runs!, run(p).runs!, "burnedHa").ties).toBe(20);
    expect(a.arrivalMin).toEqual(run().arrivalMin);
  });

  it("does not move a drawn burned area", () => {
    const ignitions = [
      { cell: { row: 40, col: 40 }, t0Min: 0 },
      { cell: { row: 40, col: 41 }, t0Min: 0 },
    ];
    const s = (perturb?: {
      deadMoisturePts: number;
      fuelLogSd: number;
      ignitionRadiusM: number;
    }) =>
      simulate(
        grid,
        scenario({ ...base, ignitions, ensemble: { ...ens, perturb } }),
      ).runs;
    expect(
      s({ deadMoisturePts: 0, fuelLogSd: 0, ignitionRadiusM: 500 }),
    ).toEqual(s());
  });
});

describe("probability without firefighting (ADR 0057)", () => {
  const report = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "../reports/reliability-2026-10-19.json"),
      "utf8",
    ),
  );

  it("the perturbations were adopted because they beat the wind-only ensemble on unfought held-out fire", () => {
    expect(report.adopt).toBe(true);
    expect(report.heldOut.unfoughtTuned.brier).toBeLessThan(
      report.heldOut.unfoughtWindOnly.brier,
    );
    expect(report.heldOut.unfoughtTuned.coverage).toBeGreaterThanOrEqual(
      report.heldOut.unfoughtWindOnly.coverage,
    );
    expect(BURN_CHANCE_ENSEMBLE.perturb).toEqual(report.final.ensemble.perturb);
    expect(BURN_CHANCE_ENSEMBLE.windDirJitterDeg).toBe(
      report.final.ensemble.windDirJitterDeg,
    );
    expect(report.params).toEqual(PT_CALIBRATION);
  });

  it("the app and the server build the same Rothermel ensemble, and it pairs", () => {
    const e = rothermelEnsemble(DEFAULT_ENSEMBLE);
    expect(e).toMatchObject({
      runs: DEFAULT_ENSEMBLE.runs,
      seed: DEFAULT_ENSEMBLE.seed,
      ...BURN_CHANCE_ENSEMBLE,
    });
    const grid = makeGrid({
      rows: 61,
      cols: 61,
      rothermel: { ...ANDERSON_13[1], group: "H" },
    });
    const s = scenario({
      ignition: { row: 30, col: 30 },
      wind: { directionDeg: 270, speedMs: 3 },
      durationMin: 20,
      spreadModel: "rothermel",
      ensemble: e,
    });
    expect(
      comparePaired(
        simulate(grid, s).runs!,
        simulate(grid, s).runs!,
        "burnedHa",
      ).ties,
    ).toBe(DEFAULT_ENSEMBLE.runs);
  });
});

describe("wind gusts (gustShare)", () => {
  const grid = makeGrid({
    rows: 61,
    cols: 61,
    rothermel: { ...ANDERSON_13[1], group: "H" },
  });
  const steps = [
    { fromMin: 0, wind: { directionDeg: 270, speedMs: 3, gustMs: 9 } },
  ];
  const run = (gustShare?: number) =>
    simulate(
      grid,
      scenario({
        ignition: { row: 30, col: 10 },
        wind: steps[0].wind,
        weatherSteps: steps,
        durationMin: 15,
        spreadModel: "rothermel",
        params: gustShare === undefined ? undefined : { gustShare },
      }),
    ).arrivalMin.filter((a) => a <= 15).length;

  it("does nothing by default, and spreads faster with a share of the gust", () => {
    const plain = simulate(
      grid,
      scenario({
        ignition: { row: 30, col: 10 },
        wind: { directionDeg: 270, speedMs: 3 },
        durationMin: 15,
        spreadModel: "rothermel",
      }),
    ).arrivalMin.filter((a) => a <= 15).length;
    expect(run()).toBe(plain);
    expect(run(0)).toBe(plain);
    expect(run(0.5)).toBeGreaterThan(plain);
    expect(run(1)).toBeGreaterThan(run(0.5));
  });

  it("weather steps keep a valid gust and reject a negative one", () => {
    expect(
      parseWeatherSteps([
        { fromMin: 0, wind: { directionDeg: 10, speedMs: 2, gustMs: 6 } },
      ])[0].wind.gustMs,
    ).toBe(6);
    expect(() =>
      parseWeatherSteps([
        { fromMin: 0, wind: { directionDeg: 10, speedMs: 2, gustMs: -1 } },
      ]),
    ).toThrow(/rajada/);
  });
});
