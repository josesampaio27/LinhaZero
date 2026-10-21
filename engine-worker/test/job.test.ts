import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyVariant,
  comparePaired,
  decodeGrid,
  gridLayerNames,
  prepareGrid,
  rothermelEnsemble,
  rothermelParams,
  simulate,
  type GridHeader,
  type LayerBuffers,
  type RunEvent,
  type RunRequest,
  type RunResult,
} from "@linha-zero/engine";
import { decodeFromBuffers, loadGrid, runDecision, runJob, variantProblem } from "../src/job";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const gridsDir = join(root, "web/public/grids");
const example = (name: string) => JSON.parse(readFileSync(join(root, "contracts/examples", name), "utf8"));

// Typed literals of every contracts/examples/run-*.json: `satisfies` type-checks them, toEqual pins the files to them.
const exampleRequest = {
  grid: "guimaraes",
  ignition: { row: 103, col: 92 },
  wind: { directionDeg: 45, speedMs: 2.5 },
  durationMin: 240,
  ensemble: { runs: 200, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 2035 },
  decisions: {
    // The line and the attack lie in the path of the fire, which spreads south-west.
    A: [
      {
        kind: "containmentLine",
        startMin: 60,
        cells: [
          { row: 106, col: 88 },
          { row: 106, col: 89 },
          { row: 106, col: 90 },
          { row: 106, col: 91 },
          { row: 106, col: 92 },
          { row: 106, col: 93 },
          { row: 106, col: 94 },
          { row: 106, col: 95 },
        ],
      },
      {
        kind: "suppression",
        startMin: 30,
        rateFactor: 0.2,
        cells: [
          { row: 104, col: 91 },
          { row: 104, col: 92 },
          { row: 104, col: 93 },
          { row: 105, col: 91 },
          { row: 105, col: 92 },
          { row: 105, col: 93 },
        ],
      },
      // Water dropped across the fire's path, wearing off after 20 minutes.
      {
        kind: "aerialDrop",
        startMin: 45,
        endMin: 65,
        cells: [
          { row: 108, col: 87 },
          { row: 108, col: 88 },
          { row: 108, col: 89 },
          { row: 108, col: 90 },
        ],
      },
      // A backfire lit from a line further south, on its north side (toward the fire).
      {
        kind: "backfire",
        startMin: 90,
        cells: [
          { row: 112, col: 84 },
          { row: 112, col: 85 },
          { row: 112, col: 86 },
          { row: 112, col: 87 },
        ],
        litCells: [
          { row: 111, col: 84 },
          { row: 111, col: 85 },
          { row: 111, col: 86 },
          { row: 111, col: 87 },
        ],
      },
    ],
    B: [],
  },
  weather: { source: "ipma", station: "Braga, Merelim", observedAt: "2026-10-17T12:00:00Z", fetchedAt: "2026-10-17T12:44:44Z" },
} satisfies RunRequest;

const exampleResult = {
  durationMin: 240,
  rows: 157,
  cols: 152,
  A: {
    metrics: {
      burnedHaByHour: [12, 41, 88, 150],
      buildingsReached: 7,
      villages: [
        { id: 1, name: "Abação (São Tomé)", firstArrivalMin: null },
        { id: 2, name: "Aldeias", firstArrivalMin: 187.5 },
      ],
    },
    runs: [
      { buildingsReached: 7, burnedHa: 150 },
      { buildingsReached: 9, burnedHa: 162 },
    ],
  },
  B: {
    metrics: {
      burnedHaByHour: [12, 44, 97, 171],
      buildingsReached: 11,
      villages: [
        { id: 1, name: "Abação (São Tomé)", firstArrivalMin: null },
        { id: 2, name: "Aldeias", firstArrivalMin: 171 },
      ],
    },
    runs: [
      { buildingsReached: 11, burnedHa: 171 },
      { buildingsReached: 12, burnedHa: 180 },
    ],
  },
  elapsedMs: 8123,
} satisfies RunResult;

