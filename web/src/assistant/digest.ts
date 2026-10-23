// The app state as short Portuguese text for the assistant: sent with every user message (between <estado> tags) and
// returned by get_state / get_results. Only facts the app computed; the model must not need to guess anything.
import { projectedToGrid, type DecisionId, type DrawnIntervention, type GridHeader, type Metrics } from "@linha-zero/engine";
import type { WeatherResponse } from "../api/client";
import { headline } from "../components/ComparisonPanel";
import { hourMinute } from "../lib/weather";
import { formatMinutes } from "../components/TimeBar";
import { compassName } from "../components/WindControl";
import { describeCell } from "../lib/places";
import { KIND_LABEL, isLineKind } from "../lib/scenario";
import type { AssistantSnapshot } from "./context";
import { percentile } from "./explain";
import { distanceAndDirection } from "./places";

/** Where the weather comes from, for the state: the IPMA station and time, the model, a scenario file or defaults. */
export function weatherSourceText(source: "default" | "live" | "scenario", live: WeatherResponse | null): string {
  if (source === "scenario") return "valores do cenário carregado";
  if (source !== "live" || !live) return "valores por omissão, sem tempo em direto";
  if (live.use === "observed" && live.observed) {
    const o = live.observed;
    return `tempo em direto, estação IPMA de ${o.station.name} a ${o.station.distanceKm.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} km, observação das ${hourMinute(o.observedAt)}`;
  }
  return live.model ? `tempo em direto, modelo Open-Meteo para as ${hourMinute(live.model.observedAt)}` : "tempo em direto";
}

const DECISIONS: DecisionId[] = ["A", "B"];
const STEP_LABEL = { situacao: "Situação", decisoes: "Decisões", resultado: "Resultado" } as const;

