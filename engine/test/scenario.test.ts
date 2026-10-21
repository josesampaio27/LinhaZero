import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECT_FACTOR, DEFAULT_SUPPRESSION_FACTOR } from "../src/params";
import { buildScenario, cellAt, DEFAULT_ENSEMBLE, parseSavedScenario, rothermelEnsemble, savedScenarioGrid } from "../src/scenario";
import { makeGrid } from "./helpers";

// 10 x 10 cells of 10 m, north-west corner at (0, 0): cell (row, col) spans x = 10 col..10 col + 10, y = -10 row..-10 row - 10.
const { header } = makeGrid({ rows: 10, cols: 10 });
const square = [[20, -20], [60, -20], [60, -60], [20, -60]];
const file = (over: Record<string, unknown> = {}) => ({
  version: 2,
  grid: "test",
  ignition: [45, -35],
  wind: { directionDeg: 270, speedMs: 4 },
  durationMin: 120,
  ensemble: false,
  decisions: { A: [], B: [] },
  ...over,
});

describe("scenario files", () => {
  it("a version 1 ignition cell becomes the centre of that cell and simulates the same cell", () => {
    const v1 = parseSavedScenario(file({ version: 1, ignition: { row: 3, col: 4 } }), header);
    expect(v1.version).toBe(3);
    expect(v1.variants).toEqual({ A: null, B: null });
    expect(v1.ignition).toEqual([45, -35]);
    expect(buildScenario(header, v1, "A").ignition).toEqual({ row: 3, col: 4 });
    expect(parseSavedScenario(file(), header)).toEqual(v1);
  });

  it("zones without a rate factor get the default of their kind", () => {
    const saved = parseSavedScenario(
      file({
        decisions: {
          A: [{ id: "a1", kind: "suppression", startMin: 0, coords: square }],
          B: [{ id: "b1", kind: "protectZone", startMin: 10, coords: square }],
        },
      }),
      header,
    );
    const rate = (d: "A" | "B") => {
      const iv = buildScenario(header, saved, d).interventions[0];
      return iv.kind === "suppression" || iv.kind === "protectZone" ? iv.rateFactor : null;
    };
    expect(rate("A")).toBe(DEFAULT_SUPPRESSION_FACTOR);
    expect(rate("B")).toBe(DEFAULT_PROTECT_FACTOR);
  });

  it("uncertainty on uses the shared Rothermel ensemble, so A and B are paired", () => {
    const saved = parseSavedScenario(file({ ensemble: true }), header);
    const a = buildScenario(header, saved, "A").ensemble;
    expect(a).toEqual(rothermelEnsemble(DEFAULT_ENSEMBLE));
    expect(buildScenario(header, saved, "B").ensemble).toEqual(a);
  });

  it("cellAt maps metres to cells and returns null outside the grid", () => {
    expect(cellAt(header, 0, 0)).toEqual({ row: 0, col: 0 });
    expect(cellAt(header, 99.9, -99.9)).toEqual({ row: 9, col: 9 });
    expect(cellAt(header, 100, -50)).toBeNull();
    expect(cellAt(header, 50, 1)).toBeNull();
  });

  it("rejects broken files with a message saying what is wrong", () => {
    const line = (over: Record<string, unknown>) => ({ id: "x", kind: "containmentLine", startMin: 0, coords: [[0, 0], [50, -50]], ...over });
    const cases: [unknown, RegExp][] = [
      [null, /grelha/],
      [file({ grid: undefined }), /grelha/],
      [file({ version: 4 }), /versão/],
      [file({ ignition: [500, -35] }), /fora da grelha/],
      [file({ version: 1, ignition: { row: 30, col: 0 } }), /fora da grelha/],
      [file({ ignition: "here" }), /ignição/],
      [file({ wind: { directionDeg: "N", speedMs: 4 } }), /vento/],
      [file({ durationMin: 0 }), /duração/],
      [file({ decisions: undefined }), /decisões/],
      [file({ decisions: { A: [line({ kind: "firebreak" })] } }), /ação 1 da decisão A.*tipo/],
      [file({ decisions: { B: [line({ coords: [[0, 0]] })] } }), /ação 1 da decisão B.*2 pontos/],
      [file({ decisions: { A: [line({ startMin: -5 })] } }), /minuto/],
    ];
    for (const [raw, msg] of cases) expect(() => parseSavedScenario(raw, header)).toThrow(msg);
    expect(() => savedScenarioGrid({ grid: "" })).toThrow(/grelha/);
  });

  it("buildScenario needs an ignition inside the grid", () => {
    const saved = parseSavedScenario(file({ ignition: null }), header);
    expect(() => buildScenario(header, saved, "A")).toThrow(/Sem ignição/);
    expect(() => buildScenario(header, { ...saved, ignition: [-5, 0] }, "A")).toThrow(/fora da grelha/);
  });
});