const exampleEvents = {
  "run-event-progress.json": { type: "progress", status: "running", done: 1, total: 2 } satisfies RunEvent,
  "run-event-done.json": { type: "done" } satisfies RunEvent,
  "run-event-failed.json": { type: "failed", error: "falhou 3 vezes" } satisfies RunEvent,
};

// Fewer runs than the example's 200, so the suite stays fast; everything else as the contract example.
const request: RunRequest = { ...exampleRequest, ensemble: { ...exampleRequest.ensemble, runs: 10 } };

describe("contract examples", () => {
  it("run-request.json and run-result.json equal their typed literals", () => {
    expect(example("run-request.json")).toEqual(exampleRequest);
    expect(example("run-result.json")).toEqual(exampleResult);
  });

  it("every run-event example equals its typed literal", () => {
    for (const [file, literal] of Object.entries(exampleEvents)) expect(example(file), file).toEqual(literal);
  });
});

describe("job", () => {
  const grid = loadGrid(gridsDir, request.grid);
  const { rows, cols } = grid.prepared.header;

  it("same request gives the identical result twice", () => {
    const a = runJob(grid.prepared, request);
    const b = runJob(grid.prepared, request);
    expect({ ...a.result, elapsedMs: 0 }).toEqual({ ...b.result, elapsedMs: 0 });
    expect(a.rasters.A.arrival.equals(b.rasters.A.arrival)).toBe(true);
    expect(a.rasters.B.probability.equals(b.rasters.B.probability)).toBe(true);
    // The two decisions differ in the example (A has interventions, B none).
    expect(a.result.A.metrics.burnedHaByHour).not.toEqual(a.result.B.metrics.burnedHaByHour);
  });

  it("identical decisions pair run by run with no winner", () => {
    const same: RunRequest = { ...request, decisions: { A: request.decisions.A, B: request.decisions.A } };
    const { result } = runJob(grid.prepared, same);
    for (const key of ["buildingsReached", "burnedHa"] as const) {
      const c = comparePaired(result.A.runs, result.B.runs, key);
      expect(c.ties).toBe(same.ensemble.runs);
      expect(c.bBetter).toBe(0);
      expect(c.aBetter).toBe(0);
    }
  });

  it("matches the RunResult contract and the example's keys", () => {
    const { result } = runJob(grid.prepared, request);
    const typed: RunResult = result;
    expect(Object.keys(typed).sort()).toEqual(Object.keys(exampleResult).sort());
    expect(Object.keys(typed.A).sort()).toEqual(Object.keys(exampleResult.A).sort());
    expect(Object.keys(typed.A.metrics).sort()).toEqual(Object.keys(exampleResult.A.metrics).sort());
    expect(Object.keys(typed.A.runs[0]).sort()).toEqual(Object.keys(exampleResult.A.runs[0]).sort());
    expect(typed.A.runs).toHaveLength(request.ensemble.runs);
    expect(typed.rows).toBe(rows);
    expect(typed.cols).toBe(cols);
  });

  it("each raster is rows × cols × 4 bytes", () => {
    const { rasters } = runJob(grid.prepared, request);
    for (const d of ["A", "B"] as const) {
      expect(rasters[d].arrival.byteLength).toBe(rows * cols * 4);
      expect(rasters[d].probability.byteLength).toBe(rows * cols * 4);
    }
    // The ignition cell burns at minute 0; in the ensemble the ignition point varies (up to 400 m), so it
    // burns in some of the runs, not necessarily all.
    const i = request.ignition.row * cols + request.ignition.col;
    expect(rasters.B.arrival.readFloatLE(i * 4)).toBe(0);
    expect(rasters.B.probability.readFloatLE(i * 4)).toBeGreaterThan(0);
  });

  it("the grid hash changes when one layer byte changes under the same header", () => {
    const tmp = mkdtempSync(join(tmpdir(), "grid-hash-"));
    cpSync(join(gridsDir, request.grid), join(tmp, request.grid), { recursive: true });
    expect(loadGrid(tmp, request.grid).hash).toBe(grid.hash);
    const fuelFile = join(tmp, request.grid, grid.prepared.header.layers.fuel);
    const fuel = readFileSync(fuelFile);
    fuel[0] ^= 1;
    writeFileSync(fuelFile, fuel);
    expect(loadGrid(tmp, request.grid).hash).not.toBe(grid.hash);
  });

  it("decodes layers from Buffers with a non-zero byteOffset (the pool-slab case)", () => {
    const header: GridHeader = JSON.parse(readFileSync(join(gridsDir, request.grid, "header.json"), "utf8"));
    const own = {} as LayerBuffers;
    const slices = {} as LayerBuffers<Buffer>;
    for (const layer of gridLayerNames(header)) {
      const file = readFileSync(join(gridsDir, request.grid, header.layers[layer]!));
      own[layer] = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      // A view into a larger allocation, starting 8 bytes in, as Buffer.allocUnsafe slabs do.
      const slab = Buffer.alloc(file.byteLength + 16);
      file.copy(slab, 8);
      const slice = slab.subarray(8, 8 + file.byteLength);
      slices[layer] = slice;
      expect(slice.byteOffset).toBe(8);
    }
    const direct = decodeGrid(header, own);
    const fromSlices = decodeFromBuffers(header, slices);
    for (const layer of gridLayerNames(header)) expect(Array.from(fromSlices[layer]!)).toEqual(Array.from(direct[layer]!));
  });
});

