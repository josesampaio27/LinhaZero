import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BURN_CHANCE_ENSEMBLE, calibrationFor } from "../src/calibration";
import { DEFAULT_ENSEMBLE } from "../src/scenario";
import { loadGridFromDir } from "../scripts/load-grid-node";

// The figures on the site, in the technical sheet and in the model docs come from landing/src/data/site-data.json,
// written by engine/scripts/landing-data.ts. This fails as soon as the engine moves on without it, instead of the
// published numbers going stale in silence. To refresh: `npm run landing-data -w engine` (needs the reference
// cases in data-prep/out/reference, see docs/modelo/calibracao-e-validacao.md).
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "../../landing/src/data/site-data.json"), "utf8"));
const STALE = "landing/src/data/site-data.json está desatualizado: npm run landing-data -w engine";
const r3 = (v: number) => Math.round(v * 1000) / 1000;

describe("site-data.json matches the engine", () => {
  it("was made with the 100 m calibration in use", () => {
    const cal = calibrationFor(100);
    expect(data.calibration, STALE).toEqual({ id: cal.id, params: cal.params });
  });

  it("checked the uncertainty map in use", () => {
    expect(data.reliability.runs, STALE).toBe(DEFAULT_ENSEMBLE.runs);
    expect(data.reliability.perturbation, STALE).toEqual(BURN_CHANCE_ENSEMBLE);
  });

  it("describes the Guimarães grid as it is", () => {
    const grid = loadGridFromDir(join(here, "../../web/public/grids/guimaraes"));
    const n = grid.header.rows * grid.header.cols;
    const byFuel = new Map<number, number>();
    for (const code of grid.fuel) byFuel.set(code, (byFuel.get(code) ?? 0) + 1);
    expect(data.grid.cellSize, STALE).toBe(grid.header.cellSize);
    expect([data.grid.rows, data.grid.cols], STALE).toEqual([grid.header.rows, grid.header.cols]);
    expect(data.grid.buildings, STALE).toBe(grid.buildings.reduce((a, b) => a + b, 0));
    expect(data.grid.places, STALE).toBe(grid.header.villages.length);
    const fuels = Object.fromEntries(data.grid.fuels.map((f: { code: number; share: number; burns: boolean }) => [f.code, [f.share, f.burns]]));
    const expected = Object.fromEntries(
      [...byFuel].map(([code, k]) => [code, [r3(k / n), !!grid.header.fuelTable[code]?.rothermel]]),
    );
    expect(fuels, STALE).toEqual(expected);
  });
});
