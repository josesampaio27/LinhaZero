import { describe, expect, it } from "vitest";
import { BURN_CHANCE_ENSEMBLE, PT_CALIBRATION } from "../src/calibration";
import { DEFAULT_ENSEMBLE } from "../src/scenario";
import { simulate } from "../src/simulate";
import { terrainOf } from "../src/surface";
import { intervalBounds, intervalScenario, scoreIntervals } from "../scripts/intervals";
import { loadCase, weatherStepsOf } from "../scripts/reference";

// The shortcuts that make the calibration faster (ADR 0068, phase A) must give exactly what the slow
// way gave, on a real 30 m fire with hourly weather.
const DIR = new URL("./reference-30m", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const c = loadCase("Valpacos_13092019", DIR);
const ensemble = { ...DEFAULT_ENSEMBLE, ...BURN_CHANCE_ENSEMBLE, runs: 4 };

describe("calibration shortcuts give the same results", () => {
  it("one ensemble read at several minutes equals a separate ensemble to each minute", () => {
    const times = c.observationMinutes.slice(0, 2);
    const last = Math.max(...times);
    const { scenario } = intervalScenario(c, 0, times[0], "rothermel", PT_CALIBRATION);
    const steps = (m: number) => weatherStepsOf(c, m, 0);
    const once = simulate(c.grid, {
      ...scenario,
      durationMin: last,
      weatherSteps: steps(last),
      wind: steps(last)[0].wind,
      ensemble,
      probabilityAtMin: times,
    });
    times.forEach((m, k) => {
      const alone = simulate(c.grid, { ...scenario, durationMin: m, weatherSteps: steps(m), wind: steps(m)[0].wind, ensemble });
      expect(once.burnProbabilityAt![k]).toEqual(alone.burnProbability);
    });
  }, 60_000);

  it("a grid copied with other fuel shares the relief of its source", () => {
    // The last restart has ground burned two observations back: spent, so the grid is a copy.
    const { grid } = intervalScenario(c, ...intervalBounds(c).at(-1)!, "rothermel");
    expect(grid).not.toBe(c.grid);
    expect(terrainOf(grid)).toBe(terrainOf(c.grid));
  });

  it("scoring the same intervals again (cached restarts) gives the same scores", () => {
    expect(scoreIntervals(c, PT_CALIBRATION)).toEqual(scoreIntervals(c, PT_CALIBRATION));
  });
});
