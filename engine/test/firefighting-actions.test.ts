// Backfires, aerial drops and the end time of every action (ADR 0070): the intervention layers, the
// solver's behaviour when an action ends, and the conversion and checks of drawn actions.
import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import { backfireLitCells, sideOfPolyline } from "../src/geometry";
import { buildInterventionLayers } from "../src/interventions";
import { aerialHoldProbability } from "../src/params";
import type { FuelMoisture } from "../src/rothermel";
import { AERIAL_DEFAULT_MIN, buildScenario, checkInterventions, parseSavedScenario, toEngineIntervention } from "../src/scenario";
import { simulate } from "../src/simulate";
import type { CellRef, Intervention, Scenario } from "../src/types";
import { makeGrid, scenario } from "./helpers";

const dry: FuelMoisture = { d1: 0.05, d10: 0.06, d100: 0.07, liveHerb: 0.3, liveWoody: 0.9 };
const ROWS = 21;
const COLS = 60;
const MID = 10;
// Flat grass, 30 m cells; the wind blows from the west, so the fire runs east from column 2.
const grid = makeGrid({ rows: ROWS, cols: COLS, cellSize: 30, rothermel: ANDERSON_13[1] });
const at = (a: Float32Array, row: number, col: number) => a[row * COLS + col];
const column = (col: number, rows = ROWS): CellRef[] => Array.from({ length: rows }, (_, row) => ({ row, col }));
const block = (c0: number, c1: number): CellRef[] => column(0).flatMap(({ row }) => Array.from({ length: c1 - c0 + 1 }, (_, k) => ({ row, col: c0 + k })));

function run(interventions: Intervention[], extra: Partial<Scenario> = {}) {
  return simulate(
    grid,
    scenario({
      spreadModel: "rothermel",
      ignition: { row: MID, col: 2 },
      wind: { directionDeg: 270, speedMs: 4 },
      moisture: dry,
      durationMin: 240,
      interventions,
      ...extra,
    }),
  );
}

describe("intervention layers", () => {
  it("with no end an action works to the end of the run, as before", () => {
    const l = buildInterventionLayers([{ kind: "suppression", cells: [{ row: 0, col: 0 }], startMin: 5, rateFactor: 0.2 }], 2, 2);
    expect(l.slowStart[0]).toBe(5);
    expect(l.slowEnd[0]).toBe(Infinity);
    expect(l.containEnd[0]).toBe(Infinity);
    expect(l.dropStart[0]).toBe(Infinity);
  });

  it("overlapping lines hold from the earliest start to the latest end; drops alike; the strongest zone wins with its own end", () => {
    const cell = [{ row: 0, col: 0 }];
    const l = buildInterventionLayers(
      [
        { kind: "containmentLine", cells: cell, startMin: 30, endMin: 60 },
        { kind: "backfire", cells: cell, litCells: [{ row: 1, col: 0 }], startMin: 10, endMin: 40 },
        { kind: "aerialDrop", cells: cell, startMin: 20, endMin: 35 },
        { kind: "aerialDrop", cells: cell, startMin: 25, endMin: 50 },
        { kind: "suppression", cells: cell, startMin: 0, endMin: 90, rateFactor: 0.2 },
        { kind: "protectZone", cells: cell, startMin: 15, endMin: 45, rateFactor: 0.1 },
      ],
      1,
      2,
    );
    expect([l.containStart[0], l.containEnd[0]]).toEqual([10, 60]);
    expect([l.dropStart[0], l.dropEnd[0]]).toEqual([20, 50]);
    expect([l.slowFactor[0], l.slowStart[0], l.slowEnd[0]]).toEqual([Math.fround(0.1), 15, 45]);
    expect(l.containStart[1]).toBe(Infinity); // a backfire's lit cells are not part of its line
  });

  it("an unknown kind is refused, not guessed", () => {
    const bad = { kind: "napalm", cells: [{ row: 0, col: 0 }], startMin: 0 } as unknown as Intervention;
    expect(() => buildInterventionLayers([bad], 1, 1)).toThrow(/desconhecido/);
  });
});