describe("spread model in scenario files", () => {
  const dry = { d1: 0.04, d10: 0.05, d100: 0.06, liveHerb: 0.3, liveWoody: 0.7 };

  it("files without a model, or with the retired legacy one, run the Rothermel model (ADR 0058)", () => {
    for (const over of [{ version: 3 }, { version: 3, spreadModel: "legacy" }]) {
      const saved = parseSavedScenario(file(over), header);
      expect(saved.spreadModel).toBe("rothermel");
      expect(buildScenario(header, saved, "A").spreadModel).toBe("rothermel");
    }
  });

  it("the Rothermel model and its fuel moisture reach the engine scenario of both decisions", () => {
    const saved = parseSavedScenario(file({ version: 3, spreadModel: "rothermel", moisture: dry }), header);
    expect(saved.spreadModel).toBe("rothermel");
    expect(saved.moisture).toEqual(dry);
    for (const d of ["A", "B"] as const) {
      expect(buildScenario(header, saved, d)).toMatchObject({ spreadModel: "rothermel", moisture: dry });
    }
  });

  it("moisture reaches the scenario; unknown models and bad moisture are refused", () => {
    expect(buildScenario(header, { ...parseSavedScenario(file(), header), moisture: dry }, "A").moisture).toEqual(dry);
    expect(() => parseSavedScenario(file({ spreadModel: "farsite" }), header)).toThrow(/modelo de propagação desconhecido/);
    expect(() => parseSavedScenario(file({ spreadModel: "rothermel", moisture: { ...dry, liveWoody: "x" } }), header)).toThrow(
      /humidade do combustível "liveWoody" inválida/,
    );
  });
});

describe("weather steps in scenario files", () => {
  const steps = [
    { fromMin: 0, wind: { directionDeg: 270, speedMs: 4 } },
    { fromMin: 60, wind: { directionDeg: 200, speedMs: 7 }, moisture: { d1: 0.05, d10: 0.06, d100: 0.08, liveHerb: 0.3, liveWoody: 0.8 } },
  ];

  it("reach the engine scenario of both decisions", () => {
    const saved = parseSavedScenario(file({ version: 3, weatherSteps: steps }), header);
    expect(saved.weatherSteps).toEqual(steps);
    for (const d of ["A", "B"] as const) expect(buildScenario(header, saved, d).weatherSteps).toEqual(steps);
    expect(buildScenario(header, parseSavedScenario(file(), header), "A").weatherSteps).toBeUndefined();
  });

  it("are refused when out of order, with a bad wind or with bad moisture", () => {
    const bad = (s: unknown) => () => parseSavedScenario(file({ weatherSteps: s }), header);
    expect(bad([steps[1], steps[0]])).toThrow(/crescente/);
    expect(bad([{ fromMin: 0, wind: { directionDeg: 270, speedMs: -1 } }])).toThrow(/vento inválido/);
    expect(bad([{ ...steps[1], fromMin: 0, moisture: { ...steps[1].moisture, d1: "x" } }])).toThrow(/passo do tempo 1: humidade/);
  });
});

describe("burned area in scenario files", () => {
  it("becomes ignitions from minute 0 (the ignition cell plus every cell of the polygon)", () => {
    const saved = parseSavedScenario(file({ version: 3, burnedArea: square }), header);
    const s = buildScenario(header, saved, "A");
    expect(s.ignitions![0]).toEqual({ cell: s.ignition, t0Min: 0 });
    expect(s.ignitions!.length).toBeGreaterThan(9);
    expect(s.ignitions!.every((i) => i.t0Min === 0)).toBe(true);
    expect(buildScenario(header, parseSavedScenario(file(), header), "A").ignitions).toBeUndefined();
    expect(() => parseSavedScenario(file({ burnedArea: [[0, 0], [1, 1]] }), header)).toThrow(/área ardida/);
  });
});
