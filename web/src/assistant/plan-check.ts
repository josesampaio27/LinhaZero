// check_plan: what is wrong with a decision's actions, found by code, not by the model (docs/decisoes/0079). Each
// action is judged against a run of the fire without any of the decision's actions (where and when the fire would
// pass) and, when the results are current, against what happened in the latest run. Pure function, tested in Node.
import { firePath, toEngineIntervention, type DecisionId } from "@linha-zero/engine";
import { anchorAt } from "./anchor";
import { KIND_LABEL } from "../lib/scenario";
import type { AssistantSnapshot, FireRun } from "./context";
import { sizeOf } from "./digest";

const LINES = new Set(["containmentLine", "backfire", "aerialDrop"]);
const min = (m: number) => `${Math.round(m)} min`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Findings, one line each, prefixed with the action's id. `free` is a run of the decision with no actions at all; the
 * latest results count only when they are current.
 */
export function checkPlan(s: AssistantSnapshot, decision: DecisionId, free: FireRun): string[] {
  const grid = s.decisionGrids[decision];
  if (!grid) return ["A zona ainda está a carregar."];
  const items = s.decisions[decision];
  if (!items.length) return [`A decisão ${decision} não tem ações (deixar arder).`];
  const { cols } = grid.header;
  const duration = s.durationMin;
  const reachedAt = (i: number) => (free.arrivalMin[i] <= duration ? free.arrivalMin[i] : null);
  const latest = s.results && !s.stale ? s.results[decision].arrivalMin : null;

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
      if (latest) {
        const crossed = cells.filter((c) => latest[c] <= duration && latest[c] >= iv.startMin).length;
        if (crossed) problems.push(`na última simulação o fogo galgou-a em ${crossed} ${crossed === 1 ? "célula" : "células"} (chamas compridas demais para a largura)`);
      }
    }
    findings.push(problems.length ? `${label}: ${problems.join("; ")}.` : `${label}: sem problemas encontrados.`);
  }
  if (s.stale || !s.results) findings.push("Os resultados não estão atualizados: correr a simulação para ver o efeito real do plano.");
  return findings;
}