describe("grid variants on the server", () => {
  const variantRequest = example("run-request-variant.json") as RunRequest;
  const small: RunRequest = { ...variantRequest, ensemble: { ...variantRequest.ensemble, runs: 10 } };
  const syn = loadGrid(gridsDir, "sintetica");

  it("the worker's grid hash is the browser's hashGrid, so a variant made in the browser applies here", () => {
    expect(syn.hash).toBe(variantRequest.variants!.B!.base.sha256);
    expect(variantProblem(syn.prepared, syn.hash, small)).toBeNull();
  });

  it("a run with a variant gives what the browser computes, and the fuel break saves the village", () => {
    const { result } = runJob(syn.prepared, small);
    const variant = variantRequest.variants!.B!;
    const browser = simulate(prepareGrid(applyVariant(syn.prepared, variant)), {
      ignition: small.ignition,
      wind: small.wind,
      durationMin: small.durationMin,
      interventions: [],
      spreadModel: "rothermel",
      params: rothermelParams(variant.params, syn.prepared.header.cellSize),
      ensemble: rothermelEnsemble(small.ensemble, variant.params, syn.prepared.header.cellSize),
    });
    expect(result.B.metrics).toEqual(browser.metrics);
    expect(result.B.runs).toEqual(browser.runs);
    expect(result.A.metrics.buildingsReached).toBeGreaterThan(0);
    expect(result.B.metrics.buildingsReached).toBe(0);
    expect(comparePaired(result.A.runs, result.B.runs, "buildingsReached").bBetter).toBeGreaterThan(small.ensemble.runs / 2);
  });

  it("a variant made for another version of the grid is refused before simulating", () => {
    const stale: RunRequest = { ...small, variants: { B: { ...small.variants!.B!, base: { grid: "sintetica", sha256: "0".repeat(64) } } } };
    expect(variantProblem(syn.prepared, syn.hash, stale)).toMatch(/decisão B: .*outra versão da grelha/);
  });
});

