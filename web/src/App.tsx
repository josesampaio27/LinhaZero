import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import {
  applyVariant,
  buildScenario,
  cellAt,
  checkVariantBase,
  comparePaired,
  DEFAULT_ENSEMBLE,
  nearestBurnable,
  DEFAULT_MOISTURE,
  DEFAULT_PARAMS,
  flameLength,
  variantHash,
  type DecisionId,
  type DrawnIntervention,
  type GridData,
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
import { DecisionTools, TOOLS } from "./components/DecisionTools";
import { Legend } from "./components/Legend";
import { MapView, type Draft, type MapShape } from "./components/MapView";
import { Icon } from "./components/Icon";
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
import { isLineKind, KIND_LABEL, newId } from "./lib/scenario";
import { ApiError } from "./lib/api";
import { forecastSteps } from "./lib/weather-steps";
import { runOnServer, SERVER_ENSEMBLE, workersAvailable } from "./lib/server-run";
import { SimClient } from "./lib/sim-client";
import { syncMaps } from "./lib/sync-maps";
import { newVariantId, useVariants, variantStore } from "./lib/variants";
import { useLiveWeather } from "./lib/useLiveWeather";
import { ageText, fetchIncidents } from "./lib/weather";
import type { IncidentsResponse } from "./api/client";

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
}

type ViewMode = "arrival" | "probability" | "intensity";

type Step = "situacao" | "decisoes" | "resultado";

/** Phones show one map at a time: A, B, or both split by a draggable divider. Desktop always shows both side by side. */
type MapsView = "A" | "B" | "split";

const HORIZONS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Where an ensemble runs: in the browser (30 runs) or on the engine workers (200 runs). Not saved with scenarios. */
type EnsembleWhere = "browser" | "server";

/** Inputs of one simulation, captured explicitly so a freshly loaded scenario can run before React re-renders. */
type SimInputs = ScenarioInputs & { ensembleWhere: EnsembleWhere };

