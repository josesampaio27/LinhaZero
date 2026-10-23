// check_plan: what is wrong with a decision's actions, found by code, not by the model (docs/decisoes/0079). Each
// action is judged against a run of the fire without any of the decision's actions (where and when the fire would
// pass) and against a run with them (whether lines hold, and the flames each action faces, docs/decisoes/0082). Pure
// function, tested in Node.
import { DEFAULT_PARAMS, firePath, toEngineIntervention, type DecisionId } from "@linha-zero/engine";
import { anchorAt } from "./anchor";
import { KIND_LABEL } from "../lib/scenario";
import type { AssistantSnapshot, FireRun } from "./context";
import { sizeOf } from "./digest";
import { crewsEffect, dropHolds, fireFaced, HOLD_TARGET, lineHolds, widthThatHolds } from "./explain";

const LINES = new Set(["containmentLine", "backfire", "aerialDrop"]);
const min = (m: number) => `${Math.round(m)} min`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const metres = (m: number) => `${m.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} m`;

/**
 * Findings, one line each, prefixed with the action's id. `free` is a run of the decision with no actions at all,
 * `current` a run with all of them.
 */
export function checkPlan(s: AssistantSnapshot, decision: DecisionId, free: FireRun, current: FireRun): string[] {
  const grid = s.decisionGrids[decision];
  if (!grid) return ["A zona ainda está a carregar."];
  const items = s.decisions[decision];
  if (!items.length) return [`A decisão ${decision} não tem ações (deixar arder).`];
  const { cols } = grid.header;
  const duration = s.durationMin;
  const reachedAt = (i: number) => (free.arrivalMin[i] <= duration ? free.arrivalMin[i] : null);

  // The fire's paths to the places it reaches without any action, earliest first: what a line should cut.
  const threatened = s.places
    .map((p) => {
      let cell = -1;
      let at = Infinity;
      for (let i = 0; i < grid.village.length; i++) {
        if (grid.village[i] === p.id && free.arrivalMin[i] < at) {
          at = free.arrivalMin[i];
          cell = i;
        }
      }
      return { name: p.name, cell, at };
    })
    .filter((p) => p.cell >= 0 && p.at <= duration)
    .sort((a, b) => a.at - b.at)
    .slice(0, 10)
    .map((p) => ({ ...p, path: new Set(firePath(free.explain, free.arrivalMin, p.cell)) }));

  // The fire each action meets, from the engine's own rules (src/params.ts) with the default coefficients.
  const fireFacts = (iv: (typeof items)[number], cells: number[]): string | null => {
    if (iv.kind === "suppression" || iv.kind === "protectZone") {
      // Crews are judged on the fire they face before slowing it: the run without actions.
      const f = fireFaced(grid, cells, free.arrivalMin, free.intensityKwM, duration, false);
      if (!f.cells) return null;
      const peak = crewsEffect(f.maxKwM);
      if (peak >= 1) return `chamas na zona até ${metres(f.maxFlameM)}: os meios mantêm todo o efeito`;
      return `chamas na zona até ${metres(f.maxFlameM)} (mediana ${metres(f.medianFlameM)}): os meios mantêm ${pct(crewsEffect(f.medianKwM))} do efeito na mediana e ${pct(peak)} onde as chamas são mais altas`;
    }
    const f = fireFaced(grid, cells, current.arrivalMin, current.intensityKwM, duration, true);
    if (!f.cells) return null;
    const flames = `chamas junto a ela até ${metres(f.maxFlameM)} (mediana ${metres(f.medianFlameM)})`;
    if (iv.kind === "aerialDrop") return `${flames}: a descarga segura-as em ${pct(dropHolds(f))} das vezes`;
    if (iv.kind === "backfire") return flames;
    const width = iv.widthM ?? DEFAULT_PARAMS.lineWidthM;
    const holds = lineHolds(width, f);
    if (holds >= HOLD_TARGET) return `${flames}: com ${metres(width)} de largura segura-as em ${pct(holds)} das vezes`;
    const wider = widthThatHolds(f.maxFlameM);
    return `${flames}: com ${metres(width)} de largura segura-as só em ${pct(holds)} das vezes; ${
      wider ? `uma linha de ${metres(wider)} seguraria` : "nenhuma largura até 25 m segura estas chamas: pô-la onde o fogo é mais fraco, ou usar contrafogo"
    }`;
  };

  const findings: string[] = [];
  for (const iv of items) {
    const label = `[${iv.id}] ${KIND_LABEL[iv.kind]} de ${sizeOf(iv)}, aos ${min(iv.startMin)}`;
    let cells: number[];
    try {
      cells = toEngineIntervention(grid.header, iv, {}, s.ignition ?? undefined).cells.map((c) => c.row * cols + c.col);
    } catch (e) {
      findings.push(`${label}: inválida (${e instanceof Error ? e.message : String(e)}).`);
      continue;
    }
    if (!cells.length) {
      findings.push(`${label}: fica fora da zona simulada.`);
      continue;
    }
    const times = cells.map(reachedAt).filter((t): t is number => t !== null);
    const problems: string[] = [];
    if (!times.length) {
      problems.push(`sem ações, o fogo não chega aqui em ${min(duration)}: esta ação não tem efeito`);
    } else {
      const first = Math.min(...times);
      const last = Math.max(...times);
      const before = times.filter((t) => t < iv.startMin).length;
      if (LINES.has(iv.kind) && before > 0) {
        problems.push(`o fogo chega a ${pct(before / cells.length)} das suas células antes de ela começar (chega aos ${min(first)}): nesses troços passa`);
      }
      if (!LINES.has(iv.kind) && last < iv.startMin) {
        problems.push(`o fogo já passou por toda a zona (até aos ${min(last)}) quando os meios chegam`);
      }
      if (iv.kind === "aerialDrop") {
        const end = iv.endMin ?? iv.startMin + (iv.agent === "retardant" ? 120 : 20);
        if (end < first) problems.push(`deixa de fazer efeito aos ${min(end)}, antes de o fogo lá chegar (aos ${min(first)})`);
      }
    }
    if (iv.kind === "containmentLine" || iv.kind === "backfire") {
      const closed = iv.coords.length > 2 && iv.coords[0][0] === iv.coords[iv.coords.length - 1][0] && iv.coords[0][1] === iv.coords[iv.coords.length - 1][1];
      if (!closed) {
        const loose = [cells[0], cells[cells.length - 1]].filter((c) => !anchorAt(grid, Math.floor(c / cols), c % cols)).length;
        if (loose) {
          problems.push(
            `${loose === 2 ? "as duas pontas não se apoiam" : "uma ponta não se apoia"} em nada que trave o fogo (estrada, rio, zona sem combustível): o fogo pode contorná-la`,
          );
        }
      }
      if (threatened.length) {
        const near = new Set(cells.flatMap((c) => [c, c - 1, c + 1, c - cols, c + cols]));
        const cut = threatened.filter((p) => [...p.path].some((c) => near.has(c)));
        if (!cut.length) {
          problems.push(`não corta o caminho do fogo para nenhum dos lugares ameaçados (${threatened.slice(0, 4).map((p) => p.name).join(", ")})`);
        }
      }
      const crossed = cells.filter((c) => current.arrivalMin[c] <= duration && current.arrivalMin[c] >= iv.startMin).length;
      if (crossed) problems.push(`o fogo galga-a em ${crossed} ${crossed === 1 ? "célula" : "células"}`);
    }
    const facts = fireFacts(iv, cells);
    const found = problems.length ? problems.join("; ") : "sem problemas encontrados";
    findings.push(`${label}: ${found}.${facts ? ` Fogo: ${facts}.` : ""}`);
  }
  if (s.variants[decision]) findings.push(`As chamas e larguras usam os coeficientes por omissão; a variante "${s.variants[decision]}" pode ter outros.`);
  if (s.stale || !s.results) findings.push("Os resultados não estão atualizados: correr a simulação para ver o efeito real do plano.");
  return findings;
}
