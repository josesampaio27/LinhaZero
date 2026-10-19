import { ANDERSON_13 } from "../src/fuel-models";
import { describe, expect, it } from "vitest";
import { prepareGrid } from "../src/grid";
import { canonicalJson, hashGrid, sha256Hex } from "../src/hash";
import { comparePaired } from "../src/metrics";
import { buildScenario, parseSavedScenario } from "../src/scenario";
import { simulate } from "../src/simulate";
import { applyVariant, checkVariantBase, editCells, parseGridVariant, variantHash, type GridVariant } from "../src/variant";
import { makeGrid, reach } from "./helpers";

const text = (s: string) => new TextEncoder().encode(s);

// 61 x 61 cells of 10 m, north-west corner at (0, 0): cell (row, col) has its centre at x = 10 col + 5, y = -(10 row + 5).
const N = 61;
const grid = makeGrid({ rows: N, cols: N, buildings: (_r, c) => (c >= 38 ? 1 : 0), rothermel: ANDERSON_13[1] });
const sha = hashGrid(grid);
const variant = (over: Partial<GridVariant> = {}): GridVariant => ({
  version: 1,
  id: "v1",
  name: "Teste",
  base: { grid: "test", sha256: sha },
  fuelRates: {},
  params: {},
  edits: [],
  ...over,
});
// A north-south line at column 35 (x = 355 m) and a 3-column strip around it.
const wall = [[355, 5], [355, -605]] as [number, number][];
const strip = [[340, 5], [370, 5], [370, -610], [340, -610]] as [number, number][];
const at = (r: number, c: number) => r * N + c;

