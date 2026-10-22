import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GridHeader } from "../src/types";

const GRIDS = join(dirname(fileURLToPath(import.meta.url)), "../../web/public/grids");
const names = readdirSync(GRIDS).filter((n) => statSync(join(GRIDS, n)).isDirectory());

// The simulation burns a fuel by its Rothermel parameters; the old model's base rate (fuel_rates.csv) still
// marks burnable cells in the engine. Both must agree, so the old number never decides anything on its own.
describe("published grids", () => {
  it.each(names)("%s: a fuel burns exactly when it has Rothermel parameters", (name) => {
    const header: GridHeader = JSON.parse(readFileSync(join(GRIDS, name, "header.json"), "utf8"));
    const disagree = Object.entries(header.fuelTable)
      .filter(([, f]) => f.baseRate > 0 !== !!f.rothermel)
      .map(([code, f]) => `${code} (${f.label})`);
    expect(disagree).toEqual([]);
  });
});
