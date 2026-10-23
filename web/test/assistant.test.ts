import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ANDERSON_13,
  firePath,
  rasterizePolygon,
  rasterizePolyline,
  simulate,
  toEngineIntervention,
  projectedToGrid,
  type DecisionId,
  type DrawnIntervention,
  type GridData,
  type ProjectedPoint,
} from "@linha-zero/engine";
import { makeGrid } from "../../engine/test/helpers";
import type { AssistantActions, AssistantContext, AssistantSnapshot, FireRun } from "../src/assistant/context";
import { stateDigest } from "../src/assistant/digest";
import { anchorLine } from "../src/assistant/anchor";
import { MAX_OPTIONS, placementOptions } from "../src/assistant/compare";
import { checkPlan } from "../src/assistant/plan-check";
import { cellCentre, firePlace, firePlaceOf, gridPoint, offsetPlace, placeCells, resolvePlace } from "../src/assistant/places";
import { buildShape } from "../src/assistant/shapes";
import { runTool, TOOL_NAMES } from "../src/assistant/tools";
import { placeStats } from "../src/lib/places";

// A 41 × 41 grid of 100 m grass cells; the wind blows from the south-west, so the head runs north-east to "Aldeia".
const N = 41;
const grid: GridData = makeGrid({
  rows: N,
  cols: N,
  cellSize: 100,
  rothermel: ANDERSON_13[1],
  village: (r, c) => (r >= 4 && r <= 6 && c >= 30 && c <= 32 ? 1 : r >= 34 && r <= 36 && c >= 34 && c <= 36 ? 2 : 0),
});
grid.header.villages = [
  { id: 1, name: "Aldeia" },
  { id: 2, name: "São Tomé" },
];
const places = placeStats(grid);
const ignitionCell = 30 * N + 10;
const ignition: ProjectedPoint = cellCentre(grid.header, ignitionCell);
const wind = { directionDeg: 225, speedMs: 6 };
const DURATION = 480;

function run(interventions: DrawnIntervention[] = []): FireRun {
  const r = simulate(grid, {
    ignition: { row: 30, col: 10 },
    wind,
    durationMin: DURATION,
    interventions: interventions.map((iv) => toEngineIntervention(grid.header, iv, {}, ignition)),
    spreadModel: "rothermel",
    explain: true,
  });
  return { arrivalMin: r.arrivalMin, explain: r.explain! };
}
const free = run();
const aldeia = places.find((p) => p.name === "Aldeia")!;

function snapshot(over: Partial<AssistantSnapshot> = {}): AssistantSnapshot {
  return {
    grid,
    decisionGrids: { A: grid, B: grid },
    zone: "Teste",
    places,
    step: "decisoes",
    ignition,
    burnedArea: false,
    wind,
    air: { tempC: 30, rhPct: 25 },
    moisture: "calculada do tempo",
    weatherSource: "valores por omissão",
    manual: [],
    weatherSteps: 0,
    durationMin: DURATION,
    decisions: { A: [], B: [] },
    variants: { A: null, B: null },
    ensembleOn: false,
    ensembleRuns: 200,
    serverAvailable: false,
    results: null,
    stale: false,
    busy: false,
    t: 0,
    explainAt: null,
    assistantIds: new Set(),
    ...over,
  };
}

/** A context whose actions only record what they were asked to do. */
function fakeContext(snap: AssistantSnapshot) {
  const added: { decision: DecisionId; item: DrawnIntervention }[] = [];
  const actions: AssistantActions = {
    addIntervention: (decision, item) => added.push({ decision, item }),
    updateIntervention: vi.fn(),
    removeIntervention: vi.fn(),
    setDecision: vi.fn(),
    setWind: vi.fn(),
    setDuration: vi.fn(),
    setIgnition: () => null,
    runSimulation: async () => ({ results: null, error: "sem simulação nos testes" }),
    fireRun: async (_d, items) => run(items),
    show: vi.fn(),
  };
  const context: AssistantContext = { snapshot: snap, actions };
  return { context: () => context, added };
}