describe("sha256 and canonical JSON", () => {
  it("matches the standard test vectors", () => {
    expect(sha256Hex(text(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(text("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // 56 bytes: the length no longer fits in the first block.
    expect(sha256Hex(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("canonical JSON ignores key order and undefined fields", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe(canonicalJson({ a: [{ d: 2 }], b: 1 }));
  });

  it("the grid hash changes when one cell changes", () => {
    const same = () => makeGrid({ rows: N, cols: N, buildings: (_r, c) => (c >= 38 ? 1 : 0), rothermel: ANDERSON_13[1] });
    expect(hashGrid(same())).toBe(sha);
    const other = same();
    other.fuel[at(0, 0)] = 0;
    expect(hashGrid(other)).not.toBe(sha);
  });
});

describe("grid variants", () => {
  it("setFuel changes the cells inside the area and leaves the official grid alone", () => {
    const out = applyVariant(grid, variant({ edits: [{ kind: "setFuel", fuel: 0, polygon: strip }] }));
    expect(out.fuel[at(30, 35)]).toBe(0);
    expect(out.fuel[at(30, 30)]).toBe(1);
    expect(grid.fuel[at(30, 35)]).toBe(1);
    expect(hashGrid(grid)).toBe(sha);
  });

  it("a non-burnable strip or an added barrier stops the fire; removing the barrier lets it through again", () => {
    const s = { ignition: { row: 30, col: 30 }, wind: { directionDeg: 270, speedMs: 6 }, durationMin: 600, interventions: [] };
    const run = (v: GridVariant) => simulate(prepareGrid(applyVariant(grid, v)), s).arrivalMin;
    for (const edits of [
      [{ kind: "setFuel" as const, fuel: 0, polygon: strip }],
      [{ kind: "addBarrier" as const, line: wall }],
    ]) {
      const a = run(variant({ edits }));
      for (let r = 0; r < N; r++) expect(a[at(r, 40)]).toBe(Infinity);
    }
    const reopened = run(variant({ edits: [{ kind: "addBarrier", line: wall }, { kind: "removeBarrier", polygon: strip }] }));
    expect(Number.isFinite(reopened[at(30, 40)])).toBe(true);
  });

  it("the barrier line is 4-connected, so the fire cannot slip through diagonally", () => {
    const diagonal = editCells(grid.header, { kind: "addBarrier", line: [[5, -5], [605, -605]] });
    const set = new Set(diagonal);
    for (const i of diagonal) {
      const r = Math.floor(i / N), c = i % N;
      if (r + 1 < N && c + 1 < N && set.has(at(r + 1, c + 1))) {
        expect(set.has(at(r + 1, c)) || set.has(at(r, c + 1))).toBe(true);
      }
    }
  });

  it("new fuel rates change the speed of every cell of that fuel", () => {
    const fast = prepareGrid(applyVariant(grid, variant({ fuelRates: { 1: 16 } })));
    expect(prepareGrid(grid).baseRate[at(10, 10)]).toBe(8);
    expect(fast.baseRate[at(10, 10)]).toBe(16);
  });

  it("the variant's coefficients reach the engine: a weaker wind factor, a rounder fire", () => {
    const raw = {
      version: 3,
      grid: "test",
      ignition: [305, -305],
      wind: { directionDeg: 270, speedMs: 8 },
      durationMin: 30,
      decisions: { A: [], B: [{ id: "b1", kind: "suppression", startMin: 0, coords: strip }] },
      variants: { A: null, B: variant({ params: { windAdj: 0.1, suppressionFactor: 0.5 } }) },
    };
    const saved = parseSavedScenario(raw, grid.header);
    const a = simulate(grid, buildScenario(grid.header, saved, "A")).arrivalMin;
    const bScenario = buildScenario(grid.header, saved, "B");
    const b = simulate(grid, { ...bScenario, interventions: [] }).arrivalMin;
    const ratio = (x: Float32Array) => reach(x, N, 30, 30, 0, 1) / Math.max(1, reach(x, N, 30, 30, 0, -1));
    expect(ratio(a)).toBeGreaterThan(ratio(b));
    const iv = bScenario.interventions[0];
    expect(iv.kind === "suppression" && iv.rateFactor).toBe(0.5);
  });

  it("comparing grids: B on a variant with a strip saves the houses in every paired run", () => {
    const ensemble = { runs: 20, windDirJitterDeg: 20, windSpeedJitterPct: 25, seed: 7 };
    const s = { ignition: { row: 30, col: 30 }, wind: { directionDeg: 270, speedMs: 6 }, durationMin: 30, interventions: [], ensemble };
    const a = simulate(grid, s).runs!;
    const b = simulate(prepareGrid(applyVariant(grid, variant({ edits: [{ kind: "setFuel", fuel: 0, polygon: strip }] }))), s).runs!;
    const c = comparePaired(a, b, "buildingsReached");
    expect(c.bBetter).toBe(20);
    expect(b.every((r) => r.buildingsReached === 0)).toBe(true);
  });

  it("the hash covers what changes, not the name, and not the order of keys", () => {
    const v = variant({ fuelRates: { 1: 10 }, params: { kWind: 0.1, kSlope: 2 }, edits: [{ kind: "addBarrier", line: wall }] });
    expect(variantHash({ ...v, name: "Outro nome", id: "v2" })).toBe(variantHash(v));
    expect(variantHash({ ...v, params: { kSlope: 2, kWind: 0.1 } })).toBe(variantHash(v));
    expect(variantHash({ ...v, edits: [{ kind: "addBarrier", line: [[355, 5], [355, -595]] }] })).not.toBe(variantHash(v));
    expect(() => checkVariantBase(v, sha)).not.toThrow();
    expect(() => checkVariantBase(v, "0".repeat(64))).toThrow(/outra versão da grelha/);
  });

  it("parsing keeps a valid variant and rejects broken ones with a clear message", () => {
    const v = variant({ fuelRates: { 1: 10 }, params: { kWind: 0.1 }, edits: [{ kind: "setFuel", fuel: 0, polygon: strip }] });
    expect(parseGridVariant(JSON.parse(JSON.stringify(v)), grid.header)).toEqual({ ...v, description: undefined });
    const cases: [unknown, RegExp][] = [
      [null, /objeto/],
      [{ ...v, version: 2 }, /versão/],
      [{ ...v, base: { grid: "outra", sha256: sha } }, /grelha "outra"/],
      [{ ...v, fuelRates: { 7: 3 } }, /combustível 7/],
      [{ ...v, fuelRates: { 1: -1 } }, /entre 0 e 200/],
      [{ ...v, params: { kVento: 1 } }, /desconhecido/],
      [{ ...v, params: { kWind: 5 } }, /kWind.*entre 0 e 1/],
      [{ ...v, edits: [{ kind: "setFuel", fuel: 9, polygon: strip }] }, /alteração 1.*combustível/],
      [{ ...v, edits: [{ kind: "removeBarrier", polygon: strip.slice(0, 2) }] }, /alteração 1.*3 pontos/],
      [{ ...v, edits: [{ kind: "paint" }] }, /alteração 1.*tipo/],
    ];
    for (const [raw, msg] of cases) expect(() => parseGridVariant(raw, grid.header)).toThrow(msg);
    const scenario = { version: 3, grid: "test", decisions: { A: [], B: [] }, variants: { B: { ...v, fuelRates: { 7: 3 } } } };
    expect(() => parseSavedScenario(scenario, grid.header)).toThrow(/variante da decisão B/);
  });
});
