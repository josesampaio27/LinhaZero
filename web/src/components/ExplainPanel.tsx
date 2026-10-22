import type { DecisionId, GridData, PathExplanation } from "@linha-zero/engine";
import { Icon } from "./Icon";
import { formatMinutes } from "./TimeBar";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} km`);
const rate = (v: number) => `${v.toLocaleString("pt-PT", { maximumFractionDigits: v < 10 ? 1 : 0 })} m/min`;
/** Fuel labels from FUMOD carry a code in brackets; the short name reads better here. */
const shortFuel = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

/** What made the fire fast along the path, largest first, in plain words. */
function causes(e: PathExplanation): string {
  const parts = [
    { name: "o vento", v: e.shares.wind },
    { name: "o combustível", v: e.shares.fuel },
    { name: "o declive", v: e.shares.slope },
  ]
    .filter((p) => p.v >= 0.05)
    .sort((a, b) => b.v - a.v)
    .map((p) => `${p.name} ${pct(p.v)}`);
  const downhill = e.shares.slope <= -0.05 ? "; desceu encostas, o que o abrandou" : "";
  return `${parts.join(", ")}${downhill}`;
}

function Decision({ d, grid, e, reached }: { d: DecisionId; grid: GridData; e: PathExplanation | null; reached: boolean }) {
  if (!e) {
    return (
      <div className={`explain-decision dec-${d}`}>
        <p className="explain-title">
          <span className={`letter dec-${d}`}>{d}</span> {reached ? "É onde o fogo começa." : "O fogo não chega aqui."}
        </p>
      </div>
    );
  }
  const fuels = e.fuels
    .filter((f) => f.share >= 0.1)
    .slice(0, 3)
    .map((f) => `${shortFuel(grid.header.fuelTable[f.code]?.label ?? String(f.code))} ${pct(f.share)}`);
  return (
    <div className={`explain-decision dec-${d}`}>
      <p className="explain-title">
        <span className={`letter dec-${d}`}>{d}</span> Chega às {formatMinutes(e.arrivalMin)}, depois de {km(e.lengthM)} a {rate(e.meanRateMMin)} em média
      </p>
      <ul>
        <li>
          <b>Na cabeça do fogo, a velocidade vinha de:</b> {causes(e)}.
        </li>
        <li>
          {e.headShare >= 0.5 ? "Veio sobretudo na cabeça do fogo" : "Veio sobretudo pelos flancos ou a recuar contra o vento"} (
          {pct(e.headShare)} do tempo na cabeça).
        </li>
        {e.crownShare >= 0.05 && <li>Fogo de copas em {pct(e.crownShare)} do tempo.</li>}
        {e.slowedShare > 0 && <li>Atrasado por ações de combate em {pct(e.slowedShare)} do tempo.</li>}
        {fuels.length > 0 && <li>Combustível pelo caminho: {fuels.join(", ")}.</li>}
      </ul>
    </div>
  );
}

/** Why the fire reaches one point in each decision: the path (drawn on the maps) and what drove it. */
export function ExplainPanel({
  place,
  grids,
  explanations,
  reached,
  onClose,
}: {
  /** Where the point is, as describeCell says it (in or near a place). */
  place: string | null;
  grids: Record<DecisionId, GridData>;
  explanations: Record<DecisionId, PathExplanation | null>;
  /** Whether the fire is at this point at all in each decision (the ignition itself has no path). */
  reached: Record<DecisionId, boolean>;
  onClose: () => void;
}) {
  return (
    <section className="explain" aria-label="Porque o fogo chega aqui">
      <div className="explain-head">
        <p className="field-label">Porque o fogo chega aqui{place ? ` · ${place}` : ""}</p>
        <button className="icon-btn" aria-label="Fechar a explicação" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <Decision d="A" grid={grids.A} e={explanations.A} reached={reached.A} />
      <Decision d="B" grid={grids.B} e={explanations.B} reached={reached.B} />
      <p className="hint">
        O caminho está desenhado nos mapas. As percentagens dizem o que pesou na velocidade da cabeça do fogo, pelo modelo de
        Rothermel: a do combustível sem vento nem declive, mais o efeito do vento e o do declive. Simulação sem sorteios.
      </p>
    </section>
  );
}