describe("an action that ends", () => {
  it("after a zone ends the fire runs as if it had never been there", () => {
    const free = run([]).arrivalMin;
    const zone = (endMin?: number): Intervention => ({ kind: "protectZone", cells: block(8, COLS - 1), startMin: 0, rateFactor: 0.1, ...(endMin !== undefined && { endMin }) });
    const ended = run([zone(60)]).arrivalMin;
    const forever = run([zone()]).arrivalMin;
    // Slowed while the zone lasts, then at full speed: between two cells reached after the end, the
    // fire takes the time it takes with no zone at all.
    expect(at(ended, MID, 40)).toBeGreaterThan(60);
    expect(at(ended, MID, 50) - at(ended, MID, 40)).toBeCloseTo(at(free, MID, 50) - at(free, MID, 40), 2);
    expect(at(ended, MID, 40)).toBeGreaterThan(at(free, MID, 40));
    expect(at(forever, MID, 40) > at(ended, MID, 40) || !Number.isFinite(at(forever, MID, 40))).toBe(true);
  });

  it("a line holds until its end, then the fire crosses it at once", () => {
    const line = (endMin?: number): Intervention => ({ kind: "containmentLine", cells: column(30), startMin: 0, widthM: 25, ...(endMin !== undefined && { endMin }) });
    const held = run([line()]).arrivalMin;
    // Everything west of the line has burned long before minute 200, so only the line's end can let
    // the fire through: no step leaves after it on its own.
    expect(lastWestOf(held, 30)).toBeLessThan(200);
    expect(at(held, MID, 31)).toBe(Infinity);
    const ended = run([line(200)]).arrivalMin;
    expect(at(ended, MID, 31)).toBeGreaterThanOrEqual(200);
    expect(at(ended, MID, 31)).toBeLessThan(210);
    expect(at(ended, MID, 40)).toBeLessThan(Infinity);
  });

  it("a step under way when a zone ends finishes at full speed (the result does not hang on the cell size)", () => {
    // 300 m cells: one step from the ignition takes minutes. The zone (fully effective) slows it 10
    // times until minute 30; the rest of the step then goes at the free rate.
    const big = makeGrid({ rows: 5, cols: 5, cellSize: 300, rothermel: ANDERSON_13[1] });
    const sim = (interventions: Intervention[]) =>
      simulate(
        big,
        scenario({
          spreadModel: "rothermel",
          ignition: { row: 2, col: 0 },
          wind: { directionDeg: 270, speedMs: 4 },
          moisture: dry,
          durationMin: 240,
          interventions,
          params: { attackFullKwM: 1e6, attackNoneKwM: 2e6 },
        }),
      ).arrivalMin[2 * 5 + 1];
    const freeStep = sim([]);
    const all = Array.from({ length: 25 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 }));
    const slowStep = sim([{ kind: "protectZone", cells: all, startMin: 0, rateFactor: 0.1 }]);
    expect(slowStep).toBeGreaterThan(30 + freeStep); // slowed, the step would end long after minute 30
    const ended = sim([{ kind: "protectZone", cells: all, startMin: 0, endMin: 30, rateFactor: 0.1 }]);
    expect(ended).toBeGreaterThan(30);
    expect(ended).toBeLessThan(30 + freeStep);
  });
});

/** The latest arrival among the burned cells west of column `col`. */
function lastWestOf(a: Float32Array, col: number): number {
  let last = 0;
  for (let row = 0; row < ROWS; row++) for (let c = 0; c < col; c++) if (Number.isFinite(at(a, row, c))) last = Math.max(last, at(a, row, c));
  return last;
}

describe("aerial drop", () => {
  const drop = (endMin: number, extra: Partial<Scenario> = {}) => run([{ kind: "aerialDrop", cells: column(30), startMin: 0, endMin }], extra).arrivalMin;

  it("holds a fire it can stop until it wears off, then lets it through", () => {
    const strong = { params: { aerialFullKwM: 1e6, aerialNoneKwM: 2e6 } }; // every fire here is "weak"
    const a = drop(200, strong);
    expect(lastWestOf(a, 30)).toBeLessThan(200); // only the drop wearing off can let the fire through
    expect(at(a, MID, 31)).toBeGreaterThanOrEqual(200);
    expect(at(a, MID, 31)).toBeLessThan(210);
  });

  it("a fire too intense for it crosses as if it were not there", () => {
    const free = run([]).arrivalMin;
    const a = drop(120, { params: { aerialFullKwM: 0, aerialNoneKwM: 1 } });
    expect(Array.from(a)).toEqual(Array.from(free));
  });

  it("holds always up to aerialFullKwM, never from aerialNoneKwM, linearly in between", () => {
    const p = { aerialFullKwM: 2000, aerialNoneKwM: 4000 };
    expect(aerialHoldProbability(500, p)).toBe(1);
    expect(aerialHoldProbability(2000, p)).toBe(1);
    expect(aerialHoldProbability(3000, p)).toBe(0.5);
    expect(aerialHoldProbability(3500, p)).toBe(0.25);
    expect(aerialHoldProbability(4000, p)).toBe(0);
  });

  it("an ember landing on a drop in force goes out (ensemble runs)", () => {
    // Embers everywhere the fire burns; a drop over the whole east half for the whole run. Nothing east
    // of it may ignite while it lasts, because the drop holds every fire here and puts out every ember.
    const params = { aerialFullKwM: 1e6, aerialNoneKwM: 2e6, spotPerHa: 1, spotCriticalKwM: 0 };
    const opts = { params, realisation: { seed: 7, run: 3 } };
    const burnedEast = (a: Float32Array) => {
      let n = 0;
      for (let row = 0; row < ROWS; row++) for (let col = 32; col < COLS; col++) if (Number.isFinite(at(a, row, col))) n++;
      return n;
    };
    // Control: embers fly over a plain strip of drop (or a line) and light the far side.
    const strip = run([{ kind: "aerialDrop", cells: column(30), startMin: 0, endMin: 1000 }], opts).arrivalMin;
    expect(burnedEast(strip)).toBeGreaterThan(0);
    // A drop over the whole east half puts out every ember landing there.
    const half = run([{ kind: "aerialDrop", cells: block(30, COLS - 1), startMin: 0, endMin: 1000 }], opts).arrivalMin;
    expect(burnedEast(half)).toBe(0);
  });
});

