import { useState } from "react";
import type { DecisionId, LineSuggestion, SuggestResult } from "@linha-zero/engine";
import { LINE_WIDTHS } from "./DecisionTools";
import { Icon } from "./Icon";
import { Segmented } from "./Shell";
import { formatMinutes } from "./TimeBar";

const READY_STEP = 15;
const fmtHa = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} ha`;
const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString("pt-PT")} km`);

/**
 * "Sugerir uma terceira decisão" (stage C, M10): containment lines across the fire's path, added to one decision and
 * simulated (engine suggestLines). The user says when a line can be ready and how wide: there is no logistics.
 */
export function SuggestPanel({
  onSuggest,
  onUse,
  preview,
  onPreview,
}: {
  onSuggest: (base: DecisionId, readyMin: number, widthM: number) => Promise<SuggestResult>;
  /** Puts the decision `base` plus the suggested line into the other decision. */
  onUse: (base: DecisionId, s: LineSuggestion) => void;
  preview: LineSuggestion | null;
  /** Draws a suggestion on the map of the decision it builds on (null hides it). */
  onPreview: (base: DecisionId, s: LineSuggestion | null) => void;
}) {
  const [base, setBase] = useState<DecisionId>("A");
  const [readyMin, setReadyMin] = useState(60);
  const [widthM, setWidthM] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ base: DecisionId; r: SuggestResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const other: DecisionId = base === "A" ? "B" : "A";

  const run = async () => {
    setRunning(true);
    setError(null);
    onPreview(base, null);
    try {
      setResult({ base, r: await onSuggest(base, readyMin, widthM) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="suggest" aria-label="Sugerir uma terceira decisão">
      <p className="field-label">Sugerir uma terceira decisão</p>
      <p className="hint">
        O simulador experimenta linhas de contenção no caminho do fogo até aos lugares que ameaça, acrescentadas a uma decisão, e
        mostra as que mais poupam.
      </p>
      <div className="suggest-form">
        <Segmented
          label="Partir da decisão"
          value={base}
          onChange={(d) => {
            setBase(d);
            setResult(null);
            onPreview(d, null);
          }}
          options={[
            { value: "A", label: "Partir de A" },
            { value: "B", label: "Partir de B" },
          ]}
        />
        <label className="field">
          <span className="field-label">Linha pronta ao minuto</span>
          <input
            type="number"
            min={0}
            step={READY_STEP}
            value={readyMin}
            onChange={(e) => setReadyMin(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="field">
          <span className="field-label">Largura</span>
          <select value={widthM} onChange={(e) => setWidthM(Number(e.target.value))}>
            {LINE_WIDTHS.map((w) => (
              <option key={w.m} value={w.m}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button onClick={run} disabled={running}>
        {running ? "A experimentar linhas…" : "Procurar linhas"}
      </button>
      {error && <p className="message">{error}</p>}
      {result && (
        <>
          {result.r.suggestions.length === 0 ? (
            <p className="hint">
              Nenhuma das {result.r.tried} linhas experimentadas poupa um edifício ou uma área que conte (pelo menos 2% do que arde).
              Tenta uma linha pronta mais cedo, ou mais larga: com chamas altas, uma linha estreita não segura.
            </p>
          ) : (
            <ul className="suggest-list">
              {result.r.suggestions.map((s, k) => {
                const shown = preview === s;
                return (
                  <li key={k} className={shown ? "shown" : ""}>
                    <p>
                      <b>
                        Linha de {km(s.lengthM)}, {s.widthM} m, pronta {s.startMin === 0 ? "desde a ignição" : `${formatMinutes(s.startMin)} depois da ignição`}
                      </b>
                      {s.target ? `, entre o fogo e ${s.target}` : ", à frente do fogo"}
                    </p>
                    <p className="hint">
                      Face à decisão {result.base}: {s.buildingsSaved > 0 ? `poupa ${s.buildingsSaved.toLocaleString("pt-PT")} edifícios e ` : ""}
                      {s.haSaved > 0 ? `arde menos ${fmtHa(s.haSaved)}` : "a mesma área"}.
                    </p>
                    <div className="row">
                      <button onClick={() => onPreview(result.base, shown ? null : s)}>{shown ? "Esconder" : "Ver no mapa"}</button>
                      <button onClick={() => onUse(result.base, s)}>
                        Pôr na decisão {result.base === "A" ? "B" : "A"} <Icon name="chevron" size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hint">
            Sem logística: supõe que a linha fica pronta no minuto indicado e com esta largura. Comparado sem sorteios; "Pôr na decisão{" "}
            {other}" substitui essa decisão pela {result.base} com a linha, para a simulares com a incerteza.
          </p>
        </>
      )}
    </section>
  );
}