describe("spread model in run requests", () => {
  const guimaraes = loadGrid(gridsDir, "guimaraes");
  const base: RunRequest = { ...request, ensemble: { ...request.ensemble, runs: 2 } };

  it("always runs the Rothermel model: a request without a model, or asking for the retired legacy one, gets Rothermel", () => {
    const roth = runDecision(guimaraes.prepared, { ...base, spreadModel: "rothermel" }, "A");
    const none = runDecision(guimaraes.prepared, base, "A");
    const legacy = runDecision(guimaraes.prepared, { ...base, spreadModel: "legacy" }, "A");
    expect(Array.from(none.arrivalMin)).toEqual(Array.from(roth.arrivalMin));
    expect(Array.from(legacy.arrivalMin)).toEqual(Array.from(roth.arrivalMin));
    expect(roth.intensityKwM).toBeDefined();
  });

  it("drier fuel burns more", () => {
    const run = (d1: number) =>
      runDecision(guimaraes.prepared, { ...base, spreadModel: "rothermel", moisture: { d1, d10: d1 + 0.01, d100: d1 + 0.02, liveHerb: 0.6, liveWoody: 0.9 } }, "A")
        .metrics.burnedHaByHour.at(-1)!;
    expect(run(0.04)).toBeGreaterThan(run(0.1));
  });

  it("refuses an unknown model or bad moisture, without retrying", () => {
    expect(variantProblem(guimaraes.prepared, guimaraes.hash, { ...base, spreadModel: "farsite" as never })).toMatch(/modelo de propagação desconhecido/);
    const wet = { ...base, spreadModel: "rothermel" as const, moisture: { d1: -1, d10: 0.07, d100: 0.08, liveHerb: 0.6, liveWoody: 0.9 } };
    expect(variantProblem(guimaraes.prepared, guimaraes.hash, wet)).toMatch(/humidade do combustível "d1" inválida/);
    expect(variantProblem(guimaraes.prepared, guimaraes.hash, { ...base, spreadModel: "rothermel" })).toBeNull();
  });
});

describe("weather steps in run requests", () => {
  const guimaraes = loadGrid(gridsDir, "guimaraes");
  const base: RunRequest = { ...request, ensemble: { ...request.ensemble, runs: 2 } };

  it("a wind shift in the request changes the result; bad steps are refused without retrying", () => {
    const constant = runDecision(guimaraes.prepared, base, "A");
    const shifted = runDecision(
      guimaraes.prepared,
      { ...base, weatherSteps: [{ fromMin: 0, wind: base.wind }, { fromMin: 60, wind: { directionDeg: (base.wind.directionDeg + 180) % 360, speedMs: base.wind.speedMs } }] },
      "A",
    );
    expect(Array.from(shifted.arrivalMin)).not.toEqual(Array.from(constant.arrivalMin));
    const unordered = { ...base, weatherSteps: [{ fromMin: 60, wind: base.wind }, { fromMin: 0, wind: base.wind }] };
    expect(variantProblem(guimaraes.prepared, guimaraes.hash, unordered)).toMatch(/crescente/);
  });
});

describe("ignitions in run requests", () => {
  const guimaraes = loadGrid(gridsDir, "guimaraes");
  const base: RunRequest = { ...request, ensemble: { ...request.ensemble, runs: 2 } };

  it("an already burned area burns more than the point alone; cells outside the grid are refused", () => {
    const { row, col } = base.ignition;
    const area = [];
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) area.push({ cell: { row: row + dr, col: col + dc }, t0Min: 0 });
    const point = runDecision(guimaraes.prepared, base, "A").metrics.burnedHaByHour.at(-1)!;
    const withArea = runDecision(guimaraes.prepared, { ...base, ignitions: area }, "A").metrics.burnedHaByHour.at(-1)!;
    expect(withArea).toBeGreaterThan(point);
    const outside = { ...base, ignitions: [{ cell: { row: -1, col: 0 }, t0Min: 0 }] };
    expect(variantProblem(guimaraes.prepared, guimaraes.hash, outside)).toMatch(/ignição 1 inválida/);
  });
});