describe("backfire", () => {
  const line = column(40);
  const lit = column(39);
  const backfire: Intervention = { kind: "backfire", cells: line, litCells: lit, startMin: 20, widthM: 25 };

  it("lights the fire's side of its line at its minute; the line holds both fires", () => {
    const a = run([backfire]).arrivalMin;
    for (const { row, col } of lit) expect(at(a, row, col)).toBe(20);
    for (let row = 0; row < ROWS; row++) for (let col = 41; col < COLS; col++) expect(at(a, row, col)).toBe(Infinity);
  });

  it("burns back toward the fire, so the fire meets burned ground sooner than at a bare line", () => {
    const withBackfire = run([backfire]).arrivalMin;
    const lineOnly = run([{ kind: "containmentLine", cells: line, startMin: 20, widthM: 25 }]).arrivalMin;
    expect(at(withBackfire, MID, 37)).toBeLessThan(at(lineOnly, MID, 37));
    // The area it burns counts as burned: after the first hour, more than with the bare line.
    const ha = (ivs: Intervention[]) => run(ivs).metrics.burnedHaByHour[0];
    expect(ha([backfire])).toBeGreaterThan(ha([{ kind: "containmentLine", cells: line, startMin: 20, widthM: 25 }]));
  });

  it("a cell the fire already burned is not lit again", () => {
    const late: Intervention = { ...backfire, cells: column(5), litCells: column(4), startMin: 200 };
    const a = run([late]).arrivalMin;
    expect(at(a, MID, 4)).toBeLessThan(200);
  });
});

describe("pairing of decisions", () => {
  it("actions that touch nothing leave every ensemble run unchanged (no extra random draws)", () => {
    const ensemble = { runs: 6, windDirJitterDeg: 30, windSpeedJitterPct: 30, seed: 11, perturb: { deadMoisturePts: 0.03, fuelLogSd: 0.4, ignitionRadiusM: 60 } };
    const base = run([], { ensemble, durationMin: 30 });
    const nowhere: Intervention[] = [
      { kind: "aerialDrop", cells: [{ row: 0, col: COLS - 1 }], startMin: 0, endMin: 10 },
      { kind: "suppression", cells: [{ row: 0, col: COLS - 2 }], startMin: 0, endMin: 5, rateFactor: 0.2 },
      { kind: "containmentLine", cells: [{ row: 1, col: COLS - 1 }], startMin: 0, endMin: 5 },
    ];
    const other = run(nowhere, { ensemble, durationMin: 30 });
    expect(other.runs).toEqual(base.runs);
    expect(Array.from(other.burnProbability!)).toEqual(Array.from(base.burnProbability!));
  });
});

describe("backfire geometry", () => {
  const pts = [{ x: 5, y: 0 }, { x: 5, y: 10 }];
  const cells = column(5, 10);

  it("the side of a polyline follows the nearest segment", () => {
    expect(sideOfPolyline(pts, { x: 2, y: 5 })).toBe(-sideOfPolyline(pts, { x: 8, y: 5 }));
    expect(sideOfPolyline(pts, { x: 5, y: 5 })).toBe(0);
  });

  it("lights the cells next to the line on the fire's side only", () => {
    const west = backfireLitCells(cells, pts, { x: 1, y: 5 }, 10, 10);
    expect(new Set(west.map((c) => c.col))).toEqual(new Set([4]));
    expect(west).toHaveLength(10);
    const east = backfireLitCells(cells, pts, { x: 9, y: 5 }, 10, 10);
    expect(new Set(east.map((c) => c.col))).toEqual(new Set([6]));
    expect(backfireLitCells(cells, pts, { x: 5, y: 3 }, 10, 10)).toEqual([]);
  });
});

