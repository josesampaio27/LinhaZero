import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type maplibregl from "maplibre-gl";
import {
  AERIAL_DEFAULT_MIN,
  applyVariant,
  buildScenario,
  cellAt,
  checkVariantBase,
  comparePaired,
  explainPath,
  firePath,
  gridToProjected,
  nearestBurnable,
  DEFAULT_MOISTURE,
  DEFAULT_PARAMS,
  flameLength,
  variantHash,
  type DecisionId,
  type DrawnIntervention,
  type FireExplain,
  type GridData,
  type GridHeader,
  type GridVariant,
  type InterventionKind,
  type PairedComparison,
  type ProjectedPoint,
  type SavedScenario,
  type ScenarioInputs,
  type SimulationResult,
  type SpreadModel,
  type WeatherStep,
} from "@linha-zero/engine";
import { CellInspector, cellUnder } from "./components/CellInspector";
import { ComparisonPanel } from "./components/ComparisonPanel";
import { ExplainPanel } from "./components/ExplainPanel";
import { RunHistoryDialog } from "./components/RunHistoryDialog";
import { DecisionTools, TOOLS } from "./components/DecisionTools";
import { Legend } from "./components/Legend";
import { MapView, type Draft, type MapShape } from "./components/MapView";
import { Icon } from "./components/Icon";
import { MapLayers } from "./components/MapLayers";
import { Popover, Segmented, Shell, Toggle } from "./components/Shell";
import { formatMinutes, TimeBar } from "./components/TimeBar";
import { ConditionsPanel, MoistureControl } from "./components/ConditionsPanel";
import {
  fetchGrid,
  fetchGridIndex,
  fetchScenario,
  fetchScenarioIndex,
  readSavedScenario,
  type GridBundle,
  type GridIndexEntry,
  fetchObservedFire,
  type ObservedFire,
} from "./lib/load-grid";
import { gridBounds, gridToLngLat, lngLatToProjected, projectedToLngLat, type LngLat } from "./lib/projection";
import { fireArrival, fireIntensity, fireProbability, renderTerrain } from "./lib/render";
import { clearRouteParams, navigate, useRoute } from "./lib/route";
import { describeCell, placeStats } from "./lib/places";
import { isLineKind, KIND_LABEL, newId, savedScenarioOf } from "./lib/scenario";
import { ApiError } from "./lib/api";
import { forecastSteps } from "./lib/weather-steps";
import { fetchRunResults, fetchRunScenario, MAX_SERVER_RUNS, MIN_SERVER_RUNS, runOnServer, SERVER_ENSEMBLE, workersAvailable } from "./lib/server-run";
import { useSession } from "./lib/session";
import { SimClient } from "./lib/sim-client";
import { syncMaps } from "./lib/sync-maps";
import { newVariantId, useVariants, variantStore } from "./lib/variants";
import { useLiveWeather } from "./lib/useLiveWeather";
import { useMapPrefs } from "./lib/map-prefs";
import { ageText, fetchIncidents } from "./lib/weather";
import type { IncidentsResponse, RunSummary } from "./api/client";

type Tool = { type: "none" } | { type: "ignite" } | { type: "draw"; decision: DecisionId; kind: InterventionKind } | { type: "burned" };
type SimDraft = Draft & { kind: InterventionKind | "burned" };

const ACCENT: Record<DecisionId, string> = { A: "var(--a)", B: "var(--b)" };
const DECISIONS: DecisionId[] = ["A", "B"];
const NO_VARIANTS: Record<DecisionId, string | null> = { A: null, B: null };

interface Results {
  A: SimulationResult;
  B: SimulationResult;
  durationMin: number;
  key: string;
  /** Ensemble summaries, computed once when the results arrive. */
  likelyHa?: { a: number; b: number };
  /**
   * Rothermel: likelyHa is the expected burned area (Σ probability × cell area) of the ensemble checked
   * against real fires. Legacy: the area with ≥ 50% of the runs.
   */
  burnChance?: boolean;
  paired?: { buildings: PairedComparison; ha: PairedComparison };
  /** When each simulated action starts, for the time bar. */
  starts: { min: number; className: string }[];
  /** Where both maps go once the run lands: the burned extent of A and B plus the ignition and every drawn shape, keyed by run so it fits once. */
  fit: { key: string; bounds: [LngLat, LngLat] } | null;
  /** How the fire reached each cell in each decision's run without random draws (explain.ts); absent if it failed. */
  explain?: Record<DecisionId, { explain: FireExplain; arrivalMin: Float32Array }>;
}

/**
 * The cells that burn by the end in A or B, plus `points` (EPSG:3763: the ignition and the drawn shapes, so the actions
 * stay in view), as a [lng, lat] box with a margin; null when nothing burns and there are no points.
 */
function burnedBounds(
  header: GridData["header"],
  a: Float32Array,
  b: Float32Array,
  durationMin: number,
  points: ProjectedPoint[] = [],
): [LngLat, LngLat] | null {
  const { cols, rows, cellSize, originX, originY } = header;
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  const grow = (c: number, r: number) => {
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r);
  };
  for (let i = 0; i < a.length; i++) if (a[i] <= durationMin || b[i] <= durationMin) grow(i % cols, Math.floor(i / cols));
  for (const [x, y] of points) grow(Math.floor((x - originX) / cellSize), Math.floor((originY - y) / cellSize));
  if (c0 === Infinity) return null;
  // A third of the extent around it (at least 10 cells), so the fire sits in context.
  const m = Math.max(10, Math.round(Math.max(c1 - c0, r1 - r0) / 3));
  const corners = [
    gridToLngLat(header, Math.max(0, c0 - m), Math.max(0, r0 - m)),
    gridToLngLat(header, Math.min(cols, c1 + 1 + m), Math.min(rows, r1 + 1 + m)),
  ];
  const lngs = corners.map((p) => p[0]), lats = corners.map((p) => p[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

type ViewMode = "arrival" | "probability" | "intensity";

type Step = "situacao" | "decisoes" | "resultado";

/**
 * A or B alone, or both. "split" is both side by side on desktop; "swipe" is one map with B over A, cut at a draggable
 * divider (as on the landing). Phones have no room for side by side, so there "split" is the divider too.
 */
type MapsView = "A" | "B" | "split" | "swipe";
/** The "both maps" view to switch to automatically: keeps the divider if that is what is showing. */
const both = (v: MapsView): MapsView => (v === "swipe" ? "swipe" : "split");

const HORIZONS = [1, 2, 3, 4, 5, 6, 7, 8];

const STEP_KEYS: Record<string, Step> = { "1": "situacao", "2": "decisoes", "3": "resultado" };

/** From 900 px both maps fit side by side: automatic view changes keep both, the A / A|B / B switch still picks one. */
const WIDE = window.matchMedia("(min-width: 900px)");
const wide = () => WIDE.matches;
const onWideChange = (cb: () => void) => (WIDE.addEventListener("change", cb), () => WIDE.removeEventListener("change", cb));

/**
 * Inputs of one simulation, captured explicitly so a freshly loaded scenario can run before React re-renders.
 * The ensemble always runs on the engine workers; ensembleRuns is its size (not saved with scenarios).
 */
type SimInputs = ScenarioInputs & { ensembleRuns: number };

const inputKeyOf = (gridName: string, i: SimInputs) =>
  JSON.stringify({
    gridName,
    ignition: i.ignition,
    wind: i.wind,
    durationMin: i.durationMin,
    ensemble: i.ensemble,
    ensembleRuns: i.ensemble ? i.ensembleRuns : null, // only matters when an ensemble runs
    decisions: i.decisions,
    variants: { A: i.variants.A && variantHash(i.variants.A), B: i.variants.B && variantHash(i.variants.B) },
    // Absent means the default, as in the engine (a file may omit it).
    moisture: i.moisture ?? DEFAULT_MOISTURE,
    weatherSteps: i.weatherSteps ?? null,
    burnedArea: i.burnedArea ?? null,
  });

/** A scenario waiting for its grid to load: then it runs, or, opened from the history, its stored result is shown. */
type Pending = { saved: SavedScenario; stored?: { id: string; ensembleRuns: number; createdAt: string } };

const explainOf = (a: SimulationResult, b: SimulationResult): Results["explain"] =>
  a.explain && b.explain ? { A: { explain: a.explain, arrivalMin: a.arrivalMin }, B: { explain: b.explain, arrivalMin: b.arrivalMin } } : undefined;

/**
 * The Results of a run, from what ran (`ran`: the inputs with the ensemble as it actually ran, for the key) and its two
 * results. `fitKey` names the run so both maps fit once; null fit while someone is drawing, so the map does not move.
 */
function resultsOf(
  header: GridHeader,
  gridName: string,
  ran: SimInputs,
  A: SimulationResult,
  B: SimulationResult,
  explain: Results["explain"],
  fitKey: string | null,
): Results {
  // Rothermel: the ensemble checked against real fires; the share of runs that burn each cell is the
  // probability of burning with no firefighting other than what was drawn (ADR 0057).
  const chance = ran.spreadModel === "rothermel" && !!A.burnProbability && !!B.burnProbability;
  return {
    A,
    B,
    burnChance: chance,
    durationMin: ran.durationMin,
    key: inputKeyOf(gridName, ran),
    fit:
      fitKey === null
        ? null
        : (() => {
            const points = [
              ...(ran.ignition ? [ran.ignition] : []),
              ...(ran.burnedArea ?? []),
              ...DECISIONS.flatMap((d) => ran.decisions[d].flatMap((iv) => iv.coords)),
            ];
            const bounds = burnedBounds(header, A.arrivalMin, B.arrivalMin, ran.durationMin, points);
            return bounds && { key: fitKey, bounds };
          })(),
    starts: DECISIONS.flatMap((d) => ran.decisions[d].map((iv) => ({ min: iv.startMin, className: `dec-${d}` }))),
    likelyHa: A.burnProbability && {
      a: chance ? expectedHa(A.burnProbability, header.cellSize) : hectaresAbove(A.burnProbability, 0.5, header.cellSize),
      b: chance ? expectedHa(B.burnProbability!, header.cellSize) : hectaresAbove(B.burnProbability, 0.5, header.cellSize),
    },
    paired: A.runs &&
      B.runs && {
        buildings: comparePaired(A.runs, B.runs, "buildingsReached"),
        ha: comparePaired(A.runs, B.runs, "burnedHa"),
      },
    explain,
  };
}

/** A worker seen idle in the last 60 s counts as available, so the option does not flicker off while the only worker is busy. */
const WORKER_WINDOW_MS = 60_000;

function hectaresAbove(p: Float32Array | undefined, threshold: number, cellSize: number): number {
  if (!p) return 0;
  let n = 0;
  for (let i = 0; i < p.length; i++) if (p[i] >= threshold) n++;
  return (n * cellSize * cellSize) / 10000;
}

/** Expected burned area: the sum of each cell's chance of burning times its area. */
function expectedHa(p: Float32Array, cellSize: number): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i];
  return (s * cellSize * cellSize) / 10000;
}

