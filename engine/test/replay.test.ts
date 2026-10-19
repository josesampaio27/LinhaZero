import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSavedScenario } from "../scripts/saved-scenario";
import { buildScenario } from "../src/scenario";
import { simulate } from "../src/simulate";

// Replays of real fires offered in the app (data-prep/export_replay.py): each opens, simulates from the
// observed ignition with the real weather, and overlaps the observed burned area as the validation says.
const web = join(import.meta.dirname, "../../web/public");
const index: { name: string; label: string }[] = JSON.parse(readFileSync(join(web, "scenarios/index.json"), "utf8"));
const replays = index.filter((s) => s.name.startsWith("replay-"));

describe("real fire replays in the app", () => {
  it("there is at least one", () => expect(replays.length).toBeGreaterThan(0));

  for (const { name } of replays) {
    it(`${name}: opens, burns towards the observed fire, and has its perimeters`, () => {
      const { saved, grid } = loadSavedScenario(join(web, "scenarios", `${name}.json`), join(web, "grids"));
      expect(saved.spreadModel).toBe("rothermel");
      expect(saved.weatherSteps!.length).toBeGreaterThan(1);
      const obs = grid.header.observed!;
      const geo = JSON.parse(readFileSync(join(web, "grids", saved.grid, obs.file), "utf8"));
      const minutes: number[] = geo.features.map((f: { properties: { minute: number } }) => f.properties.minute);
      expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
      expect(minutes[minutes.length - 1]).toBeCloseTo(saved.durationMin, 0);

      const r = simulate(grid, { ...buildScenario(grid.header, saved, "A"), ensemble: undefined });
      const cellHa = (grid.header.cellSize * grid.header.cellSize) / 10_000;
      const burnedHa = r.arrivalMin.filter((a) => a <= saved.durationMin).length * cellHa;
      expect(burnedHa).toBeGreaterThan(50);
    });
  }
});