const inputKeyOf = (gridName: string, i: SimInputs) =>
  JSON.stringify({
    gridName,
    ignition: i.ignition,
    wind: i.wind,
    durationMin: i.durationMin,
    ensemble: i.ensemble,
    ensembleWhere: i.ensemble ? i.ensembleWhere : null, // only matters when an ensemble runs
    decisions: i.decisions,
    variants: { A: i.variants.A && variantHash(i.variants.A), B: i.variants.B && variantHash(i.variants.B) },
    // Absent means the default, as in the engine (a file may omit it).
    moisture: i.moisture ?? DEFAULT_MOISTURE,
    weatherSteps: i.weatherSteps ?? null,
    burnedArea: i.burnedArea ?? null,
  });

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
  const [mapsView, setMapsView] = useState<MapsView>("A");
  const [split, setSplit] = useState(50); // divider position, % of the map width
  // Read by a run that lands later: it must not switch step or view under someone drawing.
  const drawingRef = useRef(false);
  drawingRef.current = tool.type === "draw" || tool.type === "burned";
  const [draft, setDraft] = useState<SimDraft | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showOsm, setShowOsm] = useState(true);
  // Replays of real fires: the observed perimeters, drawn over the simulation up to the time shown.
  const [observedFire, setObservedFire] = useState<ObservedFire | null>(null);
  const [showObserved, setShowObserved] = useState(true);
  const [terrain3d, setTerrain3d] = useState(true);
  const [contours, setContours] = useState(true);
  const [ensemble, setEnsemble] = useState(false);
  const [ensembleWhere, setEnsembleWhere] = useState<EnsembleWhere>("browser");
  // Last health check: when it ran and whether a worker was idle then.
  const [health, setHealth] = useState<{ at: number; idle: boolean } | null>(null);
  const [lastWorkerSeen, setLastWorkerSeen] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("arrival");
  const [scenarioIndex, setScenarioIndex] = useState<GridIndexEntry[]>([]);
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [pending, setPending] = useState<SavedScenario | null>(null);
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
    setMessage(`A decisão A corre na grelha oficial e a B na variante "${v.name}", com o mesmo fogo e o mesmo vento. Acende o fogo e simula.`);
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
    const of = (items: DrawnIntervention[]): MapShape[] => items.map((iv) => ({ kind: iv.kind, line: isLineKind(iv.kind), coords: iv.coords }));
    const burned: MapShape[] = burnedArea ? [{ kind: "burned", line: false, coords: burnedArea }] : [];
    return { A: [...burned, ...of(decisions.A)], B: [...burned, ...of(decisions.B)] };
  }, [decisions, burnedArea]);

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
    const item: DrawnIntervention = { id: newId(), kind: draft.kind as InterventionKind, startMin: 0, coords };
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
      // Enter on a focused control does what that control does.
      if (e.key === "Enter" && !(e.target instanceof Element && e.target.closest("button, input, select, textarea"))) finishDraft();
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
      setMessage("Não há combustível a menos de 200 m deste ponto (zona urbana, água). Escolhe outro ponto.");
      return;
    }
    const moved = target.row !== cell.row || target.col !== cell.col;
    const { cellSize, originX, originY } = grid.header;
    const point: [number, number] = moved
      ? [Math.round(originX + (target.col + 0.5) * cellSize), Math.round(originY - (target.row + 0.5) * cellSize)]
      : [x, y];
    setMessage(
      moved
        ? `O ponto escolhido não arde (estrada, rio ou zona sem combustível): a ignição passou para a célula com combustível mais próxima, a ${Math.round(Math.hypot(target.row - cell.row, target.col - cell.col) * cellSize)} m.`
        : null,
    );
    setIgnition(point);
    fetchAt(projectedToLngLat(point[0], point[1]), "ignition");
    setTool({ type: "none" });
  };

  const onMapClick = (d: DecisionId) => (lngLat: LngLat) => {
    if (!grid) return;
    if (tool.type === "ignite") {
      igniteAt(lngLat);
    } else if (tool.type === "burned") {
      const xy = lngLatToProjected(lngLat[0], lngLat[1]);
      setDraft((prev) => ({ kind: "burned", line: false, coords: [...(prev?.coords ?? []), xy] }));
    } else if (tool.type === "draw") {
      if (d !== tool.decision) {
        setMessage(`Desenha no mapa da Decisão ${tool.decision}.`);
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
    setMapsView(decision);
  };

  const updateIv = (d: DecisionId) => (id: string, patch: Partial<DrawnIntervention>) =>
    setDecisions((prev) => ({ ...prev, [d]: prev[d].map((iv) => (iv.id === id ? { ...iv, ...patch } : iv)) }));
  const removeIv = (d: DecisionId) => (id: string) =>
    setDecisions((prev) => ({ ...prev, [d]: prev[d].filter((iv) => iv.id !== id) }));

  // --- Server health (only while the "where" select is shown, plus once on load) ---
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      workersAvailable().then((idle) => {
        if (cancelled) return;
        setHealth({ at: Date.now(), idle });
        if (idle) setLastWorkerSeen(Date.now());
      });
    void check();
    if (!ensemble) return;
    const timer = setInterval(() => void check(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ensemble]);
  const serverAvailable = health !== null && Date.now() - lastWorkerSeen < WORKER_WINDOW_MS;
  // The option silently drops back to the browser when no worker has been seen lately.
  const where: EnsembleWhere = ensembleWhere === "server" && serverAvailable ? "server" : "browser";
  const ensembleRuns = where === "server" ? SERVER_ENSEMBLE.runs : DEFAULT_ENSEMBLE.runs;

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
    ensemble,
    ensembleWhere: where,
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
        const onServer = inputs.ensemble && inputs.ensembleWhere === "server";
        let fallbackNote = `Servidor indisponível; a simular no dispositivo (${DEFAULT_ENSEMBLE.runs} corridas).`;
        const server = onServer
          ? await runOnServer(
              header,
              {
                grid: bundle.name,
                ignition: scenarios.A.ignition,
                wind: inputs.wind,
                durationMin: inputs.durationMin,
                ensemble: SERVER_ENSEMBLE,
                decisions: { A: scenarios.A.interventions, B: scenarios.B.interventions },
                variants: inputs.variants.A || inputs.variants.B ? inputs.variants : undefined,
                weather: provenance,
                ...(inputs.spreadModel === "rothermel" && { spreadModel: "rothermel" as const, moisture: inputs.moisture }),
                ...(inputs.weatherSteps?.length && { weatherSteps: inputs.weatherSteps }),
                ...(scenarios.A.ignitions && { ignitions: scenarios.A.ignitions }),
              },
              (n) => current() && setMessage(`A simular no servidor: ${n}/2`),
            ).catch((e: unknown) => {
              console.warn("servidor indisponível, a simular no browser", e);
              if (e instanceof ApiError && e.status === 400) fallbackNote = `Pedido inválido: ${e.message}; a simular no dispositivo (${DEFAULT_ENSEMBLE.runs} corridas).`;
              return null;
            })
          : null;
        if (!current()) return;
        if (server) {
          ({ A, B } = server);
          done = `Simulação no servidor: 2×(${SERVER_ENSEMBLE.runs}+1) corridas em ${server.elapsedMs.toLocaleString("pt-PT")} ms.`;
        } else {
          const jobs = DECISIONS.map((d) => ({ scenario: scenarios[d], variant: inputs.variants[d] }));
          const { results: res, elapsedMs } = await sim.simulate(jobs);
          [A, B] = res;
          const runs = inputs.ensemble ? ` (2×(${DEFAULT_ENSEMBLE.runs}+1) corridas)` : "";
          done = `Simulação das duas decisões feita em ${elapsedMs.toFixed(0)} ms${runs}.`;
          if (onServer) done = `${fallbackNote} ${done}`;
        }
        if (!current()) return;
        // Rothermel: the ensemble checked against real fires; the share of runs that burn each cell is the
        // probability of burning with no firefighting other than what was drawn (ADR 0057).
        const chance = inputs.spreadModel === "rothermel" && !!A.burnProbability && !!B.burnProbability;
        setResults({
          A,
          B,
          burnChance: chance,
          durationMin: inputs.durationMin,
          key: inputKeyOf(bundle.name, inputs),
          starts: DECISIONS.flatMap((d) => inputs.decisions[d].map((iv) => ({ min: iv.startMin, className: `dec-${d}` }))),
          likelyHa: A.burnProbability && {
            a: chance ? expectedHa(A.burnProbability, header.cellSize) : hectaresAbove(A.burnProbability, 0.5, header.cellSize),
            b: chance ? expectedHa(B.burnProbability!, header.cellSize) : hectaresAbove(B.burnProbability, 0.5, header.cellSize),
          },
          paired: A.runs &&
            B.runs && {
              buildings: comparePaired(A.runs, B.runs, "buildingsReached"),
              ha: comparePaired(A.runs, B.runs, "burnedHa"),
            },
        });
        setViewMode(inputs.ensemble ? "probability" : "arrival");
        // A fallback to the browser is worth noticing: it goes to the message, not to the quiet note.
        setRunNote(onServer && !server ? null : done);
        setMessage(onServer && !server ? done : null);
        if (!drawingRef.current) {
          setStep("resultado");
          setMapsView("split");
        }
        if (opts.animate && !inputs.ensemble) {
          setT(0);
          setPlaying(true);
        } else setT(inputs.durationMin);
      } catch (e) {
        if (current()) setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        if (current()) setBusy(false);
      }
    },
    [bundle, sim, provenance],
  );

  // --- Scenarios ---
  const applyScenario = useCallback((saved: SavedScenario) => {
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
    setDecisions(saved.decisions);
    setVariantIds({ A: variants.A?.id ?? null, B: variants.B?.id ?? null });
    setScenarioTitle(saved.title ?? null);
    setStep("situacao");
    setPending({ ...saved, variants });
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

  // Once the scenario's grid is loaded, run it straight away so the comparison is ready.
  useEffect(() => {
    if (!pending || !bundle || bundle.name !== pending.grid) return;
    setPending(null);
    // The scenario's inputs are passed explicitly: React has not re-rendered with them yet.
    if (pending.ignition) void runSimulation({ ...pending, ensembleWhere: where }, { animate: false });
  }, [pending, bundle, runSimulation, where]);

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
    const saved: SavedScenario = {
      version: 3,
      title: scenarioTitle ?? undefined,
      grid: gridName,
      ignition,
      wind,
      durationMin,
      ensemble,
      decisions,
      variants,
      ...(spreadModel === "rothermel" && { spreadModel, moisture }),
      ...(weatherSteps?.length && { weatherSteps }),
      ...(burnedArea && { burnedArea }),
      // Where the wind came from, only while nobody changed it by hand.
      weather: provenance,
    };
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
        return I > 0 ? `${Math.round(I).toLocaleString("pt-PT")} kW/m (chamas ${flameLength(I).toFixed(1)} m)` : "—";
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
      decisions.A.length + decisions.B.length > 0 &&
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
    setMapsView("A");
    // Live weather again, at the zone's centre until a new ignition asks for its own point.
    weather.resetAll();
    if (grid) fetchAt(gridToLngLat(grid.header, grid.header.cols / 2, grid.header.rows / 2), "centre");
    setStep("situacao");
    setTool({ type: "ignite" });
  };

  const changeGrid = (name: string) => {
    if (name === gridName) return;
    const lost = variantIds.A || variantIds.B;
    setGridName(name);
    setVariantIds(NO_VARIANTS);
    setScenarioTitle(null); // the app bar then names the zone
    setMessage(lost ? "Zona mudada: as variantes deixaram de se aplicar." : null);
  };

  const places = useMemo(() => (grid ? placeStats(grid) : []), [grid]);
  const ignitionText =
    tool.type === "ignite"
      ? "Toca no mapa para pôr a ignição."
      : ignitionCell && grid
        ? (describeCell(grid, places, ignitionCell.row, ignitionCell.col) ?? "Ignição colocada.")
        : ignition
          ? grid
            ? "A ignição está fora desta zona. Acende o fogo noutro ponto."
            : "A carregar a zona…"
          : "Sem ignição.";

  const stale = !!results && results.key !== inputKey;
  const goTo = (s: Step) => {
    setStep(s);
    if (s === "decisoes") setMapsView(decisionTab);
    if (s === "resultado" && results) setMapsView("split");
  };

  const dragSplit = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.parentElement!.getBoundingClientRect();
    setSplit(Math.min(95, Math.max(5, ((e.clientX - r.left) / r.width) * 100)));
  };

  const drawing = tool.type === "draw" ? tool : null;
  const points = draft?.coords.length ?? 0;

  const menu = (close: () => void) => (
    <div className="menu-body">
      {scenarioIndex.length > 0 && <p className="field-label">Cenários de demonstração</p>}
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
            saveScenario();
          }}
        >
          Guardar ficheiro
        </button>
        <button
          onClick={() => {
            close();
            fileInput.current?.click();
          }}
        >
          Abrir ficheiro
        </button>
      </div>
      <label className="field">
        <span className="field-label">Zona</span>
        <select value={gridName} onChange={(e) => changeGrid(e.target.value)}>
          {gridIndex.map((g) => (
            <option key={g.name} value={g.name}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
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
            title={`Decisão ${d}${variants[d] ? ` · variante: ${variants[d]!.name}` : ""}`}
            accent={ACCENT[d]}
            grid={decisionGrids[d]}
            terrainUrl={terrainUrls[d]}
            fire={fireImages[d]}
            showOsm={showOsm}
            observed={observedOverlay}
            terrain3d={terrain3d}
            contours={contours}
            ignition={ignition}
            shapes={shapes[d]}
            draft={(tool.type === "draw" && tool.decision === d) || tool.type === "burned" ? draft : null}
            interactive={tool.type !== "none"}
            incidents={showIncidents ? incidents?.incidents : undefined}
            onReady={onReady(d)}
            onClick={onMapClick(d)}
            onDblClick={() => finishDraft()}
            onHover={onMapHover(d)}
            onIncidentClick={igniteAt}
          />
        ))}
        {mapsView === "split" && (
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
          { value: "split", label: "A | B" },
          { value: "B", label: "B" },
        ]}
      />
      <Popover className="layers" icon="layers" label="Camadas" badge={showIncidents ? incidents?.incidents.length : undefined}>
        {() => (
          <div className="menu-body">
            {observedFire && (
              <Toggle checked={showObserved} onChange={setShowObserved}>
                Fogo real ({observedFire.fire})
                <small>Perímetros observados, PT-FireSprd (CC BY 4.0)</small>
              </Toggle>
            )}
            <Toggle checked={showOsm} onChange={setShowOsm}>
              Mapa de ruas (OpenStreetMap)
              <small>Precisa de internet</small>
            </Toggle>
            <Toggle checked={contours} onChange={setContours}>
              Curvas de nível
              <small>Mais grossa a cada 5 curvas; a altitude aparece ao passar ou tocar longamente no mapa</small>
            </Toggle>
            <Toggle checked={terrain3d} onChange={setTerrain3d}>
              Relevo 3D
              <small>Inclinar: dois dedos, ou arrastar com o botão direito do rato</small>
            </Toggle>
            <Toggle checked={showIncidents} onChange={setShowIncidents}>
              Ocorrências ativas (fogos.pt)
              <small>{incidentsLine ?? "Toca numa ocorrência para pôr lá a ignição"}</small>
            </Toggle>
            {showIncidents && (
              <button onClick={() => setIncidentsTick((t) => t + 1)}>
                <Icon name="refresh" size={16} /> Atualizar ocorrências
              </button>
            )}
          </div>
        )}
      </Popover>
      <div className={`hover-bar ${hover ? "" : "idle"}`}>
        <CellInspector
          compact
          grid={hover ? decisionGrids[hover.d] : null}
          base={hover && variants[hover.d] ? grid : null}
          cell={hover?.cell ?? null}
          extra={hover ? hoverExtra(hover.cell) : []}
          placeholder="Passa o rato sobre um mapa para ver o combustível e a chegada do fogo em cada ponto."
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

  if (drawing) {
    const info = TOOLS.find((x) => x.kind === drawing.kind)!;
    const line = isLineKind(drawing.kind);
    return (
      <Shell
        title={scenarioTitle ?? gridIndex.find((g) => g.name === gridName)?.label ?? ""}
        menu={menu}
        stage={stage}
        footer={
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
        }
      >
        <div className="draw">
          <p className="draw-title">
            <span className={`action-icon dec-${drawing.decision}`}>
              <Icon name={info.icon} size={18} />
            </span>
            <b>{KIND_LABEL[drawing.kind]}</b>
            <span className={`tag dec-${drawing.decision}`}>Decisão {drawing.decision}</span>
          </p>
          <p>{spreadModel === "rothermel" ? info.rothermelEffect : info.effect}.</p>
          <p className="hint">
            {line ? "Toca no mapa para marcar os pontos da linha" : "Toca no mapa para marcar os cantos da zona"} ({points}{" "}
            {points === 1 ? "ponto" : "pontos"}). No computador: duplo clique ou Enter para terminar, Esc para cancelar.
          </p>
          {messageLine}
        </div>
      </Shell>
    );
  }

  if (tool.type === "burned") {
    return (
      <Shell
        title={scenarioTitle ?? gridIndex.find((g) => g.name === gridName)?.label ?? ""}
        menu={menu}
        stage={stage}
        footer={
          <div className="draw-buttons">
            <button
              disabled={!points}
              onClick={() => setDraft((d) => (d && d.coords.length > 1 ? { ...d, coords: d.coords.slice(0, -1) } : null))}
            >
              <Icon name="undo" size={18} /> Desfazer
            </button>
            <button onClick={cancelTool}>Cancelar</button>
            <button className="primary" disabled={points < 3} onClick={finishDraft}>
              <Icon name="check" size={18} /> Concluir
            </button>
          </div>
        }
      >
        <div className="draw">
          <p className="draw-title">
            <Icon name="flame" size={18} />
            <b>Área já ardida</b>
          </p>
          <p>O fogo parte de toda esta área no início da simulação, por exemplo um perímetro observado.</p>
          <p className="hint">
            Toca no mapa para marcar os cantos da área ({points} {points === 1 ? "ponto" : "pontos"}). No computador: duplo clique ou
            Enter para terminar, Esc para cancelar.
          </p>
          {messageLine}
        </div>
      </Shell>
    );
  }

  let cta: React.ReactNode;
  if (step === "situacao") {
    cta = ignitionCell ? (
      <button className="primary" onClick={() => goTo("decisoes")}>
        Seguinte: decisões <Icon name="chevron" size={18} />
      </button>
    ) : (
      <button className="primary" disabled={tool.type === "ignite"} onClick={() => setTool({ type: "ignite" })}>
        {tool.type === "ignite" ? "Toca no mapa para acender o fogo" : "Acender o fogo"}
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

  return (
    <Shell
      title={scenarioTitle ?? gridIndex.find((g) => g.name === gridName)?.label ?? ""}
      menu={menu}
      stage={stage}
      tabs={[
        { id: "situacao", label: "Situação", done: !!ignitionCell },
        { id: "decisoes", label: "Decisões", done: decisions.A.length + decisions.B.length > 0 },
        { id: "resultado", label: "Resultado", done: !!results && !stale },
      ]}
      tab={step}
      onTab={goTo}
      footer={
        <>
          {variantProblem && <p className="message">{variantProblem}</p>}
          {messageLine}
          {cta}
        </>
      }
    >
      <div className="step" hidden={step !== "situacao"}>
        <div className="field-row">
          <div>
            <p className="field-label">Ignição</p>
            <p className="value">{ignitionText}</p>
          </div>
          {!(tool.type === "ignite" && !ignition) && (
            <button
              className={tool.type === "ignite" ? "active" : ""}
              onClick={() => {
                setDraft(null);
                setTool(tool.type === "ignite" ? { type: "none" } : { type: "ignite" });
              }}
            >
              {tool.type === "ignite" ? (
                "Cancelar"
              ) : ignition ? (
                "Mudar"
              ) : (
                <>
                  <Icon name="flame" size={18} /> Acender fogo
                </>
              )}
            </button>
          )}
        </div>
        <div className="field-row">
          <div>
            <p className="field-label">Área já ardida</p>
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
        <div>
          <p className="field-label">Tempo</p>
          <ConditionsPanel weather={weather} onRefresh={fetchHere} canRefresh={!!grid} />
        </div>
        <div>
          <p className="field-label">Horizonte</p>
          <Segmented
            className="horizon"
            label="Horizonte da simulação"
            value={durationMin / 60}
            onChange={(h) => setDurationMin(Math.round(h * 60))}
            options={[...new Set([...HORIZONS, durationMin / 60])].sort((a, b) => a - b).map((h) => ({ value: h, label: formatMinutes(h * 60) }))}
          />
        </div>
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
          <p className="field-label">Secura do combustível</p>
          <MoistureControl weather={weather} />
        </div>
        <p className="hint">Toca e segura no mapa (ou passa o rato) para ver o terreno e a chegada do fogo num ponto.</p>
      </div>

      <div className="step" hidden={step !== "decisoes"}>
        <Segmented
          className="decision-tabs"
          label="Decisão"
          value={decisionTab}
          onChange={(d) => {
            setDecisionTab(d);
            setMapsView(d);
          }}
          options={DECISIONS.map((d) => ({
            value: d,
            label: (
              <>
                <b className={`letter dec-${d}`}>{d}</b>
                {decisions[d].length} {decisions[d].length === 1 ? "ação" : "ações"}
                {variants[d] && " · variante"}
              </>
            ),
          }))}
        />
        <DecisionTools
          key={decisionTab}
          decision={decisionTab}
          items={decisions[decisionTab]}
          onPickTool={pickTool(decisionTab)}
          onUpdate={updateIv(decisionTab)}
          onRemove={removeIv(decisionTab)}
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
        <div className="uncertainty">
          <Toggle checked={ensemble} onChange={setEnsemble}>
            Considerar a incerteza do vento
            <small>
              {ensemble
                ? `${ensembleRuns} cenários por decisão, com o vento, a humidade, a velocidade do combustível e o ponto de ignição a variar; incluem focos secundários e linhas e estradas que podem ceder`
                : "Uma só corrida por decisão"}
            </small>
          </Toggle>
          {ensemble && (
            <Segmented
              label="Onde simular"
              value={where}
              onChange={setEnsembleWhere}
              options={[
                { value: "browser", label: `No dispositivo · ${DEFAULT_ENSEMBLE.runs}` },
                {
                  value: "server",
                  label: `No servidor · ${SERVER_ENSEMBLE.runs}`,
                  disabled: !serverAvailable,
                  title: serverAvailable ? "Workers do motor disponíveis" : "Sem workers disponíveis (npm run up)",
                },
              ]}
            />
          )}
          {ensemble && !serverAvailable && <p className="hint">Servidor sem workers disponíveis: corre no dispositivo.</p>}
        </div>
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
            />
            {runNote && <p className="hint">{runNote}</p>}
          </>
        ) : (
          <p className="hint">Ainda não há resultado. Acende o fogo, escolhe as decisões e carrega em Simular.</p>
        )}
      </div>
    </Shell>
  );
}