const int = (n: number) => Math.round(n).toLocaleString("pt-PT");
const ha = (n: number) => `${n.toLocaleString("pt-PT", { maximumFractionDigits: n < 10 ? 1 : 0 })} ha`;
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km` : `${int(m)} m`);

/** Length of a line, or area of a zone, in words. */
export function sizeOf(iv: DrawnIntervention): string {
  const pts = iv.coords;
  if (isLineKind(iv.kind)) {
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return km(m);
  }
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    twice += x1 * y2 - x2 * y1;
  }
  return ha(Math.abs(twice) / 2 / 10000);
}

/** Where a drawn action is: the place nearest its middle point. */
function whereIs(s: AssistantSnapshot, iv: DrawnIntervention): string {
  if (!s.grid || !iv.coords.length) return "";
  const n = iv.coords.length;
  const x = iv.coords.reduce((a, p) => a + p[0], 0) / n;
  const y = iv.coords.reduce((a, p) => a + p[1], 0) / n;
  const g = projectedToGrid(s.grid.header, x, y);
  return describeCell(s.grid, s.places, Math.floor(g.y), Math.floor(g.x))?.toLowerCase() ?? "";
}

/** One line per action: "[id] Linha de contenção 1,2 km, 4 m de largura, aos 30 min, perto de X (assistente)". */
export function interventionLine(s: AssistantSnapshot, iv: DrawnIntervention): string {
  const parts = [`[${iv.id}] ${KIND_LABEL[iv.kind]} de ${sizeOf(iv)}`];
  if (iv.widthM !== undefined) parts.push(`${iv.widthM.toLocaleString("pt-PT")} m de largura`);
  if (iv.kind === "aerialDrop") parts.push(iv.agent === "retardant" ? "retardante" : "água");
  parts.push(`a partir dos ${int(iv.startMin)} min${iv.endMin !== undefined ? ` até aos ${int(iv.endMin)} min` : ""}`);
  const where = whereIs(s, iv);
  if (where) parts.push(where);
  if (s.assistantIds.has(iv.id)) parts.push("colocada pelo assistente");
  return `- ${parts.join(", ")}`;
}

function ignitionLine(s: AssistantSnapshot): string {
  if (!s.ignition) return "Ignição: ainda não colocada.";
  if (!s.grid) return "Ignição: colocada (a zona ainda está a carregar).";
  const g = projectedToGrid(s.grid.header, s.ignition[0], s.ignition[1]);
  const where = describeCell(s.grid, s.places, Math.floor(g.y), Math.floor(g.x));
  return `Ignição: ${where ?? "colocada"}.${s.burnedArea ? " Há uma área já ardida desenhada, de onde o fogo também parte." : ""}`;
}

function weatherLine(s: AssistantSnapshot): string {
  const w = s.wind;
  const parts = [`vento de ${compassName(w.directionDeg)} (${int(w.directionDeg)}°) a ${int(w.speedMs * 3.6)} km/h`];
  if (s.air) parts.push(`${int(s.air.tempC)} °C`, `humidade do ar ${int(s.air.rhPct)}%`);
  parts.push(`combustível: ${s.moisture}`);
  const manual = s.manual.length ? ` Valores postos à mão: ${s.manual.join(", ")}.` : "";
  const steps = s.weatherSteps > 0 ? ` Segue a previsão hora a hora (${s.weatherSteps} mudanças).` : " Tempo constante durante a simulação.";
  return `Tempo: ${parts.join(", ")}. Origem: ${s.weatherSource}.${manual}${steps}`;
}

function uncertaintyLine(s: AssistantSnapshot): string {
  if (s.ensembleOn) return `Incerteza: ligada, ${int(s.ensembleRuns)} cenários de vento por decisão, no servidor.`;
  if (!s.serverAvailable) return "Incerteza: indisponível (o servidor não tem workers livres); cada decisão corre uma vez.";
  return "Incerteza: desligada; cada decisão corre uma vez.";
}

function decisionLines(s: AssistantSnapshot, d: DecisionId): string[] {
  const items = s.decisions[d];
  const variant = s.variants[d] ? `, na variante de grelha "${s.variants[d]}"` : "";
  if (!items.length) return [`Decisão ${d}: sem ações (deixar arder)${variant}.`];
  return [`Decisão ${d}: ${items.length} ${items.length === 1 ? "ação" : "ações"}${variant}:`, ...items.map((iv) => interventionLine(s, iv))];
}

const totalHa = (m: Metrics) => m.burnedHaByHour[m.burnedHaByHour.length - 1] ?? 0;

/** The verdict and totals of the latest results, as the result panel shows them. */
export function resultLines(s: AssistantSnapshot): string[] {
  const r = s.results;
  if (!r) return ["Resultado: ainda não simulado."];
  const sum = headline(r.A.metrics, r.B.metrics, r.durationMin, r.paired, { A: s.decisions.A.length, B: s.decisions.B.length });
  const lines = [
    s.stale
      ? "Resultado (DESATUALIZADO: a situação ou as decisões mudaram desde esta simulação; simular de novo antes de citar números):"
      : `Resultado (${r.paired ? `com ${int(r.paired.ha.runs)} cenários de vento por decisão` : "uma corrida por decisão, sem incerteza"}):`,
    `- ${sum.title}.${sum.sentence ? ` ${sum.sentence}.` : ""}`,
    ...sum.confidence.map((c) => `- ${c}`),
    ...sum.places.map((p) => `- ${p.text}`),
  ];
  for (const d of DECISIONS) {
    const m = r[d].metrics;
    const likely = r.likelyHa ? ` (área ardida esperada nos cenários: ${ha(d === "A" ? r.likelyHa.a : r.likelyHa.b)})` : "";
    lines.push(`- Decisão ${d}: ${ha(totalHa(m))} ardidos em ${formatMinutes(r.durationMin)}${likely}, ${int(m.buildingsReached)} edifícios atingidos.`);
  }
  for (const d of DECISIONS) {
    const runs = r[d].runs;
    if (!runs?.length) continue;
    const range = (values: number[], fmt: (n: number) => string) =>
      `${fmt(percentile(values, 0.1))} a ${fmt(percentile(values, 0.9))} (mediana ${fmt(percentile(values, 0.5))})`;
    lines.push(
      `- Dispersão de ${d} nos ${int(runs.length)} cenários (80% dos cenários entre): ${range(runs.map((x) => x.burnedHa), ha)} ardidos, ${range(runs.map((x) => x.buildingsReached), int)} edifícios.`,
    );
  }
  return lines;
}

/** Places the fire reaches in A or B, earliest first, with both arrival minutes. */
export function threatenedPlaces(s: AssistantSnapshot, limit: number): string[] {
  const r = s.results;
  if (!r) return [];
  const at = (m: Metrics, id: number) => m.villages.find((v) => v.id === id)?.firstArrivalMin ?? null;
  const rows = r.A.metrics.villages
    .map((v) => ({ name: v.name, a: v.firstArrivalMin, b: at(r.B.metrics, v.id) }))
    .concat(r.B.metrics.villages.filter((v) => at(r.A.metrics, v.id) === null && v.firstArrivalMin !== null).map((v) => ({ name: v.name, a: null, b: v.firstArrivalMin })))
    .filter((v) => v.a !== null || v.b !== null)
    .sort((x, y) => Math.min(x.a ?? Infinity, x.b ?? Infinity) - Math.min(y.a ?? Infinity, y.b ?? Infinity));
  const when = (m: number | null) => (m === null ? "não chega" : formatMinutes(m));
  return rows.slice(0, limit).map((v) => `- ${v.name}: A ${when(v.a)}, B ${when(v.b)}`);
}

/** Distance and direction of a place from the ignition, when there is one. */
export function fromIgnition(header: GridHeader, ignition: AssistantSnapshot["ignition"], place: { row: number; col: number }): string | null {
  if (!ignition) return null;
  const g = projectedToGrid(header, ignition[0], ignition[1]);
  return distanceAndDirection(header, { row: g.y, col: g.x }, place);
}

/** The full snapshot: what the user sees right now. */
export function stateDigest(s: AssistantSnapshot): string {
  const lines = [
    `Zona: ${s.zone}. Etapa aberta: ${STEP_LABEL[s.step]}.${s.busy ? " Uma simulação está a correr." : ""}`,
    ignitionLine(s),
    weatherLine(s),
    `Duração da simulação: ${formatMinutes(s.durationMin)}. ${uncertaintyLine(s)}`,
    ...DECISIONS.flatMap((d) => decisionLines(s, d)),
    ...resultLines(s),
  ];
  const places = threatenedPlaces(s, 8);
  if (places.length) lines.push("Lugares onde o fogo chega primeiro (minuto em A e em B):", ...places);
  if (s.results && s.step === "resultado") {
    lines.push(`Barra de tempo do mapa: ${formatMinutes(s.t)}.`);
    if (s.explainAt !== null && s.grid) {
      const { cols } = s.grid.header;
      const where = describeCell(s.grid, s.places, Math.floor(s.explainAt / cols), s.explainAt % cols);
      if (where) lines.push(`No mapa está aberto o caminho do fogo até: ${where.toLowerCase()}.`);
    }
  }
  return lines.join("\n");
}
