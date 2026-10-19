import { describe, expect, it } from "vitest";
import { activeCrownRate, criticalSurfaceIntensity, crownFire } from "../src/crown";
import { ANDERSON_13 } from "../src/fuel-models";
import { comparePaired } from "../src/metrics";
import { simulate } from "../src/simulate";
import { makeGrid, scenario } from "./helpers";

const pine = { cbhM: 4, cbdKgM3: 0.12, cflKgM2: 1 };

describe("crown fire (Van Wagner 1977, Cruz et al. 2005)", () => {
  it("critical surface intensity, worked by hand", () => {
    // (0.01 · 4 · (460 + 25.9 · 100))^1.5 = 122^1.5 = 1347.5 kW/m
    expect(criticalSurfaceIntensity(4)).toBeCloseTo(1347.5, 0);
    expect(criticalSurfaceIntensity(8)).toBeGreaterThan(criticalSurfaceIntensity(4));
  });

  it("active crown rate, worked by hand", () => {
    // 11.02 · 30^0.9 · 0.12^0.19 · e^(−0.17·6) = 11.02 · 21.35 · 0.6684 · 0.3606 ≈ 56.7 m/min
    expect(activeCrownRate(30, 0.12, 6)).toBeCloseTo(56.7, 0);
    expect(activeCrownRate(30, 0.12, 12)).toBeLessThan(activeCrownRate(30, 0.12, 6));
  });

  it("stays on the surface below the critical intensity; active or passive above it", () => {
    expect(crownFire(pine, 1000, 30, 6)).toBeNull();
    const strong = crownFire(pine, 5000, 30, 6)!;
    expect(strong.kind).toBe("active"); // 56.7 / (3 / 0.12) = 2.27 ≥ 1
    expect(strong.rate).toBeCloseTo(56.7, 0);
    expect(strong.crownFraction).toBe(1);
    const weak = crownFire(pine, 5000, 5, 12)!;
    expect(weak.kind).toBe("passive");
    expect(weak.rate).toBeLessThan(activeCrownRate(5, 0.12, 12));
    expect(weak.extraIntensityPerRate).toBeLessThan(strong.extraIntensityPerRate);
  });
});

describe("crown fire in the engine", () => {
  // Timber litter and understory (FM10) under a pine canopy, dry and windy.
  const fuel = { ...ANDERSON_13[10], crown: pine }; // timber litter and understory under pines
  const s = (params: Record<string, number>) =>
    scenario({
      ignition: { row: 40, col: 10 },
      wind: { directionDeg: 270, speedMs: 10 },
      durationMin: 20,
      spreadModel: "rothermel",
      moisture: { d1: 0.05, d10: 0.06, d100: 0.08, liveHerb: 0.6, liveWoody: 0.8 },
      params,
    });
  const reach = (a: Float32Array) => {
    let far = 0;
    for (let c = 0; c < 81; c++) if (a[40 * 81 + c] <= 20) far = c;
    return far;
  };

  it("runs faster and hotter with crown fire on, only where there are trees", () => {
    const grid = makeGrid({ rows: 81, cols: 81, cellSize: 30, rothermel: fuel, canopy: () => 70 });
    const off = simulate(grid, s({ crownFire: 0 }));
    const on = simulate(grid, s({ crownFire: 1 }));
    expect(reach(on.arrivalMin)).toBeGreaterThan(reach(off.arrivalMin));
    expect(Math.max(...on.intensityKwM!)).toBeGreaterThan(Math.max(...off.intensityKwM!));
    const open = makeGrid({ rows: 81, cols: 81, cellSize: 30, rothermel: fuel, canopy: () => 10 });
    expect(simulate(open, s({ crownFire: 1 })).arrivalMin).toEqual(simulate(open, s({ crownFire: 0 })).arrivalMin);
    const noCanopyParams = makeGrid({ rows: 81, cols: 81, cellSize: 30, rothermel: ANDERSON_13[10], canopy: () => 70 });
    expect(simulate(noCanopyParams, s({ crownFire: 1 })).arrivalMin).toEqual(simulate(noCanopyParams, s({ crownFire: 0 })).arrivalMin);
  });

  it("keeps the ensemble paired", () => {
    const grid = makeGrid({ rows: 81, cols: 81, cellSize: 30, rothermel: fuel, canopy: () => 70 });
    const e = { ...s({ crownFire: 1 }), ensemble: { runs: 10, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 4 } };
    expect(comparePaired(simulate(grid, e).runs!, simulate(grid, e).runs!, "burnedHa").ties).toBe(10);
  });
});
