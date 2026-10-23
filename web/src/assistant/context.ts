// What the assistant sees of the app and what it may do to it (docs/decisoes/0079). App.tsx fills both on every render
// through a ref, so a tool that runs across several renders always reads the current state.
import type {
  DecisionId,
  DrawnIntervention,
  FireExplain,
  GridData,
  PairedComparison,
  ProjectedPoint,
  SimulationResult,
  Wind,
} from "@linha-zero/engine";
import type { PlaceStats } from "../lib/places";
import type { WindChange } from "./explain";

/** The latest simulation, as App.tsx keeps it (a structural subset of its Results). */
export interface AssistantResults {
  A: SimulationResult;
  B: SimulationResult;
  durationMin: number;
  likelyHa?: { a: number; b: number };
  burnChance?: boolean;
  paired?: { buildings: PairedComparison; ha: PairedComparison };
  explain?: Record<DecisionId, { explain: FireExplain; arrivalMin: Float32Array }>;
}

export interface AssistantSnapshot {
  grid: GridData | null;
  /** The grid each decision runs on (the official one or its variant). */
  decisionGrids: Record<DecisionId, GridData | null>;
  zone: string;
  places: PlaceStats[];
  step: "situacao" | "decisoes" | "resultado";
  ignition: ProjectedPoint | null;
  burnedArea: boolean;
  wind: Wind;
  air: { tempC: number; rhPct: number } | null;
  /** "do tempo", "seca", "manual"…: how the fuel moisture is set. */
  moisture: string;
  /** Where the wind and air values come from, as the conditions panel says it. */
  weatherSource: string;
  /** The values set by hand (direction, speed, temperature…), which the live weather does not overwrite. */
  manual: string[];
  /** Hour-by-hour weather steps the run follows, 0 when the weather is constant. */
  weatherSteps: number;
  durationMin: number;
  decisions: Record<DecisionId, DrawnIntervention[]>;
  variants: Record<DecisionId, string | null>;
  ensembleOn: boolean;
  ensembleRuns: number;
  serverAvailable: boolean;
  results: AssistantResults | null;
  /** The setup changed since the results were computed. */
  stale: boolean;
  busy: boolean;
  /** The time bar, in minutes from the ignition. */
  t: number;
  /** The cell whose fire path is open on the result, if any. */
  explainAt: number | null;
  /** Ids of the actions the assistant placed. */
  assistantIds: ReadonlySet<string>;
}

/** A deterministic run of one decision, recording how the fire reached each cell. */
export interface FireRun {
  arrivalMin: Float32Array;
  explain: FireExplain;
  /** Fireline intensity (kW/m) as the fire reached each cell; 0 = not burned. */
  intensityKwM: Float32Array;
}

export interface AssistantActions {
  /** Adds an action placed by the assistant (marked as such on the map and in the list). */
  addIntervention(decision: DecisionId, item: DrawnIntervention): void;
  updateIntervention(decision: DecisionId, id: string, patch: Partial<DrawnIntervention>): void;
  removeIntervention(decision: DecisionId, id: string): void;
  /** Replaces every action of a decision (copy, clear, undo). */
  setDecision(decision: DecisionId, items: DrawnIntervention[]): void;
  setWind(wind: Wind): void;
  setDuration(min: number): void;
  /** Moves the ignition to the nearest burnable cell of a point; returns an error message, or null. */
  setIgnition(point: ProjectedPoint): string | null;
  /** Runs A and B with the current setup (as the "Simular" button); null when it could not run, with the reason. */
  runSimulation(): Promise<{ results: AssistantResults | null; error: string | null }>;
  /** One run of a decision with the given actions, without random draws, to see where the fire goes; `wind` changes every wind alike (what-ifs). */
  fireRun(decision: DecisionId, items: DrawnIntervention[], opts?: { wind?: WindChange }): Promise<FireRun>;
  /** Opens the fire path of a cell on the result (null closes it) and moves both maps to these points. */
  show(cell: number | null, points: ProjectedPoint[]): void;
}

export interface AssistantContext {
  snapshot: AssistantSnapshot;
  actions: AssistantActions;
}