/** Keeps a variant that came inside a scenario file; a different variant already saved with its id keeps its own. */
function adoptVariant(v: GridVariant): GridVariant {
  const existing = variantStore.get(v.id);
  if (existing && variantHash(existing) === variantHash(v)) return existing;
  const kept = existing ? { ...v, id: newVariantId() } : v;
  variantStore.save(kept);
  return kept;
}

export function App() {
  const sim = useMemo(() => new SimClient(), []);
  const route = useRoute();
  const allVariants = useVariants();
  const [gridIndex, setGridIndex] = useState<GridIndexEntry[]>([]);
  const [gridName, setGridName] = useState("guimaraes");
  const [bundle, setBundle] = useState<GridBundle | null>(null);
  const [ignition, setIgnition] = useState<ProjectedPoint | null>(null); // EPSG:3763, so it survives a grid change
  // Wind, air and fuel moisture: live where the ignition is (or at the zone's centre), each value overridable (ADR 0060).
  const weather = useLiveWeather();
  const { autoFetchAt, fetchAt, loadFromScenario, provenance } = weather;
  const wind = weather.conditions.wind;
  const moisture = weather.moisture;
  const [durationMin, setDurationMin] = useState(240);
  // The only spread model since the simple one was retired (ADR 0058).
  const spreadModel: SpreadModel = "rothermel";
  // Follow the forecast hour by hour: steps from the live weather, or the ones a loaded scenario brought.
  const [followForecast, setFollowForecast] = useState(false);
  const [fileSteps, setFileSteps] = useState<WeatherStep[] | null>(null);
  // Area already burned when the simulation starts (an observed perimeter), drawn on the map.
  const [burnedArea, setBurnedArea] = useState<ProjectedPoint[] | null>(null);
  const [decisions, setDecisions] = useState<Record<DecisionId, DrawnIntervention[]>>({ A: [], B: [] });
  const [variantIds, setVariantIds] = useState<Record<DecisionId, string | null>>(NO_VARIANTS);
  const [tool, setTool] = useState<Tool>({ type: "ignite" });
  const [step, setStep] = useState<Step>("situacao");
  const [decisionTab, setDecisionTab] = useState<DecisionId>("A");
  const [mapsView, setMapsView] = useState<MapsView>(() => (wide() ? "split" : "A"));
  const autoView = (v: MapsView) => setMapsView((prev) => (wide() ? both(prev) : v));
  const isWide = useSyncExternalStore(onWideChange, wide);
  /** Set each render (needs the latest state); called from the window keydown handler. */
  const shortcut = useRef<(e: KeyboardEvent) => void>(() => {});
  const [split, setSplit] = useState(50); // divider position, % of the map width
  // Read by a run that lands later: it must not switch step or view under someone drawing.
  const drawingRef = useRef(false);
  drawingRef.current = tool.type === "draw" || tool.type === "burned";
  // Drawing an action: only that decision's map, on every viewport (taps on the other map are refused), and the view
  // from before once drawing ends. The burned area applies to both, so it keeps whatever view is on.
  const drawDecision = tool.type === "draw" ? tool.decision : null;
  useEffect(() => {
    if (!drawDecision) return;
    const before = mapsView; // the view when drawing started, not each change during it
    setMapsView(drawDecision);
    return () => setMapsView(before);
  }, [drawDecision]);
  const [draft, setDraft] = useState<SimDraft | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  // The cell whose arrival is being explained (a map click or a place in the table on the result step).
  const [explainAt, setExplainAt] = useState<number | null>(null);
  useEffect(() => setExplainAt(null), [results]);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Base map, contours and 3D relief: shared with the grid editor (lib/map-prefs.ts).
  const { baseMap, contours, terrain3d } = useMapPrefs();
  const showOsm = baseMap === "osm";
  const showSatellite = baseMap === "satellite";
  // Replays of real fires: the observed perimeters, drawn over the simulation up to the time shown.
  const [observedFire, setObservedFire] = useState<ObservedFire | null>(null);
  const [showObserved, setShowObserved] = useState(true);
  // On by default: with a worker available every run goes to the server, so it is stored for the history (ADR 0073).
  const [ensemble, setEnsemble] = useState(true);
  const [ensembleRuns, setEnsembleRuns] = useState(SERVER_ENSEMBLE.runs);
  // Last health check: when it ran and whether a worker was idle then.
  const [health, setHealth] = useState<{ at: number; idle: boolean } | null>(null);
  const [lastWorkerSeen, setLastWorkerSeen] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("arrival");
  const [scenarioIndex, setScenarioIndex] = useState<GridIndexEntry[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const session = useSession();
  const [hover, setHover] = useState<{ d: DecisionId; cell: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** How the last run went (time, runs), shown under the result; warnings go to `message`. */
  const [runNote, setRunNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false);
  const [incidents, setIncidents] = useState<IncidentsResponse | null>(null);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [incidentsTick, setIncidentsTick] = useState(0); // "↻" bumps it to refetch
  // Run token: a slow server run must not land after a grid switch, a scenario load or a newer run.
  const runSeq = useRef(0);

  // --- Grid loading ---
  useEffect(() => {
    fetchGridIndex().then(setGridIndex, (e) => setMessage(String(e)));
    fetchScenarioIndex().then(setScenarioIndex, () => setScenarioIndex([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    runSeq.current++; // a run in flight is abandoned: only the current run may clear busy, so clear it here
    setBusy(false);
    setBundle(null);
    setObservedFire(null);
    setResults(null);
    setHover(null); // a cell index of the old grid
    fetchGrid(gridName)
      .then(async (b) => {
        if (cancelled) return;
        await sim.setGrid(b.data.header, b.buffers);
        if (!cancelled) setBundle(b);
        const obs = await fetchObservedFire(b.name, b.data.header).catch(() => null);
        if (!cancelled) setObservedFire(obs);
      })
      .catch((e) => setMessage(`Não foi possível carregar a grelha "${gridName}": ${e instanceof Error ? e.message : e}`));
    return () => {
      cancelled = true;
    };
  }, [gridName, sim]);

  const grid = bundle?.data ?? null;

  // A zone loaded: live weather at the ignition when it is inside, else at the centre. Never over a loaded scenario's values.
  const ignitionRef = useRef(ignition);
  ignitionRef.current = ignition;
  useEffect(() => {
    if (!bundle) return;
    const h = bundle.data.header;
    const p = ignitionRef.current;
    if (p && cellAt(h, p[0], p[1])) autoFetchAt(projectedToLngLat(p[0], p[1]), "ignition");
    else autoFetchAt(gridToLngLat(h, h.cols / 2, h.rows / 2), "centre");
  }, [bundle, autoFetchAt]);

  // Live weather with a forecast follows it hour by hour, from the first live answer on (the toggle stays the user's after that).
  const liveSnapshot = weather.live?.snapshot ?? null;
  const hadLive = useRef(false);
  useEffect(() => {
    if (liveSnapshot && !hadLive.current) setFollowForecast(true);
    hadLive.current = !!liveSnapshot;
  }, [liveSnapshot]);
  const observedUpTo = results && viewMode !== "probability" ? t : Infinity;
  const observedOverlay = useMemo(
    () => (observedFire && showObserved ? { features: observedFire.features, upToMin: observedUpTo } : null),
    [observedFire, showObserved, observedUpTo],
  );
  const ignitionCell = grid && ignition ? cellAt(grid.header, ignition[0], ignition[1]) : null;

  // --- Grid variants: each decision runs on the official grid or on a variant of it ---
  const variants = useMemo<Record<DecisionId, GridVariant | null>>(
    () => ({
      A: allVariants.find((v) => v.id === variantIds.A) ?? null,
      B: allVariants.find((v) => v.id === variantIds.B) ?? null,
    }),
    [allVariants, variantIds],
  );
  const gridVariants = allVariants.filter((v) => v.base.grid === gridName);
  const variantProblem = useMemo(() => {
    if (!bundle) return null;
    for (const d of DECISIONS) {
      const v = variants[d];
      if (!v) continue;
      try {
        checkVariantBase(v, bundle.sha256);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }
    return null;
  }, [bundle, variants]);
  const decisionGrids = useMemo<Record<DecisionId, GridData | null>>(() => {
    if (!grid || variantProblem) return { A: grid, B: grid };
    const of = (v: GridVariant | null) => (v ? applyVariant(grid, v) : grid);
    const a = of(variants.A);
    return { A: a, B: variants.B === variants.A ? a : of(variants.B) };
  }, [grid, variants, variantProblem]);
  const terrainUrls = useMemo<Record<DecisionId, string | null>>(() => {
    const a = decisionGrids.A ? renderTerrain(decisionGrids.A) : null;
    const b = decisionGrids.B === decisionGrids.A ? a : decisionGrids.B ? renderTerrain(decisionGrids.B) : null;
    return { A: a, B: b };
  }, [decisionGrids]);

  // "Testar na simulação" in the grid editor opens #/?variante=<id>: A on the official grid, B on the variant.
  const variantParam = route.page === "simulacao" ? route.params.get("variante") : null;
  useEffect(() => {
    if (!variantParam) return;
    clearRouteParams();
    const v = variantStore.get(variantParam);
    if (!v) {
      setMessage("A variante pedida não está guardada neste browser.");
      return;
    }
    setGridName(v.base.grid);
    setVariantIds({ A: null, B: v.id });
    setResults(null);
    setStep("situacao");
    setMessage(`A decisão A corre na grelha oficial e a B na variante "${v.name}", com o mesmo fogo e o mesmo vento. Acender o fogo e simular.`);
  }, [variantParam]);

  // --- Map sync ---
  const maps = useRef<Partial<Record<DecisionId, maplibregl.Map>>>({});
  const onReady = (d: DecisionId) => (map: maplibregl.Map) => {
    maps.current[d] = map;
    if (maps.current.A && maps.current.B) syncMaps(maps.current.A, maps.current.B);
  };

  // --- Fire layers ---
  const fireImages = useMemo(() => {
    const out: Record<DecisionId, ImageData | null> = { A: null, B: null };
    if (!grid) return out;
    const { cols, rows } = grid.header;
    for (const d of DECISIONS) {
      const prob = results?.[d].burnProbability;
      const intensity = results?.[d].intensityKwM;
      out[d] =
        viewMode === "probability" && prob
          ? fireProbability(cols, rows, prob)
          : viewMode === "intensity" && intensity
            ? fireIntensity(cols, rows, intensity, results![d].arrivalMin, t)
            : fireArrival(cols, rows, results?.[d].arrivalMin ?? null, t, results?.durationMin ?? durationMin);
    }
    return out;
  }, [grid, results, t, durationMin, viewMode]);

  const shapes = useMemo(() => {
    // Retardant drops get their own colour on the map.
    const mapKind = (iv: DrawnIntervention) => (iv.kind === "aerialDrop" && iv.agent === "retardant" ? "aerialDropRetardant" : iv.kind);
    const of = (items: DrawnIntervention[]): MapShape[] => items.map((iv) => ({ kind: mapKind(iv), line: isLineKind(iv.kind), coords: iv.coords }));
    const burned: MapShape[] = burnedArea ? [{ kind: "burned", line: false, coords: burnedArea }] : [];
    // The fire's path to the cell being explained, through the cell centres.
    const path = (d: DecisionId): MapShape[] => {
      const ex = results?.explain?.[d];
      if (!grid || !ex || explainAt === null || step !== "resultado") return [];
      const { cols } = grid.header;
      const cells = firePath(ex.explain, ex.arrivalMin, explainAt);
      if (cells.length < 2) return [];
      const coords = cells.map((i): [number, number] => {
        const p = gridToProjected(grid.header, (i % cols) + 0.5, Math.floor(i / cols) + 0.5);
        return [p.x, p.y];
      });
      return [{ kind: "firePath", line: true, coords }];
    };
    return { A: [...burned, ...of(decisions.A), ...path("A")], B: [...burned, ...of(decisions.B), ...path("B")] };
  }, [decisions, burnedArea, results, explainAt, grid, step]);

  // --- Drawing ---
  const finishDraft = useCallback(() => {
    if (!draft || (tool.type !== "draw" && tool.type !== "burned") || !grid) return;
    // Double-clicks add repeated vertices: drop points closer than a third of a cell.
    const minDist = grid.header.cellSize / 3;
    const coords = draft.coords.filter(
      (p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > minDist,
    );
    const needed = draft.line ? 2 : 3;
    if (coords.length < needed) {
      setMessage(draft.line ? "Uma linha precisa de pelo menos 2 pontos." : "Uma zona precisa de pelo menos 3 pontos.");
      return;
    }
    if (tool.type === "burned") {
      setBurnedArea(coords);
      setDraft(null);
      setTool({ type: "none" });
      setMessage(null);
      return;
    }
    const d = tool.decision;
    // No rateFactor: zones take the default of their kind when simulated, which a grid variant can change.
    // A drop starts as water, with its default duration (changed on its card).
    const kind = draft.kind as InterventionKind;
    const item: DrawnIntervention = {
      id: newId(),
      kind,
      startMin: 0,
      ...(kind === "aerialDrop" && { agent: "water" as const, endMin: AERIAL_DEFAULT_MIN.water }),
      coords,
    };
    setDecisions((prev) => ({ ...prev, [d]: [...prev[d], item] }));
    setDraft(null);
    setTool({ type: "none" });
    setMessage(null);
  }, [draft, tool, grid]);

  const cancelTool = useCallback(() => {
    setDraft(null);
    setTool({ type: "none" });
  }, []);

  const active = route.page === "simulacao";
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelTool();
      shortcut.current(e);
      // Enter on a focused control does what that control does.
      if (e.key === "Enter" && !(e.target instanceof Element && e.target.closest("button, a, summary, input, select, textarea"))) finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, cancelTool, finishDraft]);

  /** Sets the ignition at a map point (ignite tool or incident marker): the only path where the user moves the ignition. */
  const igniteAt = (lngLat: LngLat) => {
    if (!grid) return;
    // Whole metres keep saved files tidy; the cell is checked after rounding so both agree.
    const [x, y] = lngLatToProjected(lngLat[0], lngLat[1]).map(Math.round);
    const cell = cellAt(grid.header, x, y);
    if (!cell) {
      setMessage("O ponto está fora da grelha.");
      return;
    }
    // On a road, a river or a non-burnable patch, the fire starts on the nearest cell that burns.
    const target = nearestBurnable(grid, cell);
    if (!target) {
      setMessage("Não há combustível a menos de 200 m deste ponto (zona urbana, água). Escolher outro ponto.");
      return;
    }
    const moved = target.row !== cell.row || target.col !== cell.col;
    const { cellSize, originX, originY } = grid.header;
    const point: [number, number] = moved
      ? [Math.round(originX + (target.col + 0.5) * cellSize), Math.round(originY - (target.row + 0.5) * cellSize)]
      : [x, y];
    setMessage(
      moved
        ? `O ponto escolhido não arde (estrada, rio ou zona sem combustível): a ignição passou para a célula com combustível mais próxima, a ${Math.round(Math.hypot(target.row - cell.row, target.col - cell.col) * cellSize).toLocaleString("pt-PT")} m.`
        : null,
    );
    setIgnition(point);
    fetchAt(projectedToLngLat(point[0], point[1]), "ignition");
    setTool({ type: "none" });
  };

  const onMapClick = (d: DecisionId) => (lngLat: LngLat) => {
    if (!grid) return;
    if (tool.type === "none") {
      // On the result, a tap asks why the fire gets there (or when it does not).
      if (step === "resultado" && results?.explain) setExplainAt(cellUnder(decisionGrids[d], lngLat));
      return;
    }
    if (tool.type === "ignite") {
      igniteAt(lngLat);
    } else if (tool.type === "burned") {
      const xy = lngLatToProjected(lngLat[0], lngLat[1]);
      setDraft((prev) => ({ kind: "burned", line: false, coords: [...(prev?.coords ?? []), xy] }));
    } else if (tool.type === "draw") {
      if (d !== tool.decision) {
        setMessage(`Desenhar no mapa da Decisão ${tool.decision}.`);
        return;
      }
      const xy = lngLatToProjected(lngLat[0], lngLat[1]);
      setDraft((prev) => ({ kind: tool.kind, line: isLineKind(tool.kind), coords: [...(prev?.coords ?? []), xy] }));
    }
  };

  const onMapHover = (d: DecisionId) => (lngLat: LngLat | null) => {
    const cell = cellUnder(decisionGrids[d], lngLat);
    setHover((prev) => (cell === null ? null : prev?.d === d && prev.cell === cell ? prev : { d, cell }));
  };

  const pickTool = (decision: DecisionId) => (kind: InterventionKind) => {
    setDraft(null);
    setMessage(null);
    setTool({ type: "draw", decision, kind });
  };

  const updateIv = (d: DecisionId) => (id: string, patch: Partial<DrawnIntervention>) =>
    setDecisions((prev) => ({ ...prev, [d]: prev[d].map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)) }));
  const removeIv = (d: DecisionId) => (id: string) =>
    setDecisions((prev) => ({ ...prev, [d]: prev[d].filter((iv) => iv.id !== id) }));

  // --- Server health (every 15 s: the uncertainty toggle turns on and off with it) ---
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      workersAvailable().then((idle) => {
        if (cancelled) return;
        setHealth({ at: Date.now(), idle });
        if (idle) setLastWorkerSeen(Date.now());
      });
    void check();
    const timer = setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  const serverAvailable = health !== null && Date.now() - lastWorkerSeen < WORKER_WINDOW_MS;
  // Uncertainty needs the workers: without one seen lately it is off, and each decision runs once in the browser.
  const ensembleOn = ensemble && serverAvailable;

  // --- Weather over time and fuel moisture from the weather ---
  const snapshot = liveSnapshot;
  const moistureFromWeather = weather.conditions.moistureMode === "tempo";
  const weatherSteps = useMemo(() => {
    if (!followForecast) return undefined;
    if (!snapshot) return fileSteps ?? undefined;
    return forecastSteps(snapshot, wind, moisture, durationMin, spreadModel === "rothermel" && moistureFromWeather);
  }, [followForecast, snapshot, fileSteps, wind, moisture, durationMin, spreadModel, moistureFromWeather]);
  const forecastChanges = snapshot ? Math.max(0, forecastSteps(snapshot, wind, undefined, durationMin, false).length - 1) : 0;

  // --- Simulation ---
  const inputs: SimInputs = {
    ignition,
    wind,
    durationMin,
    ensemble: ensembleOn,
    ensembleRuns,
    decisions,
    variants,
    spreadModel,
    moisture,
    weatherSteps,
    burnedArea: burnedArea ?? undefined,
  };
  const inputKey = inputKeyOf(gridName, inputs);

  const runSimulation = useCallback(
    async (inputs: SimInputs, opts: { animate: boolean }) => {
      if (!bundle) return;
      const my = ++runSeq.current;
      const current = () => my === runSeq.current;
      const header = bundle.data.header;
      setBusy(true);
      setPlaying(false);
      try {
        for (const d of DECISIONS) if (inputs.variants[d]) checkVariantBase(inputs.variants[d]!, bundle.sha256);
        // The same engine scenarios feed the browser and the server: interventions in cells, zone factors from each variant.
        const scenarios = { A: buildScenario(header, inputs, "A"), B: buildScenario(header, inputs, "B") };
        let A: SimulationResult, B: SimulationResult, done: string;
        // Why the ensemble could not run on the server; the decisions then run once each in the browser.
        let serverProblem = null as string | null;
        const server = inputs.ensemble
          ? await runOnServer(
              header,
              {
                grid: bundle.name,
                ignition: scenarios.A.ignition,
                wind: inputs.wind,
                durationMin: inputs.durationMin,
                ensemble: { ...SERVER_ENSEMBLE, runs: inputs.ensembleRuns },
                decisions: { A: scenarios.A.interventions, B: scenarios.B.interventions },
                variants: inputs.variants.A || inputs.variants.B ? inputs.variants : undefined,
                weather: provenance,
                ...(inputs.spreadModel === "rothermel" && { spreadModel: "rothermel" as const, moisture: inputs.moisture }),
                ...(inputs.weatherSteps?.length && { weatherSteps: inputs.weatherSteps }),
                ...(scenarios.A.ignitions && { ignitions: scenarios.A.ignitions }),
                // The run as drawn, for the history (ignored by the worker). Its variants already travel in `variants`
                // and the body is capped at 1 MB, so they go once: the API puts them back when the scenario is read.
                scenario: { ...savedScenarioOf(bundle.name, scenarioTitle, inputs, provenance), variants: { A: null, B: null } },
              },
              (n) => current() && setMessage(`A simular no servidor: ${n}/2`),
            ).catch((e: unknown) => {
              console.warn("servidor indisponível, a simular sem incerteza", e);
              serverProblem = e instanceof ApiError && e.status === 400 ? `Pedido inválido: ${e.message}` : "Servidor indisponível";
              return null;
            })
          : null;
        if (!current()) return;
        // What actually ran, for the result's key: without the server, no ensemble.
        const ran: SimInputs = { ...inputs, ensemble: !!server };
        // The run without random draws, recording how the fire reached each cell: the map's arrival run.
        const explainRun = (d: DecisionId) => ({ scenario: { ...scenarios[d], ensemble: undefined, explain: true }, variant: inputs.variants[d] });
        let explain: Results["explain"];
        if (server) {
          ({ A, B } = server);
          done = `Simulação no servidor: 2×(${inputs.ensembleRuns}+1) corridas em ${server.elapsedMs.toLocaleString("pt-PT")} ms.`;
          // The server does not send it back; one run per decision here takes milliseconds on a 100 m grid.
          const ex = await sim.simulate(DECISIONS.map(explainRun)).catch(() => null);
          if (ex) explain = explainOf(ex.results[0], ex.results[1]);
        } else {
          const { results: res, elapsedMs } = await sim.simulate(DECISIONS.map(explainRun));
          [A, B] = res;
          explain = explainOf(A, B);
          done = `Simulação das duas decisões feita em ${Math.round(elapsedMs).toLocaleString("pt-PT")} ms.`;
          if (serverProblem) done = `${serverProblem}: simulado sem incerteza. ${done}`;
        }
        if (!current()) return;
        // Not under someone drawing: the map must not move while they mark points.
        setResults(resultsOf(header, bundle.name, ran, A, B, explain, drawingRef.current ? null : String(my)));
        setViewMode("arrival"); // Chegada first, also for an ensemble: Cenários is one tap away
        // Losing the uncertainty is worth noticing: it goes to the message, not to the quiet note.
        setRunNote(serverProblem ? null : done);
        setMessage(serverProblem ? done : null);
        if (!drawingRef.current) {
          setStep("resultado");
          setMapsView(both);
        }
        // Server runs too: the result opens on Chegada, which plays from the ignition to the end.
        if (opts.animate) {
          setT(0);
          setPlaying(true);
        } else setT(inputs.durationMin);
      } catch (e) {
        if (current()) setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        if (current()) setBusy(false);
      }
    },
    [bundle, sim, provenance, scenarioTitle],
  );

  // --- Scenarios ---
  const applyScenario = useCallback((saved: SavedScenario, stored?: Pending["stored"]) => {
    const variants = { A: saved.variants.A && adoptVariant(saved.variants.A), B: saved.variants.B && adoptVariant(saved.variants.B) };
    runSeq.current++;
    setBusy(false);
    setDraft(null);
    setTool({ type: "none" });
    setResults(null);
    setGridName(saved.grid);
    setIgnition(saved.ignition);
    loadFromScenario(saved);
    setDurationMin(saved.durationMin);
    setFileSteps(saved.weatherSteps ?? null);
    setBurnedArea(saved.burnedArea ?? null);
    setFollowForecast(!!saved.weatherSteps?.length);
    setEnsemble(saved.ensemble);
    if (stored) setEnsembleRuns(stored.ensembleRuns); // as it ran, so the stored result is not shown as out of date
    setDecisions(saved.decisions);
    setVariantIds({ A: variants.A?.id ?? null, B: variants.B?.id ?? null });
    setScenarioTitle(saved.title ?? null);
    setStep("situacao");
    setPending({ saved: { ...saved, variants }, stored });
  }, [loadFromScenario]);

  // --- Active incidents (fogos.pt) ---
  useEffect(() => {
    if (!showIncidents || !grid) return;
    let cancelled = false;
    fetchIncidents(gridBounds(grid.header)).then(
      (r) => {
        if (cancelled) return;
        setIncidents(r);
        setIncidentsError(null);
      },
      (e) => {
        if (cancelled) return;
        setIncidents(null);
        setIncidentsError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [showIncidents, grid, incidentsTick]);

  const incidentsLine = (() => {
    if (!showIncidents) return null;
    if (incidentsError) return incidentsError;
    if (!incidents) return "A obter ocorrências…";
    const src = incidents.source;
    if (src.error && !src.fetchedAt) return `Ocorrências indisponíveis: ${src.error}`;
    const n = incidents.incidents.length;
    const text = n === 0 ? "Sem ocorrências ativas na zona" : `${n} ${n === 1 ? "ocorrência ativa" : "ocorrências ativas"} na zona`;
    return src.stale && src.fetchedAt ? `${text} (dados de ${ageText(src.fetchedAt)}, sem ligação)` : text;
  })();

  /** A run from the history: its stored result on the maps, without simulating again (docs/decisoes/0073). */
  const showStoredRun = useCallback(
    async (inputs: SimInputs, stored: NonNullable<Pending["stored"]>) => {
      if (!bundle) return;
      const my = ++runSeq.current;
      const current = () => my === runSeq.current;
      const header = bundle.data.header;
      setBusy(true);
      setPlaying(false);
      try {
        for (const d of DECISIONS) if (inputs.variants[d]) checkVariantBase(inputs.variants[d]!, bundle.sha256);
        const server = await fetchRunResults(header, stored.id);
        if (!current()) return;
        // As after a server run: the explanation is not stored, and one run per decision here takes milliseconds.
        const ex = await sim
          .simulate(DECISIONS.map((d) => ({ scenario: { ...buildScenario(header, inputs, d), ensemble: undefined, explain: true }, variant: inputs.variants[d] })))
          .catch(() => null);
        if (!current()) return;
        const explain = ex ? explainOf(ex.results[0], ex.results[1]) : undefined;
        setResults(resultsOf(header, bundle.name, { ...inputs, ensemble: true }, server.A, server.B, explain, String(my)));
        setViewMode("arrival");
        const at = new Date(stored.createdAt).toLocaleString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        setRunNote(`Simulação guardada de ${at}: 2×(${inputs.ensembleRuns}+1) corridas no servidor.`);
        setMessage(null);
        setStep("resultado");
        setMapsView(both);
        // Replayed from the ignition to the end, as when it first ran.
        setT(0);
        setPlaying(true);
      } catch (e) {
        if (current()) setMessage(`Não foi possível abrir a simulação guardada: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (current()) setBusy(false);
      }
    },
    [bundle, sim],
  );

  // Once the scenario's grid is loaded, run it straight away so the comparison is ready (or show the stored one).
  useEffect(() => {
    if (!pending || !bundle || bundle.name !== pending.saved.grid) return;
    setPending(null);
    // The scenario's inputs are passed explicitly: React has not re-rendered with them yet. Its ensemble goes to
    // the server even before the first health check answers; without workers it runs without uncertainty.
    const { saved, stored } = pending;
    if (stored) void showStoredRun({ ...saved, ensembleRuns: stored.ensembleRuns }, stored);
    else if (saved.ignition) void runSimulation({ ...saved, ensembleRuns }, { animate: false });
  }, [pending, bundle, runSimulation, showStoredRun, ensembleRuns]);

  /** "Abrir" in the history: the drawn scenario stored with the run, checked like a file, then its stored result. */
  const openRun = useCallback(
    async (run: RunSummary) => {
      try {
        const saved = await readSavedScenario(await fetchRunScenario(run.id));
        applyScenario(saved, { id: run.id, ensembleRuns: run.ensembleRuns, createdAt: run.createdAt });
      } catch (e) {
        setMessage(`Não foi possível abrir a simulação guardada: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [applyScenario],
  );

  const loadScenarioByName = useCallback(
    async (name: string) => {
      try {
        applyScenario(await readSavedScenario(await fetchScenario(name)));
      } catch (e) {
        setMessage(`Não foi possível abrir o cenário "${name}": ${e instanceof Error ? e.message : e}`);
      }
    },
    [applyScenario],
  );

  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get("scenario");
    if (name) void loadScenarioByName(name);
  }, [loadScenarioByName]);

  const saveScenario = () => {
    // The ensemble as chosen, even while no worker is there to run it.
    const saved = savedScenarioOf(gridName, scenarioTitle, { ...inputs, ensemble }, provenance);
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cenario-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadScenarioFile = async (file: File) => {
    try {
      applyScenario(await readSavedScenario(JSON.parse(await file.text())));
    } catch (e) {
      setMessage(`Não foi possível ler "${file.name}": ${e instanceof Error ? e.message : e}`);
    }
  };

  // Arrival (or burn probability) of both decisions at the cell under the pointer.
  const hoverExtra = (cell: number): [string, string][] => {
    if (!results) return [];
    if (viewMode === "probability" && results.A.burnProbability && results.B.burnProbability) {
      const pct = (d: DecisionId) => `${Math.round(results[d].burnProbability![cell] * 100)}%`;
      return [["Cenários em que arde", `A ${pct("A")} · B ${pct("B")}`]];
    }
    const at = (d: DecisionId) => {
      const m = results[d].arrivalMin[cell];
      return m <= results.durationMin ? formatMinutes(m) : "não arde";
    };
    const rows: [string, string][] = [["Chegada do fogo", `A ${at("A")} · B ${at("B")}`]];
    if (results.A.intensityKwM && results.B.intensityKwM) {
      const fire = (d: DecisionId) => {
        const I = results[d].intensityKwM![cell];
        return I > 0 ? `${Math.round(I).toLocaleString("pt-PT")} kW/m (chamas ${flameLength(I).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m)` : "—";
      };
      rows.push(["Intensidade", `A ${fire("A")} · B ${fire("B")}`]);
    }
    return rows;
  };

  /** "Atualizar" / "Usar o tempo de agora": live weather at the ignition, else at the zone's centre. */
  const fetchHere = () => {
    if (!grid) return;
    const h = grid.header;
    if (ignition && ignitionCell) fetchAt(projectedToLngLat(ignition[0], ignition[1]), "ignition");
    else fetchAt(gridToLngLat(h, h.cols / 2, h.rows / 2), "centre");
  };

  /**
   * "Nova simulação": back to an empty situation in the same zone, with live weather. The fire, the drawn decisions, the
   * burned area, the variants, a loaded scenario and the result go; the zone and the settings (duration, view) stay.
   */
  const newSimulation = () => {
    if (
      (decisions.A.length + decisions.B.length > 0 || ignition || burnedArea) &&
      !confirm("Começar uma simulação nova? O fogo, as decisões desenhadas e o resultado desta são apagados.")
    )
      return;
    runSeq.current++; // a run in flight must not land on the new simulation
    setBusy(false);
    setPlaying(false);
    setT(0);
    setDraft(null);
    setResults(null);
    setRunNote(null);
    setMessage(null);
    setHover(null);
    setIgnition(null);
    setBurnedArea(null);
    setDecisions({ A: [], B: [] });
    setVariantIds(NO_VARIANTS);
    setFileSteps(null);
    setScenarioTitle(null);
    setDecisionTab("A");
    autoView("A");
    // Live weather again, at the zone's centre until a new ignition asks for its own point.
    weather.resetAll();
    if (grid) fetchAt(gridToLngLat(grid.header, grid.header.cols / 2, grid.header.rows / 2), "centre");
    setStep("situacao");
    setTool({ type: "ignite" });
  };

  const changeGrid = (name: string) => {
    if (name === gridName) return;
    const lost = variantIds.A || variantIds.B;
    // Same pattern as "Nova simulação": what would go silently is confirmed first.
    if (lost && !confirm("Mudar de zona? As variantes de grelha das decisões deixam de se aplicar e o resultado é apagado.")) return;
    setGridName(name);
    setVariantIds(NO_VARIANTS);
    setScenarioTitle(null); // the app bar then names the zone
    setMessage(lost ? "Zona mudada: as decisões voltaram à grelha oficial." : null);
  };

  const places = useMemo(() => (grid ? placeStats(grid) : []), [grid]);

  // --- Why the fire gets to a point (explain.ts) ---
  /** The cell of a place the fire reaches first, in either decision; null if it reaches none. */
  const firstReachedCell = (placeId: number): number | null => {
    if (!grid || !results) return null;
    let best: number | null = null;
    let bestT = Infinity;
    for (let i = 0; i < grid.village.length; i++) {
      if (grid.village[i] !== placeId) continue;
      const t = Math.min(results.A.arrivalMin[i], results.B.arrivalMin[i]);
      if (t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best;
  };
  const explanation = (() => {
    const ex = results?.explain;
    if (!ex || explainAt === null || !grid || !decisionGrids.A || !decisionGrids.B) return null;
    const { cols } = grid.header;
    const of = (d: DecisionId) => explainPath(decisionGrids[d]!, ex[d].explain, ex[d].arrivalMin, explainAt);
    const reached = (d: DecisionId) => Number.isFinite(ex[d].arrivalMin[explainAt]);
    return (
      <ExplainPanel
        place={describeCell(grid, places, Math.floor(explainAt / cols), explainAt % cols)}
        grids={{ A: decisionGrids.A, B: decisionGrids.B }}
        explanations={{ A: of("A"), B: of("B") }}
        reached={{ A: reached("A"), B: reached("B") }}
        onClose={() => setExplainAt(null)}
      />
    );
  })();
  const ignitionText =
    tool.type === "ignite" && !ignition
      ? "A aguardar o ponto no mapa…"
      : ignitionCell && grid
        ? (describeCell(grid, places, ignitionCell.row, ignitionCell.col) ?? "Ignição colocada.")
        : ignition
          ? grid
            ? "A ignição está fora desta zona. Acender o fogo noutro ponto."
            : "A carregar a zona…"
          : "Sem ignição.";

  const stale = !!results && results.key !== inputKey;
  const goTo = (s: Step) => {
    setStep(s);
    if (s === "decisoes") autoView(decisionTab);
    if (s === "resultado" && results) setMapsView(both);
  };

  // Light shortcuts (keydown handler above): 1/2/3 pick the step, Space plays or pauses. Never while typing or with a modifier.
  shortcut.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest("input, select, textarea, [contenteditable]") || document.querySelector("dialog[open], .popover-panel")) return;
    if (tool.type === "draw" || tool.type === "burned") return;
    const s = STEP_KEYS[e.key];
    if (s) goTo(s);
    else if (e.key === " " && results && viewMode !== "probability" && !el?.closest("button, a, summary")) {
      e.preventDefault();
      setPlaying((p) => !p);
    }
  };

  const dragSplit = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    setSplit(Math.min(95, Math.max(5, ((e.clientX - r.left) / r.width) * 100)));
  };

  const drawing = tool.type === "draw" ? tool : null;
  const points = draft?.coords.length ?? 0;
  const title = scenarioTitle ?? gridIndex.find((g) => g.name === gridName)?.label ?? "Zona";

  /** The title's panel: where and what is simulated (zone, examples, files). */
  const titleMenu = (close: () => void) => (
    <div className="menu-body">
      <label className="field">
        <span className="field-label">Zona</span>
        <select
          value={gridName}
          onChange={(e) => {
            changeGrid(e.target.value);
            close();
          }}
        >
          {gridIndex.map((g) => (
            <option key={g.name} value={g.name}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      {scenarioIndex.length > 0 && <p className="field-label">Exemplos</p>}
      {scenarioIndex.map((s) => (
        <button
          key={s.name}
          className="menu-item"
          onClick={() => {
            close();
            void loadScenarioByName(s.name);
          }}
        >
          {s.label}
        </button>
      ))}
      <div className="row">
        <button
          onClick={() => {
            close();
            fileInput.current?.click();
          }}
        >
          Abrir ficheiro
        </button>
        <button
          onClick={() => {
            close();
            saveScenario();
          }}
        >
          Guardar ficheiro
        </button>
      </div>
    </div>
  );

  const menu = (close: () => void) => (
    <div className="menu-body">
      <button
        className="menu-item"
        onClick={() => {
          close();
          newSimulation();
        }}
      >
        Nova simulação <Icon name="refresh" size={18} />
      </button>
      {session.state === "signed-in" && (
        <button
          className="menu-item"
          onClick={() => {
            close();
            setShowHistory(true);
          }}
        >
          Histórico de simulações <Icon name="chevron" size={18} />
        </button>
      )}
      <button
        className="menu-item"
        onClick={() => {
          close();
          navigate("#/grelha");
        }}
      >
        Editor de grelha <Icon name="chevron" size={18} />
      </button>
    </div>
  );

  const stage = (
    <>
      <div className={`maps view-${mapsView}`} style={{ "--split": `${split}%` } as React.CSSProperties}>
        {DECISIONS.map((d) => (
          <MapView
            key={d}
            className={`dec-${d}`}
            title={`Decisão ${d}${decisions[d].length === 0 ? " · deixar arder" : ""}${variants[d] ? ` · variante: ${variants[d]!.name}` : ""}`}
            accent={ACCENT[d]}
            grid={decisionGrids[d]}
            terrainUrl={terrainUrls[d]}
            fire={fireImages[d]}
            showOsm={showOsm}
            showSatellite={showSatellite}
            observed={observedOverlay}
            terrain3d={terrain3d}
            contours={contours}
            ignition={ignition}
            shapes={shapes[d]}
            draft={(tool.type === "draw" && tool.decision === d) || tool.type === "burned" ? draft : null}
            interactive={tool.type !== "none"}
            incidents={showIncidents ? incidents?.incidents : undefined}
            fitBounds={results?.fit ?? null}
            onReady={onReady(d)}
            onClick={onMapClick(d)}
            onDblClick={() => finishDraft()}
            onHover={onMapHover(d)}
            onIncidentClick={igniteAt}
          />
        ))}
        {(mapsView === "split" || mapsView === "swipe") && (
          <div className="divider" style={{ left: `${split}%` }} onPointerDown={dragSplit} onPointerMove={dragSplit} aria-hidden>
            <span>A ‹ › B</span>
          </div>
        )}
      </div>
      <Segmented
        className="maps-switch"
        label="Mapa a mostrar"
        value={mapsView}
        onChange={setMapsView}
        options={[
          { value: "A", label: "A" },
          ...(isWide
            ? [
                { value: "split" as const, label: "A B", title: "Os dois mapas lado a lado" },
                { value: "swipe" as const, label: "A | B", title: "Um mapa, com um divisor a arrastar entre A e B" },
              ]
            : [{ value: "split" as const, label: "A | B" }]),
          { value: "B", label: "B" },
        ]}
      />
      <MapLayers
        badge={showIncidents ? incidents?.incidents.length : undefined}
        before={
          observedFire && (
            <Toggle checked={showObserved} onChange={setShowObserved}>
              Fogo real ({observedFire.fire})
              <small>Perímetros observados, PT-FireSprd (CC BY 4.0)</small>
            </Toggle>
          )
        }
        after={
          <>
            <Toggle checked={showIncidents} onChange={setShowIncidents}>
              Ocorrências ativas (fogos.pt)
              <small>{incidentsLine ?? "Escolher uma ocorrência no mapa para lá pôr a ignição"}</small>
            </Toggle>
            {showIncidents && (
              <button onClick={() => setIncidentsTick((t) => t + 1)}>
                <Icon name="refresh" size={16} /> Atualizar ocorrências
              </button>
            )}
          </>
        }
      />
      <div className={`hover-bar ${hover ? "" : "idle"}`}>
        <CellInspector
          compact
          grid={hover ? decisionGrids[hover.d] : null}
          base={hover && variants[hover.d] ? grid : null}
          cell={hover?.cell ?? null}
          extra={hover ? hoverExtra(hover.cell) : []}
          placeholder={
            window.matchMedia("(pointer: coarse)").matches
              ? "Tocar longamente no mapa para ver o terreno"
              : "Passar o cursor no mapa para ver o terreno"
          }
        />
        {hover && (
          <button className="icon-btn" aria-label="Fechar" onClick={() => setHover(null)}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      {results && (
        <div className="controls">
          <TimeBar
            t={t}
            durationMin={results.durationMin}
            playing={playing}
            disabled={viewMode === "probability"}
            onChange={setT}
            onPlayingChange={setPlaying}
            marks={results.starts}
          />
          <div className="legend-row">
            {(results.A.burnProbability || results.A.intensityKwM) && (
              <Segmented
                label="Mostrar"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: "arrival", label: "Chegada" },
                  ...(results.A.burnProbability ? [{ value: "probability" as const, label: "Cenários" }] : []),
                  ...(results.A.intensityKwM ? [{ value: "intensity" as const, label: "Intensidade" }] : []),
                ]}
              />
            )}
            <Legend mode={viewMode} durationMin={results.durationMin} burnChance={results.burnChance} />
            {observedFire && showObserved && (
              <span className="legend observed-note" title={observedFire.source}>
                <i className="observed-swatch" /> Fogo real observado{" "}
                {(() => {
                  const upTo = viewMode === "probability" ? Infinity : t;
                  const shown = observedFire.features.filter((f) => f.properties.minute <= upTo);
                  return shown.length ? `às ${shown[shown.length - 1].properties.label}` : "(ainda sem observação)";
                })()}
              </span>
            )}
          </div>
        </div>
      )}
      <input
        ref={fileInput}
        className="file-input"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadScenarioFile(f);
          e.target.value = "";
        }}
      />
      {showHistory && (
        <RunHistoryDialog
          isAdmin={session.state === "signed-in" && session.me.isAdmin}
          zoneLabel={(name) => gridIndex.find((g) => g.name === name)?.label ?? name}
          onOpen={(run) => void openRun(run)}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );

  const messageLine = message && (
    <p className="message" role="status">
      <span>{message}</span>
      <button className="icon-btn" aria-label="Fechar a mensagem" onClick={() => setMessage(null)}>
        <Icon name="close" size={16} />
      </button>
    </p>
  );

  // Drawing an action or the burned area. Phones fold the sheet to its footer, which keeps the instruction and the buttons.
  if (drawing || tool.type === "burned") {
    const info = drawing ? TOOLS.find((x) => x.kind === drawing.kind)! : null;
    const line = drawing ? isLineKind(drawing.kind) : false;
    const instruction = `${drawing ? (line ? "Marcar no mapa os pontos da linha" : "Marcar no mapa os cantos da zona") : "Marcar no mapa os cantos da área"} · ${points} ${points === 1 ? "ponto" : "pontos"}`;
    return (
      <Shell
        title={title}
        titleMenu={titleMenu}
        menu={menu}
        stage={stage}
        collapse
        footer={
          <>
            <p className="draw-instruction draw-foot-line" aria-live="polite">
              {drawing ? (
                <>
                  <b>{KIND_LABEL[drawing.kind]}</b> <span className={`tag dec-${drawing.decision}`}>Decisão {drawing.decision}</span>
                </>
              ) : (
                <b>Área já ardida</b>
              )}{" "}
              · {instruction}
            </p>
            {messageLine}
            <div className="draw-buttons">
              <button
                disabled={!points}
                onClick={() => setDraft((d) => (d && d.coords.length > 1 ? { ...d, coords: d.coords.slice(0, -1) } : null))}
              >
                <Icon name="undo" size={18} /> Desfazer
              </button>
              <button onClick={cancelTool}>Cancelar</button>
              <button className="primary" disabled={points < (line ? 2 : 3)} onClick={finishDraft}>
                <Icon name="check" size={18} /> Concluir
              </button>
            </div>
          </>
        }
      >
        <div className="draw">
          {drawing && info ? (
            <p className="draw-title">
              <span className={`action-icon dec-${drawing.decision}`}>
                <Icon name={info.icon} size={18} />
              </span>
              <b>{KIND_LABEL[drawing.kind]}</b>
              <span className={`tag dec-${drawing.decision}`}>Decisão {drawing.decision}</span>
            </p>
          ) : (
            <p className="draw-title">
              <Icon name="flame" size={18} />
              <b>Área já ardida</b>
              <span className="tag tag-both">Decisões A e B</span>
            </p>
          )}
          <p className="draw-instruction" aria-live="polite">
            {instruction}
          </p>
          {info ? (
            <>
              <p>{info.where}</p>
              <details className="disclosure">
                <summary>Como o simulador trata esta ação</summary>
                <p>{info.meaning}</p>
                <p>
                  <b>No simulador:</b> {info.rule}
                </p>
              </details>
            </>
          ) : (
            <p>Aplica-se às duas decisões: o fogo parte de toda esta área no início da simulação, por exemplo um perímetro observado.</p>
          )}
          <p className="hint keys-hint">
            <kbd>Enter</kbd> ou duplo clique para terminar · <kbd>Esc</kbd> para cancelar
          </p>
        </div>
      </Shell>
    );
  }

  const placing = tool.type === "ignite";
  let cta: React.ReactNode;
  if (step === "situacao") {
    cta = placing ? (
      <p className="placing-hint">
        <i aria-hidden /> Marcar o ponto de ignição no mapa
      </p>
    ) : ignitionCell ? (
      <button className="primary" onClick={() => goTo("decisoes")}>
        Seguinte: decisões <Icon name="chevron" size={18} />
      </button>
    ) : (
      <button
        className="primary"
        onClick={() => {
          setDraft(null);
          setTool({ type: "ignite" });
        }}
      >
        <Icon name="flame" size={18} /> Acender o fogo
      </button>
    );
  } else if (results && !stale && !busy) {
    cta =
      step === "resultado" ? (
        <div className="cta-pair">
          <button className="primary secondary" onClick={() => goTo("decisoes")}>
            Alterar decisões
          </button>
          <button className="primary secondary" onClick={newSimulation}>
            <Icon name="refresh" size={18} /> Nova simulação
          </button>
        </div>
      ) : (
        <button className="primary" onClick={() => goTo("resultado")}>
          Ver resultado <Icon name="chevron" size={18} />
        </button>
      );
  } else {
    cta = (
      <button className="primary" disabled={!ignitionCell || busy || !!variantProblem} onClick={() => runSimulation(inputs, { animate: true })}>
        {busy ? "A simular…" : !ignitionCell ? "Falta acender o fogo" : stale ? "Simular de novo" : "Simular"}
      </button>
    );
  }

  // Horizon and uncertainty (scenarios per decision, on the server), in one chip next to the CTA (not beside the result's own two buttons).
  const runSettings = !(step === "resultado" && results && !stale && !busy) && (
    <Popover
      className="run-settings"
      label="Horizonte e incerteza"
      ariaLabel={`Definições da simulação: ${formatMinutes(durationMin)}, ${ensembleOn ? `${ensembleRuns} cenários` : "1 cenário"}`}
      text={`${formatMinutes(durationMin)} · ${ensembleOn ? `${ensembleRuns} cenários` : "1 cenário"}`}
    >
      {() => (
        <div className="menu-body">
          <div>
            <h2 className="field-label">Horizonte</h2>
            <Segmented
              className="horizon"
              label="Horizonte da simulação"
              value={durationMin / 60}
              onChange={(h) => setDurationMin(Math.round(h * 60))}
              options={[...new Set([...HORIZONS, durationMin / 60])].sort((a, b) => a - b).map((h) => ({ value: h, label: formatMinutes(h * 60) }))}
            />
          </div>
          <div className="uncertainty">
            <Toggle checked={ensembleOn} onChange={setEnsemble} disabled={!serverAvailable}>
              Considerar a incerteza
              <small>
                {ensembleOn
                  ? `${ensembleRuns} cenários por decisão, no servidor: vento, humidade, combustível e ignição variam; inclui faúlhas e linhas que podem ceder.`
                  : "Uma simulação por decisão, sem faúlhas."}
              </small>
            </Toggle>
            {ensembleOn && (
              <label className="ensemble-runs">
                Cenários por decisão: {ensembleRuns}
                <input
                  type="range"
                  min={MIN_SERVER_RUNS}
                  max={MAX_SERVER_RUNS}
                  step={50}
                  value={ensembleRuns}
                  onChange={(e) => setEnsembleRuns(Number(e.target.value))}
                />
              </label>
            )}
            {!serverAvailable && <p className="hint">Servidor sem workers disponíveis: a incerteza precisa do servidor.</p>}
          </div>
        </div>
      )}
    </Popover>
  );

  return (
    <Shell
      title={title}
      titleMenu={titleMenu}
      menu={menu}
      stage={stage}
      collapse={false}
      tabs={[
        { id: "situacao", label: "Situação", done: !!ignitionCell, shortcut: "1" },
        { id: "decisoes", label: "Decisões", done: decisions.A.length + decisions.B.length > 0, shortcut: "2" },
        { id: "resultado", label: "Resultado", done: !!results && !stale, shortcut: "3" },
      ]}
      tab={step}
      onTab={goTo}
      footer={
        <>
          {variantProblem && <p className="message">{variantProblem}</p>}
          {messageLine}
          <div className="cta-row">
            {runSettings}
            {cta}
          </div>
        </>
      }
    >
      <div className="step" hidden={step !== "situacao"}>
        <div className="field-row">
          <div>
            <h2 className="field-label">Ignição</h2>
            <p className="value">{ignitionText}</p>
          </div>
          {placing ? (
            <button onClick={cancelTool}>
              Cancelar
            </button>
          ) : (
            ignition && (
              <button
                onClick={() => {
                  setDraft(null);
                  setTool({ type: "ignite" });
                }}
              >
                Mudar
              </button>
            )
          )}
        </div>
        <div className="field-row optional">
          <div>
            <h2 className="field-label">Área já ardida (opcional)</h2>
            <p className="value">{burnedArea ? `Desenhada (${burnedArea.length} cantos)` : "Nenhuma"}</p>
          </div>
          <div className="row">
            {burnedArea && <button onClick={() => setBurnedArea(null)}>Apagar</button>}
            <button
              onClick={() => {
                setDraft(null);
                setTool({ type: "burned" });
              }}
            >
              {burnedArea ? "Redesenhar" : "Desenhar"}
            </button>
          </div>
        </div>
        <p className="hint touch-only">Tocar longamente no mapa para ver o terreno</p>
        <div>
          <h2 className="field-label">Tempo</h2>
          <ConditionsPanel
            weather={weather}
            onRefresh={fetchHere}
            canRefresh={!!grid}
            adjust={
              <>
                <Toggle checked={followForecast && !!weatherSteps} onChange={setFollowForecast} disabled={!snapshot && !fileSteps}>
                  Seguir a previsão hora a hora
                  <small>
                    {snapshot
                      ? forecastChanges > 0
                        ? `O vento muda ${forecastChanges} ${forecastChanges === 1 ? "vez" : "vezes"} em ${formatMinutes(durationMin)} (Open-Meteo)${spreadModel === "rothermel" && moistureFromWeather ? ", e a humidade do combustível também" : ""}`
                        : "A previsão não muda dentro do horizonte"
                      : fileSteps
                        ? `Tempo hora a hora guardado no cenário (${fileSteps.length} passos)`
                        : "Sem previsão (tempo manual)"}
                  </small>
                </Toggle>
                <div>
                  <h3 className="field-label">Secura do combustível</h3>
                  <MoistureControl weather={weather} />
                </div>
              </>
            }
          />
        </div>
      </div>

      <div className="step" hidden={step !== "decisoes"}>
        <Segmented
          className="decision-tabs"
          label="Decisão"
          value={decisionTab}
          onChange={(d) => {
            setDecisionTab(d);
            autoView(d);
          }}
          options={DECISIONS.map((d) => ({
            value: d,
            label: (
              <>
                <b className={`letter dec-${d}`}>{d}</b>
                {decisions[d].length === 0
                  ? "sem ações (deixar arder)"
                  : `${decisions[d].length} ${decisions[d].length === 1 ? "ação" : "ações"}`}
                {variants[d] && " · variante"}
              </>
            ),
          }))}
        />
        <DecisionTools
          key={decisionTab}
          decision={decisionTab}
          items={decisions[decisionTab]}
          variantName={variants[decisionTab]?.name ?? null}
          onPickTool={pickTool(decisionTab)}
          onUpdate={updateIv(decisionTab)}
          onRemove={removeIv(decisionTab)}
          onRestore={(item, i) =>
            setDecisions((prev) => {
              const l = [...prev[decisionTab]];
              l.splice(i, 0, item);
              return { ...prev, [decisionTab]: l };
            })
          }
          onClear={() => setDecisions((prev) => ({ ...prev, [decisionTab]: [] }))}
          defaultLineWidthM={spreadModel === "rothermel" ? (variants[decisionTab]?.params.lineWidthM ?? DEFAULT_PARAMS.lineWidthM) : undefined}
        >
          <label className="field">
            <span className="field-label">Grelha da decisão {decisionTab}</span>
            <select
              value={variantIds[decisionTab] ?? ""}
              onChange={(e) => setVariantIds((prev) => ({ ...prev, [decisionTab]: e.target.value || null }))}
            >
              <option value="">Oficial</option>
              {gridVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  Variante: {v.name}
                </option>
              ))}
            </select>
          </label>
        </DecisionTools>
      </div>

      <div className="step" hidden={step !== "resultado"}>
        {results ? (
          <>
            {stale && <p className="stale-banner">Mudou desde a última simulação: estes números são da anterior.</p>}
            <ComparisonPanel
              a={results.A.metrics}
              b={results.B.metrics}
              durationMin={results.durationMin}
              likelyHa={results.likelyHa}
              likelyIsExpected={results.burnChance}
              paired={results.paired}
              stale={stale}
              actions={{ A: decisions.A.length, B: decisions.B.length }}
              note={runNote ?? undefined}
              onPlace={results.explain ? (id) => setExplainAt(firstReachedCell(id)) : undefined}
            />
            {explanation}
            {results.explain && !explanation && (
              <p className="hint">Toca num ponto do mapa, ou num lugar da tabela, para ver por onde e porque o fogo lá chega.</p>
            )}
          </>
        ) : (
          <p className="hint">Ainda sem resultado: acender o fogo, escolher as decisões e simular.</p>
        )}
      </div>
    </Shell>
  );
}