const line = (id: string, coords: ProjectedPoint[], startMin: number, kind: DrawnIntervention["kind"] = "containmentLine"): DrawnIntervention => ({
  id,
  kind,
  startMin,
  coords,
});

describe("places by name", () => {
  it("matches without accents or case, and the ignition", () => {
    const tome = resolvePlace("sao tome", places, grid.header, ignition);
    expect("place" in tome && tome.place.name).toBe("São Tomé");
    const ig = resolvePlace("Ignição", places, grid.header, ignition);
    expect("place" in ig && ig.place.id).toBe(null);
  });

  it("says which names exist when it does not know one", () => {
    const r = resolvePlace("Braga", places, grid.header, ignition);
    expect("error" in r && r.error).toContain("find_places");
  });
});

describe("places on the fire and away from villages", () => {
  it("finds the head downwind and a flank on each side of it", () => {
    expect(firePlaceOf("Cabeça do fogo")).toBe("head");
    expect(firePlaceOf("flanco direito do fogo")).toBe("right");
    expect(firePlaceOf("Aldeia")).toBe(null);
    const at = (which: "head" | "left" | "right") => {
      const r = firePlace(grid.header, free.arrivalMin, ignition, which, DURATION);
      if ("error" in r) throw new Error(r.error);
      // East and north of the ignition, in cells.
      return { x: r.place.col - 10.5, y: 30.5 - r.place.row };
    };
    const head = at("head");
    // The wind blows from the south-west: the head runs north-east.
    expect(head.x).toBeGreaterThan(5);
    expect(head.y).toBeGreaterThan(5);
    // Looking north-east, the left flank lies to the north-west of the axis and the right flank to the south-east.
    const side = (p: { x: number; y: number }) => head.x * p.y - head.y * p.x;
    expect(side(at("left"))).toBeGreaterThan(0);
    expect(side(at("right"))).toBeLessThan(0);
  });

  it("moves a place by a distance and a compass direction", () => {
    const moved = offsetPlace(grid.header, aldeia, 1000, "sul");
    if ("error" in moved) throw new Error(moved.error);
    expect(moved.place.row).toBeCloseTo(aldeia.row + 10);
    expect(moved.place.col).toBeCloseTo(aldeia.col);
    expect(moved.place.name).toBe("1 km a sul de Aldeia");
    expect("error" in offsetPlace(grid.header, aldeia, 5000, "norte")).toBe(true);
  });
});

describe("anchoring line ends", () => {
  it("stretches an end to the nearest road and leaves an end with nothing near", () => {
    // A road down column 30 of an otherwise open grid.
    const roads = makeGrid({ rows: N, cols: N, cellSize: 100, rothermel: ANDERSON_13[1], barrier: (_r, c) => c === 30 });
    roads.barrier = roads.barrier.map((b) => (b ? 7 : 0));
    const anchored = anchorLine(roads, [gridPoint(grid.header, 20.5, 20.5), gridPoint(grid.header, 20.5, 24.5)]);
    const [a, b] = anchored.coords.map(([x, y]) => projectedToGrid(grid.header, x, y));
    expect(a.x).toBeCloseTo(20.5);
    // One cell short of the road: the road is next to it.
    expect(b.x).toBeCloseTo(29.5);
    expect(anchored.note).toContain("estrada ou rio");
    expect(anchored.note).toContain("sem apoio");
  });
});

