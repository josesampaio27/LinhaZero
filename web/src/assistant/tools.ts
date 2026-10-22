// The assistant's tools, run in the browser where the app state lives (docs/decisoes/0079). Their definitions (names,
// descriptions, input schemas) are the server's: backend/src/LinhaZero.Api/Assistant/tools.json, which a test keeps
// in step with TOOL_NAMES. Every input is checked here again: the schema allows no ranges.
import {
  AERIAL_DEFAULT_MIN,
  explainPath,
  projectedToGrid,
  toEngineIntervention,
  type DecisionId,
  type DrawnIntervention,
  type InterventionKind,
} from "@linha-zero/engine";
import { formatMinutes } from "../components/TimeBar";
import { describeCell } from "../lib/places";
import { isLineKind, KIND_LABEL, newId } from "../lib/scenario";
import type { AssistantContext, AssistantSnapshot } from "./context";
import { fromIgnition, resultLines, stateDigest, threatenedPlaces } from "./digest";
import { checkPlan } from "./plan-check";
import { cellCentre, gridPoint, normalize, placeCells, resolvePlace, type NamedPlace } from "./places";
import { buildShape, type ShapeName } from "./shapes";

export const TOOL_NAMES = [
  "get_state",
  "get_results",
  "explain_place",
  "find_places",
  "show_place",
  "check_plan",
  "place_intervention",
  "update_intervention",
  "remove_intervention",
  "copy_decision",
  "clear_decision",
  "set_conditions",
  "run_simulation",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Tools that change the app: the panel offers "Desfazer" after a turn that used one. */
export const CHANGING_TOOLS = new Set<string>([
  "place_intervention",
  "update_intervention",
  "remove_intervention",
  "copy_decision",
  "clear_decision",
  "set_conditions",
]);

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

type Input = Record<string, unknown>;

/** A bad input, reported to the model as a tool error it can correct. */
class InputError extends Error {}

const DECISIONS: DecisionId[] = ["A", "B"];
const KINDS: InterventionKind[] = ["containmentLine", "suppression", "protectZone", "aerialDrop", "backfire"];
const SHAPES: ShapeName[] = ["across_path", "fire_head", "around_place", "between_places"];

function text(input: Input, key: string, required: true): string;
function text(input: Input, key: string, required?: false): string | undefined;
function text(input: Input, key: string, required = false): string | undefined {
  const v = input[key];
  if (v === undefined || v === null) {
    if (required) throw new InputError(`Falta ${key}.`);
    return undefined;
  }
  if (typeof v !== "string") throw new InputError(`${key} tem de ser texto.`);
  return v;
}

function number(input: Input, key: string, lo: number, hi: number): number | undefined {
  const v = input[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new InputError(`${key} tem de ser um número.`);
  if (v < lo || v > hi) throw new InputError(`${key} tem de estar entre ${lo} e ${hi}.`);
  return v;
}

function oneOf<T extends string>(input: Input, key: string, values: readonly T[]): T {
  const v = input[key];
  if (typeof v !== "string" || !(values as readonly string[]).includes(v)) throw new InputError(`${key} tem de ser um de: ${values.join(", ")}.`);
  return v as T;
}

function place(s: AssistantSnapshot, name: string): NamedPlace {
  if (!s.grid) throw new InputError("A zona ainda está a carregar.");
  const found = resolvePlace(name, s.places, s.grid.header, s.ignition);
  if ("error" in found) throw new InputError(found.error);
  return found.place;
}

/** The cell of a place the fire reaches first in a decision's latest run; null if it does not reach it. */
function firstReached(s: AssistantSnapshot, p: NamedPlace, d: DecisionId): number | null {
  if (!s.grid || !s.results) return null;
  let best: number | null = null;
  let at = Infinity;
  for (const c of placeCells(s.grid, p)) {
    const t = s.results[d].arrivalMin[c];
    if (t < at) [best, at] = [c, t];
  }
  return best !== null && at <= s.results.durationMin ? best : null;
}

const arrivalAt = (s: AssistantSnapshot, p: NamedPlace, d: DecisionId) => {
  const c = firstReached(s, p, d);
  return c === null ? "não chega" : formatMinutes(s.results![d].arrivalMin[c]);
};

function needResults(s: AssistantSnapshot) {
  if (!s.results) throw new InputError("Ainda não há resultados: usar run_simulation primeiro.");
  return s.results;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

const handlers: Record<ToolName, (input: Input, context: () => AssistantContext) => Promise<string>> = {
  async get_state(_input, context) {
    return stateDigest(context().snapshot);
  },

  async get_results(_input, context) {
    const s = context().snapshot;
    const r = needResults(s);
    const lines = resultLines(s);
    for (const d of DECISIONS) {
      const byHour = r[d].metrics.burnedHaByHour.map((h) => Math.round(h).toLocaleString("pt-PT")).join(", ");
      lines.push(`Área ardida em ${d}, hora a hora (ha): ${byHour}.`);
    }
    const places = threatenedPlaces(s, 40);
    lines.push(places.length ? "Minuto em que o fogo chega a cada lugar, em A e em B:" : "O fogo não chega a nenhum lugar com casas.", ...places);
    return lines.join("\n");
  },

  async explain_place(input, context) {
    const s = context().snapshot;
    const p = place(s, text(input, "place", true));
    const d = oneOf(input, "decision", DECISIONS);
    const r = needResults(s);
    const ex = r.explain?.[d];
    const grid = s.decisionGrids[d];
    if (!ex || !grid) throw new InputError("Esta simulação não guardou o caminho do fogo: correr run_simulation outra vez.");
    const cell = firstReached(s, p, d);
    if (cell === null) return `Na decisão ${d} o fogo não chega a ${p.name} em ${formatMinutes(r.durationMin)}.`;
    const e = explainPath(grid, ex.explain, ex.arrivalMin, cell);
    if (!e) return `${p.name} arde desde o início (está na ignição ou na área já ardida).`;
    const { cols } = grid.header;
    // The path as the places it passes near, in order.
    const along: string[] = [];
    for (const k of [0.25, 0.5, 0.75]) {
      const c = e.cells[Math.floor(k * (e.cells.length - 1))];
      const where = describeCell(grid, s.places, Math.floor(c / cols), c % cols)?.toLowerCase();
      if (where && !along.includes(where)) along.push(where);
    }
    const fuels = e.fuels
      .slice(0, 3)
      .map((f) => `${grid.header.fuelTable?.[f.code]?.label ?? `combustível ${f.code}`} ${pct(f.share)}`)
      .join(", ");
    return [
      `Decisão ${d}: o fogo chega a ${p.name} aos ${formatMinutes(e.arrivalMin)}, depois de percorrer ${(e.lengthM / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km a ${Math.round(e.meanRateMMin)} m/min em média.`,
      along.length ? `Caminho: ${along.join(" → ")}.` : "",
      `O que fez o fogo rápido (fora do fogo de copas): combustível ${pct(e.shares.fuel)}, vento ${pct(e.shares.wind)}, declive ${pct(e.shares.slope)}${e.shares.slope < 0 ? " (desceu a encosta)" : ""}.`,
      `Fogo de copas em ${pct(e.crownShare)} do tempo; à cabeça do fogo ${pct(e.headShare)}; travado por uma ação ${pct(e.slowedShare)}.`,
      fuels ? `Combustíveis no caminho: ${fuels}.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },

  async find_places(input, context) {
    const s = context().snapshot;
    if (!s.grid) throw new InputError("A zona ainda está a carregar.");
    const header = s.grid.header;
    const query = normalize(text(input, "query", true));
    const ignition = s.ignition && projectedToGrid(header, s.ignition[0], s.ignition[1]);
    const distance = (p: { row: number; col: number }) => (ignition ? Math.hypot(p.row - ignition.y, p.col - ignition.x) : 0);
    const found = (query ? s.places.filter((p) => normalize(p.name).includes(query)) : [...s.places].sort((a, b) => distance(a) - distance(b))).slice(0, 15);
    if (!found.length) return `Nenhum lugar com "${text(input, "query")}" no nome.`;
    return found
      .map((p) => {
        const parts = [`${p.name}: ${p.buildings} edifícios`];
        const from = fromIgnition(header, s.ignition, p);
        if (from) parts.push(`${from} da ignição`);
        if (s.results) parts.push(`fogo chega em A ${arrivalAt(s, p, "A")}, em B ${arrivalAt(s, p, "B")}${s.stale ? " (resultados desatualizados)" : ""}`);
        return `- ${parts.join("; ")}`;
      })
      .join("\n");
  },

  async show_place(input, context) {
    const { snapshot: s, actions } = context();
    if (!s.grid) throw new InputError("A zona ainda está a carregar.");
    const p = place(s, text(input, "place", true));
    const decision = input.decision === undefined || input.decision === null ? null : oneOf(input, "decision", DECISIONS);
    const cell = s.results?.explain ? (decision ? firstReached(s, p, decision) : (firstReached(s, p, "A") ?? firstReached(s, p, "B"))) : null;
    actions.show(cell, [gridPoint(s.grid.header, p.row, p.col)]);
    return cell === null ? `Mapa centrado em ${p.name}.` : `Mapa centrado em ${p.name}, com o caminho do fogo até lá.`;
  },

  async check_plan(input, context) {
    const d = oneOf(input, "decision", DECISIONS);
    const { snapshot, actions } = context();
    if (!snapshot.ignition) throw new InputError("Ainda não há ignição.");
    const free = await actions.fireRun(d, []);
    return checkPlan(context().snapshot, d, free).join("\n");
  },

  async place_intervention(input, context) {
    const { snapshot: s, actions } = context();
    const grid = s.grid;
    if (!grid) throw new InputError("A zona ainda está a carregar.");
    if (!s.ignition) throw new InputError("Ainda não há ignição: o utilizador tem de acender o fogo primeiro (ou usar set_conditions).");
    const d = oneOf(input, "decision", DECISIONS);
    const kind = oneOf(input, "kind", KINDS);
    const shape = oneOf(input, "shape", SHAPES);
    const startMin = number(input, "start_min", 0, s.durationMin);
    if (startMin === undefined) throw new InputError("Falta start_min.");
    const endMin = number(input, "end_min", 1, 1440);
    if (endMin !== undefined && endMin <= startMin) throw new InputError("end_min tem de ser depois de start_min.");
    const widthM = number(input, "width_m", 0.5, 100);
    const agent = input.agent === undefined || input.agent === null ? undefined : oneOf(input, "agent", ["water", "retardant"] as const);
    if (agent && kind !== "aerialDrop") throw new InputError("agent só se usa em descargas aéreas.");
    if (widthM !== undefined && kind !== "containmentLine" && kind !== "backfire") throw new InputError("width_m só se usa em linhas de contenção e contrafogos.");
    const target = place(s, text(input, "place", true));
    const toName = text(input, "to_place");
    const line = isLineKind(kind);
    const run = shape === "across_path" || shape === "fire_head" ? await actions.fireRun(d, s.decisions[d]) : null;
    const built = buildShape(
      grid.header,
      {
        shape,
        line,
        place: target,
        placeCells: placeCells(grid, target),
        toPlace: toName ? place(s, toName) : undefined,
        minute: number(input, "minute", 0, 1440),
        startMin,
        lengthM: number(input, "length_m", 100, 5000),
        radiusM: number(input, "radius_m", 50, 3000),
      },
      run,
      s.durationMin,
    );
    if ("error" in built) throw new InputError(built.error);
    const item: DrawnIntervention = {
      id: newId(),
      kind,
      startMin: Math.round(startMin),
      ...(kind === "aerialDrop" && { agent: agent ?? "water", endMin: Math.round(endMin ?? startMin + AERIAL_DEFAULT_MIN[agent ?? "water"]) }),
      ...(kind !== "aerialDrop" && endMin !== undefined && { endMin: Math.round(endMin) }),
      ...(widthM !== undefined && { widthM }),
      coords: built.coords,
    };
    // The same check the simulation makes, so a bad action never reaches the map.
    try {
      if (!toEngineIntervention(grid.header, item, {}, s.ignition).cells.length) throw new Error("fica fora da zona simulada");
    } catch (e) {
      throw new InputError(`Não foi possível colocar: ${e instanceof Error ? e.message : String(e)}.`);
    }
    actions.addIntervention(d, item);
    const ends = item.endMin !== undefined ? ` até aos ${item.endMin} min` : "";
    return `Colocada [${item.id}] ${KIND_LABEL[kind]} na decisão ${d}, a partir dos ${item.startMin} min${ends}. ${built.where} Os resultados ficam desatualizados até simular de novo.`;
  },

  async update_intervention(input, context) {
    const { snapshot: s, actions } = context();
    const d = oneOf(input, "decision", DECISIONS);
    const id = text(input, "id", true);
    const iv = s.decisions[d].find((x) => x.id === id);
    if (!iv) throw new InputError(`Não há nenhuma ação ${id} na decisão ${d}.`);
    const patch: Partial<DrawnIntervention> = {};
    const start = number(input, "start_min", 0, s.durationMin);
    if (start !== undefined) patch.startMin = Math.round(start);
    if (input.end_min === null) patch.endMin = undefined;
    else {
      const end = number(input, "end_min", 1, 1440);
      if (end !== undefined) patch.endMin = Math.round(end);
    }
    const width = number(input, "width_m", 0.5, 100);
    if (width !== undefined) {
      if (iv.kind !== "containmentLine" && iv.kind !== "backfire") throw new InputError("width_m só se usa em linhas de contenção e contrafogos.");
      patch.widthM = width;
    }
    const next = { ...iv, ...patch };
    if (next.endMin !== undefined && next.endMin <= next.startMin) throw new InputError("O fim tem de ser depois do início.");
    actions.updateIntervention(d, id, patch);
    return `Atualizada [${id}] na decisão ${d}: a partir dos ${next.startMin} min${next.endMin !== undefined ? ` até aos ${next.endMin} min` : ""}${next.widthM !== undefined ? `, ${next.widthM} m de largura` : ""}.`;
  },

  async remove_intervention(input, context) {
    const { snapshot: s, actions } = context();
    const d = oneOf(input, "decision", DECISIONS);
    const id = text(input, "id", true);
    const iv = s.decisions[d].find((x) => x.id === id);
    if (!iv) throw new InputError(`Não há nenhuma ação ${id} na decisão ${d}.`);
    actions.removeIntervention(d, id);
    return `Removida [${id}] ${KIND_LABEL[iv.kind]} da decisão ${d}.`;
  },

  async copy_decision(input, context) {
    const { snapshot: s, actions } = context();
    const from = oneOf(input, "from", DECISIONS);
    const to = oneOf(input, "to", DECISIONS);
    if (from === to) throw new InputError("from e to têm de ser decisões diferentes.");
    // New ids: the same id in both decisions would make "update" and "remove" ambiguous for the user's list.
    const copies = s.decisions[from].map((iv) => ({ ...iv, id: newId() }));
    actions.setDecision(to, copies);
    const replaced = s.decisions[to].length;
    return `A decisão ${to} tem agora as ${copies.length} ações de ${from}${replaced ? ` (substituíram as ${replaced} que tinha)` : ""}. Novos ids: ${copies.map((c) => c.id).join(", ") || "nenhum"}.`;
  },

  async clear_decision(input, context) {
    const { snapshot: s, actions } = context();
    const d = oneOf(input, "decision", DECISIONS);
    const n = s.decisions[d].length;
    actions.setDecision(d, []);
    return `Decisão ${d} sem ações (deixar arder); ${n} ${n === 1 ? "ação removida" : "ações removidas"}.`;
  },

  async set_conditions(input, context) {
    const { snapshot: s, actions } = context();
    const done: string[] = [];
    const dir = number(input, "wind_from_deg", 0, 359);
    const kmh = number(input, "wind_speed_kmh", 0, 72);
    if (dir !== undefined || kmh !== undefined) {
      const wind = { ...s.wind, directionDeg: dir ?? s.wind.directionDeg, speedMs: kmh !== undefined ? kmh / 3.6 : s.wind.speedMs };
      actions.setWind(wind);
      done.push(`vento de ${Math.round(wind.directionDeg)}° a ${Math.round(wind.speedMs * 3.6)} km/h (marcado como posto à mão)`);
    }
    const duration = number(input, "duration_min", 60, 1440);
    if (duration !== undefined) {
      actions.setDuration(Math.round(duration / 60) * 60);
      done.push(`duração ${formatMinutes(Math.round(duration / 60) * 60)}`);
    }
    const ignitionName = text(input, "ignition_place");
    if (ignitionName) {
      const p = place(s, ignitionName);
      if (!s.grid) throw new InputError("A zona ainda está a carregar.");
      const cells = placeCells(s.grid, p);
      const point = cells.length ? cellCentre(s.grid.header, cells[Math.floor(cells.length / 2)]) : gridPoint(s.grid.header, p.row, p.col);
      const problem = actions.setIgnition(point);
      if (problem) throw new InputError(problem);
      done.push(`ignição em ${p.name} (o tempo em direto é pedido para esse ponto)`);
    }
    if (!done.length) throw new InputError("Nada para mudar: indicar o vento, a duração ou a ignição.");
    return `Mudado: ${done.join("; ")}. Os resultados ficam desatualizados até simular de novo.`;
  },

  async run_simulation(_input, context) {
    const { snapshot, actions } = context();
    if (!snapshot.ignition) throw new InputError("Ainda não há ignição.");
    const { results, error } = await actions.runSimulation();
    if (!results) throw new InputError(error ?? "A simulação não correu.");
    await settle();
    const s = context().snapshot;
    const places = threatenedPlaces(s, 8);
    return [...resultLines(s), ...(places.length ? ["Lugares onde o fogo chega primeiro (A, B):", ...places] : [])].join("\n");
  },
};

/** Lets React apply the state changes of a tool before the next one reads the app. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

/** Runs one tool; bad inputs and failures come back as errors the model reads and can correct. */
export async function runTool(name: string, input: unknown, context: () => AssistantContext): Promise<ToolOutcome> {
  const handler = (handlers as Record<string, (typeof handlers)[ToolName]>)[name];
  if (!handler) return { content: `Ferramenta desconhecida: ${name}.`, isError: true };
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { content: "Entrada inválida.", isError: true };
  try {
    return { content: await handler(input as Input, context) };
  } catch (e) {
    if (e instanceof InputError) return { content: e.message, isError: true };
    console.error(`assistente: ${name} falhou`, e);
    return { content: `Erro interno ao correr ${name}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}

/** What the panel shows while a tool runs. */
export function toolLabel(name: string, input: unknown): string {
  const i = (typeof input === "object" && input !== null ? input : {}) as Input;
  const d = typeof i.decision === "string" ? ` em ${i.decision}` : "";
  const kind = typeof i.kind === "string" && i.kind in KIND_LABEL ? KIND_LABEL[i.kind as InterventionKind] : "ação";
  switch (name) {
    case "get_state":
      return "A ler o estado da aplicação";
    case "get_results":
      return "A ler os resultados";
    case "explain_place":
      return `A explicar a chegada a ${String(i.place ?? "um lugar")}${d}`;
    case "find_places":
      return "A procurar lugares";
    case "show_place":
      return `A mostrar ${String(i.place ?? "um lugar")} no mapa`;
    case "check_plan":
      return `A rever o plano${d}`;
    case "place_intervention":
      return `A colocar ${kind.toLowerCase()}${d}`;
    case "update_intervention":
      return `A alterar uma ação${d}`;
    case "remove_intervention":
      return `A remover uma ação${d}`;
    case "copy_decision":
      return `A copiar ${String(i.from)} para ${String(i.to)}`;
    case "clear_decision":
      return `A limpar a decisão${d}`;
    case "set_conditions":
      return "A mudar as condições";
    case "run_simulation":
      return "A simular A e B";
    default:
      return name;
  }
}
