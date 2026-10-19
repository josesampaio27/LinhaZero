import { describe, expect, it } from "vitest";
import { comparePaired } from "../src/metrics";
import { simulate } from "../src/simulate";
import { makeGrid, reach, scenario } from "./helpers";

const N = 121;
const MID = 60;
const at = (r: number, c: number) => r * N + c;

describe("spread engine", () => {
  it("1. uniform fuel, no wind, no slope: burned shape is symmetric around the ignition", () => {
    const grid = makeGrid({ rows: N, cols: N });
    const { arrivalMin } = simulate(grid, scenario({ ignition: { row: MID, col: MID } }));
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const reaches = dirs.map(([dr, dc]) => reach(arrivalMin, N, MID, MID, dr, dc));
    expect(reaches[0]).toBeGreaterThan(10);
    for (const r of reaches) expect(r).toBe(reaches[0]);
    // Mirror symmetry of arrival times.
    for (const [r, c] of [[MID - 7, MID + 3], [MID + 12, MID - 5]]) {
      const t = arrivalMin[at(r, c)];
      expect(arrivalMin[at(2 * MID - r, c)]).toBeCloseTo(t, 4);
      expect(arrivalMin[at(r, 2 * MID - c)]).toBeCloseTo(t, 4);
      expect(arrivalMin[at(c, r)]).toBeCloseTo(t, 4);
    }
  });

  it("2. wind: fire goes further downwind than upwind", () => {
    const grid = makeGrid({ rows: N, cols: N });
    // Wind FROM the west (270°) blows towards the east.
    const { arrivalMin } = simulate(
      grid,
      scenario({ ignition: { row: MID, col: MID }, wind: { directionDeg: 270, speedMs: 8 }, durationMin: 30 }),
    );
    const east = reach(arrivalMin, N, MID, MID, 0, 1);
    const west = reach(arrivalMin, N, MID, MID, 0, -1);
    expect(east).toBeGreaterThan(2 * west);
  });

  it("3. slope: fire goes uphill faster than downhill", () => {
    // Terrain rises to the north (row 0 is highest), tan(phi) = 0.3.
    const grid = makeGrid({ rows: N, cols: N, elevation: (r) => (N - r) * 10 * 0.3 });
    const { arrivalMin } = simulate(grid, scenario({ ignition: { row: MID, col: MID }, durationMin: 30 }));
    const north = reach(arrivalMin, N, MID, MID, -1, 0);
    const south = reach(arrivalMin, N, MID, MID, 1, 0);
    expect(north).toBeGreaterThan(south);
    expect(arrivalMin[at(MID - 10, MID)]).toBeLessThan(arrivalMin[at(MID + 10, MID)]);
  });

  it("4. a continuous barrier stops the fire", () => {
    const grid = makeGrid({ rows: N, cols: N, barrier: (_r, c) => c === MID + 10 });
    const { arrivalMin } = simulate(
      grid,
      scenario({ ignition: { row: MID, col: MID }, wind: { directionDeg: 270, speedMs: 10 }, durationMin: 600 }),
    );
    expect(Number.isFinite(arrivalMin[at(MID, MID + 9)])).toBe(true);
    for (let r = 0; r < N; r++) for (let c = MID + 10; c < N; c++) expect(arrivalMin[at(r, c)]).toBe(Infinity);
  });

  it("5. containment line only stops the fire if it is in place before the fire arrives", () => {
    const grid = makeGrid({ rows: N, cols: N });
    const cells = Array.from({ length: N }, (_, row) => ({ row, col: MID + 10 }));
    const run = (startMin: number) =>
      simulate(
        grid,
        scenario({
          ignition: { row: MID, col: MID },
          durationMin: 120,
          interventions: [{ kind: "containmentLine", cells, startMin }],
        }),
      ).arrivalMin;
    // The fire reaches the line after about 100 m / 8 m/min = 12.5 min.
    const late = run(60);
    const early = run(5);
    expect(Number.isFinite(late[at(MID, MID + 20)])).toBe(true);
    expect(early[at(MID, MID + 20)]).toBe(Infinity);
    expect(early[at(MID, MID + 10)]).toBe(Infinity);
  });

  it("6. suppression with rateFactor 0.2 delays arrival in that zone", () => {
    const grid = makeGrid({ rows: N, cols: N });
    const cells = [];
    for (let r = 0; r < N; r++) for (let c = MID + 5; c < MID + 15; c++) cells.push({ row: r, col: c });
    const base = scenario({ ignition: { row: MID, col: MID }, durationMin: 240 });
    const free = simulate(grid, base).arrivalMin;
    const attacked = simulate(grid, {
      ...base,
      interventions: [{ kind: "suppression", cells, startMin: 0, rateFactor: 0.2 }],
    }).arrivalMin;
    const probe = at(MID, MID + 14);
    expect(attacked[probe]).toBeGreaterThan(free[probe] * 3);
    // Cells outside (west side) are unaffected.
    expect(attacked[at(MID, MID - 10)]).toBeCloseTo(free[at(MID, MID - 10)], 4);
  });

  it("7. determinism: same scenario and seed give identical results", () => {
    const grid = makeGrid({ rows: 61, cols: 61, elevation: (r, c) => 20 * Math.sin(r / 5) + c });
    const s = scenario({
      ignition: { row: 30, col: 30 },
      wind: { directionDeg: 200, speedMs: 6 },
      ensemble: { runs: 10, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 42 },
    });
    const a = simulate(grid, s);
    const b = simulate(grid, s);
    expect(Array.from(a.arrivalMin)).toEqual(Array.from(b.arrivalMin));
    expect(Array.from(a.burnProbability!)).toEqual(Array.from(b.burnProbability!));
    expect(a.metrics).toEqual(b.metrics);
    const p = a.burnProbability!;
    expect(Math.max(...p)).toBe(1);
    expect(p.some((v) => v > 0 && v < 1)).toBe(true);
  });

  it("8. metrics: burned area grows monotonically and buildings match a hand-made case", () => {
    // 1 x 6 strip of 100 m cells (1 ha each); barrier at column 4.
    const grid = makeGrid({
      rows: 1,
      cols: 6,
      cellSize: 100,
      baseRate: 1, // 100 min per cell
      barrier: (_r, c) => c === 4,
      buildings: (_r, c) => [0, 0, 3, 2, 0, 5][c],
      village: (_r, c) => (c >= 2 ? 1 : 0),
    });
    const { metrics, arrivalMin } = simulate(grid, scenario({ ignition: { row: 0, col: 0 }, durationMin: 240 }));
    // Arrivals: col0 = 0, col1 = 100, col2 = 200, col3 = 300 (> 240), col5 behind the barrier.
    expect(Array.from(arrivalMin)).toEqual([0, 100, 200, Infinity, Infinity, Infinity]);
    expect(metrics.buildingsReached).toBe(3);
    expect(metrics.burnedHaByHour).toEqual([1, 2, 2, 3]);
    expect(metrics.villages).toEqual([{ id: 1, name: "Aldeia", firstArrivalMin: 200 }]);

    const big = makeGrid({ rows: N, cols: N });
    const m = simulate(
      big,
      scenario({ ignition: { row: MID, col: MID }, wind: { directionDeg: 45, speedMs: 5 }, durationMin: 240 }),
    ).metrics;
    expect(m.burnedHaByHour).toHaveLength(4);
    for (let h = 1; h < m.burnedHaByHour.length; h++) {
      expect(m.burnedHaByHour[h]).toBeGreaterThanOrEqual(m.burnedHaByHour[h - 1]);
    }
  });

  describe("9. paired ensemble", () => {
    const ensemble = { runs: 20, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 7 };
    // Houses east of column 38; wind from the west pushes the fire towards them.
    const grid = makeGrid({ rows: 61, cols: 61, buildings: (_r, c) => (c >= 38 ? 1 : 0) });
    const base = scenario({ ignition: { row: 30, col: 30 }, wind: { directionDeg: 270, speedMs: 6 }, durationMin: 30, ensemble });
    const line = Array.from({ length: 61 }, (_, row) => ({ row, col: 35 }));
    const runs = (xs: number[]) => xs.map((x) => ({ buildingsReached: x, burnedHa: 0 }));

    it("identical decisions give zero gain in every run", () => {
      const a = simulate(grid, base).runs!;
      const b = simulate(grid, { ...base }).runs!;
      expect(a).toHaveLength(ensemble.runs);
      for (const key of ["buildingsReached", "burnedHa"] as const) {
        expect(comparePaired(a, b, key)).toEqual({
          runs: 20, bBetter: 0, aBetter: 0, ties: 20, lowGain: 0, medianGain: 0, highGain: 0,
        });
      }
    });

    it("interventions do not change the wind of run k (paired runs)", () => {
      // An intervention far from the fire must leave every run unchanged.
      const far = [{ kind: "containmentLine" as const, cells: [{ row: 0, col: 0 }], startMin: 0 }];
      expect(simulate(grid, { ...base, interventions: far }).runs).toEqual(simulate(grid, base).runs);
    });

    it("a line between the fire and the houses wins in every run", () => {
      const a = simulate(grid, base).runs!;
      const b = simulate(grid, { ...base, interventions: [{ kind: "containmentLine", cells: line, startMin: 0 }] }).runs!;
      const c = comparePaired(a, b, "buildingsReached");
      expect(c.bBetter).toBe(20);
      expect(b.every((r) => r.buildingsReached === 0)).toBe(true);
      // The wind spread makes the gain vary from run to run.
      expect(c.lowGain).toBeGreaterThan(0);
      expect(c.lowGain).toBeLessThan(c.medianGain);
      expect(c.medianGain).toBeLessThan(c.highGain);
    });

    it("swapping the decisions mirrors the result exactly", () => {
      // Gains 1..30 (n = 30, even) and an odd count with ties and losses.
      for (const [xs, ys] of [
        [Array.from({ length: 30 }, (_, i) => i + 1), Array(30).fill(0)],
        [[5, 0, 0, 3, 9, 2, 7], [1, 0, 4, 3, 2, 8, 0]],
      ]) {
        const ab = comparePaired(runs(xs), runs(ys), "buildingsReached");
        const ba = comparePaired(runs(ys), runs(xs), "buildingsReached");
        expect(ba).toEqual({
          runs: ab.runs, bBetter: ab.aBetter, aBetter: ab.bBetter, ties: ab.ties,
          // 0 - x rather than -x so a zero gain stays +0 for toEqual.
          lowGain: 0 - ab.highGain, medianGain: 0 - ab.medianGain, highGain: 0 - ab.lowGain,
        });
      }
    });

    it("central 80% interval and exact median; unpaired ensembles are rejected", () => {
      // Gains 1..30: drop 3 on each side, so the interval is the 4th to 27th values; median (15 + 16) / 2.
      const c = comparePaired(runs(Array.from({ length: 30 }, (_, i) => i + 1)), runs(Array(30).fill(0)), "buildingsReached");
      expect(c).toEqual({ runs: 30, bBetter: 30, aBetter: 0, ties: 0, lowGain: 4, medianGain: 15.5, highGain: 27 });
      // Gains A - B: -1, 0, 0, 1, 2, 3, 4, 5, 6, 7 (n = 10: drop 1 on each side).
      const d = comparePaired(runs([0, 0, 0, 1, 2, 3, 4, 5, 6, 7]), runs([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "buildingsReached");
      expect(d).toEqual({ runs: 10, bBetter: 7, aBetter: 1, ties: 2, lowGain: 0, medianGain: 2.5, highGain: 6 });
      expect(() => comparePaired(runs([1, 2]), runs([1]), "buildingsReached")).toThrow();
      expect(() => comparePaired([], [], "buildingsReached")).toThrow();
    });
  });
});