describe("shapes from the fire's path", () => {
  it("a line across the path to a place cuts that path", () => {
    const built = buildShape(
      grid.header,
      { shape: "across_path", line: true, place: aldeia, placeCells: placeCells(grid, aldeia), startMin: 10 },
      free,
      DURATION,
    );
    if ("error" in built) throw new Error(built.error);
    expect(built.coords).toHaveLength(2);
    const pts = built.coords.map(([x, y]) => projectedToGrid(grid.header, x, y));
    const cells = new Set(rasterizePolyline(pts, N, N).map((c) => c.row * N + c.col));
    const target = placeCells(grid, aldeia).reduce((a, b) => (free.arrivalMin[a] <= free.arrivalMin[b] ? a : b));
    const path = firePath(free.explain, free.arrivalMin, target);
    expect(path.some((c) => cells.has(c))).toBe(true);
    expect(built.where).toContain("Aldeia");
  });

  it("a zone around a place covers all its houses", () => {
    const built = buildShape(grid.header, { shape: "around_place", line: false, place: aldeia, placeCells: placeCells(grid, aldeia), startMin: 0 }, null, DURATION);
    if ("error" in built) throw new Error(built.error);
    const pts = built.coords.map(([x, y]) => projectedToGrid(grid.header, x, y));
    const covered = new Set(rasterizePolygon(pts, N, N).map((c) => c.row * N + c.col));
    for (const c of placeCells(grid, aldeia)) expect(covered.has(c)).toBe(true);
  });

  it("refuses an action that starts after the fire reaches the place", () => {
    const built = buildShape(
      grid.header,
      { shape: "across_path", line: true, place: aldeia, placeCells: placeCells(grid, aldeia), startMin: DURATION },
      free,
      DURATION,
    );
    expect("error" in built && built.error).toContain("antes de a ação começar");
  });
});

describe("check_plan", () => {
  it("flags a line the fire passes before it is ready, and one the fire never reaches", () => {
    // In the far south-west corner, behind the fire: the simulation ends just before the fire backs into it.
    const far = line("iv-far", [gridPoint(grid.header, 39, 0.5), gridPoint(grid.header, 39, 3)], 0);
    const farCells = toEngineIntervention(grid.header, far).cells.map((c) => c.row * N + c.col);
    const duration = Math.floor(Math.min(...farCells.map((c) => free.arrivalMin[c]))) - 1;
    // Right next to the ignition, ready just before the end: the fire is long past.
    const late = line("iv-late", [gridPoint(grid.header, 26, 6), gridPoint(grid.header, 26, 14)], duration - 1);
    const findings = checkPlan(snapshot({ decisions: { A: [late, far], B: [] }, durationMin: duration }), "A", free);
    expect(findings.find((f) => f.startsWith("[iv-late]"))).toContain("antes de ela começar");
    expect(findings.find((f) => f.startsWith("[iv-far]"))).toContain("não tem efeito");
  });

  it("says when a decision has nothing to check", () => {
    expect(checkPlan(snapshot(), "B", free)).toEqual(["A decisão B não tem ações (deixar arder)."]);
  });
});