describe("drawn actions and scenario files", () => {
  // 10 x 10 cells of 10 m, north-west corner at (0, 0): cell (row, col) spans x = 10 col..10 col + 10, y = -10 row..-10 row - 10.
  const { header } = makeGrid({ rows: 10, cols: 10 });
  const file = (decisions: Record<string, unknown[]>) => ({
    version: 3,
    grid: "test",
    ignition: [15, -55],
    wind: { directionDeg: 270, speedMs: 4 },
    durationMin: 120,
    ensemble: false,
    decisions: { A: [], B: [], ...decisions },
  });
  const vertical = [[55, 0], [55, -100]];

  it("a drop without an end lasts its agent's default", () => {
    const saved = parseSavedScenario(
      file({
        A: [
          { id: "w", kind: "aerialDrop", startMin: 30, coords: vertical },
          { id: "r", kind: "aerialDrop", startMin: 30, agent: "retardant", coords: vertical },
          { id: "e", kind: "aerialDrop", startMin: 30, endMin: 45, agent: "retardant", coords: vertical },
        ],
      }),
      header,
    );
    const ends = buildScenario(header, saved, "A").interventions.map((iv) => iv.endMin);
    expect(ends).toEqual([30 + AERIAL_DEFAULT_MIN.water, 30 + AERIAL_DEFAULT_MIN.retardant, 45]);
  });

  it("a backfire is lit on the ignition's side of its line, and keeps its end and width", () => {
    const saved = parseSavedScenario(file({ A: [{ id: "b", kind: "backfire", startMin: 20, endMin: 80, widthM: 10, coords: vertical }] }), header);
    const [iv] = buildScenario(header, saved, "A").interventions;
    expect(iv.kind).toBe("backfire");
    if (iv.kind !== "backfire") return;
    expect(new Set(iv.cells.map((c) => c.col))).toEqual(new Set([5]));
    expect(new Set(iv.litCells.map((c) => c.col))).toEqual(new Set([4])); // the ignition is west, at x = 15
    expect([iv.endMin, iv.widthM]).toEqual([80, 10]);
  });

  it("a backfire drawn through the ignition is refused with a clear message", () => {
    const d = { id: "b", kind: "backfire" as const, startMin: 0, coords: [[15, 0], [15, -100]] as [number, number][] };
    expect(() => toEngineIntervention(header, d, {}, [15, -55])).toThrow(/sobre a ignição/);
    expect(() => toEngineIntervention(header, d)).toThrow(/precisa da ignição/);
  });

  it("refuses an end before the start, and an agent on anything but a drop", () => {
    const cases: [unknown, RegExp][] = [
      [{ id: "x", kind: "suppression", startMin: 30, endMin: 30, coords: [[0, 0], [50, 0], [50, -50]] }, /minuto de fim/],
      [{ id: "x", kind: "containmentLine", startMin: 0, endMin: "soon", coords: vertical }, /minuto de fim/],
      [{ id: "x", kind: "containmentLine", startMin: 0, agent: "water", coords: vertical }, /agente/],
      [{ id: "x", kind: "aerialDrop", startMin: 0, agent: "foam", coords: vertical }, /agente/],
      [{ id: "x", kind: "backfire", startMin: 0, coords: [[55, 0]] }, /2 pontos/],
    ];
    for (const [iv, why] of cases) expect(() => parseSavedScenario(file({ A: [iv] }), header)).toThrow(why);
  });

  it("checkInterventions refuses what a run request must not carry", () => {
    const ok: Intervention[] = [
      { kind: "aerialDrop", cells: [{ row: 1, col: 1 }], startMin: 0, endMin: 20 },
      { kind: "backfire", cells: [{ row: 1, col: 2 }], litCells: [{ row: 1, col: 1 }], startMin: 5 },
      { kind: "suppression", cells: [{ row: 2, col: 2 }], startMin: 0, rateFactor: 0.2 },
    ];
    expect(() => checkInterventions(ok, 10, 10)).not.toThrow();
    const bad: [unknown, RegExp][] = [
      [[{ kind: "napalm", cells: [], startMin: 0 }], /tipo desconhecido/],
      [[{ kind: "aerialDrop", cells: [{ row: 10, col: 0 }], startMin: 0 }], /células/],
      [[{ kind: "aerialDrop", cells: [], startMin: 10, endMin: 5 }], /fim/],
      [[{ kind: "backfire", cells: [], startMin: 0, litCells: [] }], /acender/],
      [[{ kind: "suppression", cells: [], startMin: 0 }], /fator/],
      ["nope", /lista/],
    ];
    for (const [raw, why] of bad) expect(() => checkInterventions(raw, 10, 10)).toThrow(why);
  });
});
