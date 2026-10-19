import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareGrid } from "../src/grid";
import { hashGrid } from "../src/hash";
import { parseSavedScenario, savedScenarioGrid, type DecisionId, type SavedScenario } from "../src/scenario";
import type { PreparedGrid } from "../src/types";
import { applyVariant, checkVariantBase } from "../src/variant";
import { loadGridFromDir } from "./load-grid-node";

/**
 * Reads a web/public/scenarios/*.json file and its grid (from gridsDir), validating one against the other.
 * gridFor(d) is the grid decision d runs on: the official one, or its variant applied to it.
 */
export function loadSavedScenario(
  file: string,
  gridsDir: string,
): { saved: SavedScenario; grid: PreparedGrid; gridFor: (d: DecisionId) => PreparedGrid } {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const data = loadGridFromDir(join(gridsDir, savedScenarioGrid(raw)));
  const grid = prepareGrid(data);
  const saved = parseSavedScenario(raw, grid.header);
  const sha = hashGrid(data);
  const gridFor = (d: DecisionId) => {
    const v = saved.variants[d];
    if (!v) return grid;
    checkVariantBase(v, sha);
    return prepareGrid(applyVariant(data, v));
  };
  return { saved, grid, gridFor };
}