describe("tools", () => {
  it("has a handler for every tool the server declares, and nothing else", () => {
    const declared = JSON.parse(readFileSync(new URL("../../backend/src/LinhaZero.Api/Assistant/tools.json", import.meta.url), "utf8")) as { name: string }[];
    expect([...TOOL_NAMES].sort()).toEqual(declared.map((t) => t.name).sort());
  });

  it("place_intervention adds one action to the decision asked, marked with where it went", async () => {
    const { context, added } = fakeContext(snapshot());
    const out = await runTool(
      "place_intervention",
      { decision: "B", kind: "containmentLine", shape: "across_path", place: "Aldeia", start_min: 10, width_m: 10 },
      context,
    );
    expect(out.isError).toBeUndefined();
    expect(added).toHaveLength(1);
    expect(added[0].decision).toBe("B");
    expect(added[0].item).toMatchObject({ kind: "containmentLine", startMin: 10, widthM: 10 });
    expect(out.content).toContain(added[0].item.id);
  });

  it("place_intervention puts a line across the head of the fire, or anywhere a distance from a place", async () => {
    const { context, added } = fakeContext(snapshot());
    const head = await runTool(
      "place_intervention",
      { decision: "A", kind: "containmentLine", shape: "across_path", place: "cabeça do fogo", start_min: 30 },
      context,
    );
    expect(head.isError).toBeUndefined();
    expect(head.content).toContain("cabeça do fogo");
    expect(head.content).toMatch(/Pontas|As duas pontas/);
    const away = await runTool(
      "place_intervention",
      { decision: "A", kind: "suppression", shape: "around_place", place: "Aldeia", offset_m: 800, offset_direction: "sudoeste", start_min: 30 },
      context,
    );
    expect(away.isError).toBeUndefined();
    expect(away.content).toContain("800 m a sudoeste de Aldeia");
    expect(added).toHaveLength(2);
    const half = await runTool(
      "place_intervention",
      { decision: "A", kind: "suppression", shape: "around_place", place: "Aldeia", offset_m: 800, start_min: 30 },
      context,
    );
    expect(half).toMatchObject({ isError: true, content: expect.stringContaining("offset_direction") });
  });

  it("compare_placements ranks spots with the engine and can place the best one", async () => {
    const { context, added } = fakeContext(snapshot());
    const out = await runTool("compare_placements", { decision: "B", kind: "containmentLine", start_min: 20, width_m: 25 }, context);
    expect(out.isError).toBeUndefined();
    expect(out.content).toContain("1. shape=");
    expect(out.content).toContain("cabeça do fogo");
    expect(added).toHaveLength(0);
    const placed = await runTool("compare_placements", { decision: "B", kind: "containmentLine", start_min: 20, width_m: 25, place_best: true }, context);
    expect(placed.content).toContain("Colocada a opção 1");
    expect(added).toHaveLength(1);
    // The placed line burns less than the decision without it.
    const ha = (r: FireRun) => [...r.arrivalMin].filter((t) => t <= DURATION).length;
    expect(ha(run([added[0].item]))).toBeLessThan(ha(free));
  });

  it("placement options take the targets in turn and stay under the cap", () => {
    const targets = ["Aldeia", "São Tomé", "cabeça do fogo"].map((name, i) => ({ name, village: i < 2, arrivalMin: 200 }));
    const options = placementOptions("containmentLine", targets, 20);
    expect(options).toHaveLength(MAX_OPTIONS);
    expect(options.slice(0, 3).map((o) => o.place)).toEqual(["Aldeia", "São Tomé", "cabeça do fogo"]);
    expect(placementOptions("protectZone", [{ name: "cabeça do fogo", village: false, arrivalMin: 200 }], 20)).toEqual([]);
    expect(placementOptions("containmentLine", [{ name: "Aldeia", village: true, arrivalMin: Infinity }], 20)).toEqual([
      { shape: "around_place", place: "Aldeia", radiusM: 300 },
    ]);
  });

  it("returns bad input as an error the model can fix, without touching the app", async () => {
    const { context, added } = fakeContext(snapshot());
    const wrongKind = await runTool("place_intervention", { decision: "C", kind: "containmentLine", shape: "across_path", place: "Aldeia", start_min: 0 }, context);
    expect(wrongKind.isError).toBe(true);
    const zoneBetween = await runTool("place_intervention", { decision: "A", kind: "suppression", shape: "between_places", place: "Aldeia", to_place: "São Tomé", start_min: 0 }, context);
    expect(zoneBetween).toMatchObject({ isError: true, content: expect.stringContaining("só serve para linhas") });
    expect((await runTool("no_such_tool", {}, context)).isError).toBe(true);
    expect(added).toHaveLength(0);
  });

  it("get_results asks for a simulation first", async () => {
    const { context } = fakeContext(snapshot());
    expect(await runTool("get_results", {}, context)).toMatchObject({ isError: true, content: expect.stringContaining("run_simulation") });
  });
});

describe("state digest", () => {
  it("lists the setup and every action with its id", () => {
    const iv = line("iv-1", [gridPoint(grid.header, 20, 20), gridPoint(grid.header, 20, 30)], 30);
    const text = stateDigest(snapshot({ decisions: { A: [iv], B: [] }, assistantIds: new Set(["iv-1"]) }));
    expect(text).toContain("Zona: Teste");
    expect(text).toContain("[iv-1] Linha de contenção de 1 km");
    expect(text).toContain("colocada pelo assistente");
    expect(text).toContain("Decisão B: sem ações (deixar arder)");
    expect(text).toContain("Resultado: ainda não simulado.");
  });

  it("warns that stale results must not be quoted", () => {
    const r = simulate(grid, { ignition: { row: 30, col: 10 }, wind, durationMin: DURATION, interventions: [], spreadModel: "rothermel" });
    const text = stateDigest(snapshot({ results: { A: r, B: r, durationMin: DURATION }, stale: true }));
    expect(text).toContain("DESATUALIZADO");
  });
});
