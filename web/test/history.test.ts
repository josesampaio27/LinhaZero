import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MOISTURE,
  parseSavedScenario,
  type GridHeader,
} from "@linha-zero/engine";
import { describe, expect, it, vi } from "vitest";
import { savedScenarioOf } from "../src/lib/scenario";

// The API as the history sees it: a finished run of the Guimarães grid whose rasters come back too short.
const header: GridHeader = JSON.parse(
  readFileSync(
    join(__dirname, "../public/grids/guimaraes/header.json"),
    "utf8",
  ),
);
vi.mock("../src/lib/api", () => ({
  healthApi: {},
  runsApi: {
    get: async () => ({
      id: "r1",
      status: "done",
      progress: 2,
      result: {
        rows: header.rows,
        cols: header.cols,
        A: {},
        B: {},
        elapsedMs: 1,
      },
    }),
    raster: async () => ({ data: new Blob([new Uint8Array(8)]) }),
  },
}));

describe("simulation history", () => {
  it("the scenario sent with a run reads back as the same scenario file", () => {
    const centre: [number, number] = [
      header.originX + (header.cols / 2) * header.cellSize,
      header.originY - (header.rows / 2) * header.cellSize,
    ];
    const saved = savedScenarioOf(
      "guimaraes",
      "Teste",
      {
        ignition: centre,
        wind: { directionDeg: 45, speedMs: 3 },
        durationMin: 240,
        ensemble: true,
        decisions: { A: [], B: [] },
        variants: { A: null, B: null },
        spreadModel: "rothermel",
        moisture: DEFAULT_MOISTURE,
      },
      undefined,
    );
    const back = parseSavedScenario(JSON.parse(JSON.stringify(saved)), header);
    expect(back).toMatchObject({
      version: 3,
      title: "Teste",
      grid: "guimaraes",
      ignition: centre,
      ensemble: true,
      durationMin: 240,
    });
    expect(back.moisture).toEqual(DEFAULT_MOISTURE);
  });

  it("a stored run whose rasters do not fit the grid is refused", async () => {
    const { fetchRunResults } = await import("../src/lib/server-run");
    await expect(fetchRunResults(header, "r1")).rejects.toThrow(
      /raster [AB]\/\w+ com 8 bytes/,
    );
  });
});
