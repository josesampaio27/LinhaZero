import { useEffect, useState } from "react";
import { AERIAL_DEFAULT_MIN, type AerialAgent, type DecisionId, type DrawnIntervention, type InterventionKind } from "@linha-zero/engine";
import { KIND_LABEL } from "../lib/scenario";
import { Icon, type IconName } from "./Icon";

interface Props {
  decision: DecisionId;
  items: DrawnIntervention[];
  onPickTool: (kind: InterventionKind) => void;
  onUpdate: (id: string, patch: Partial<DrawnIntervention>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Expert options, e.g. the grid this decision runs on; shown inside "Mais opções da decisão". */
  children?: React.ReactNode;
  /** Name of the grid variant this decision runs on, shown on the collapsed "Mais opções" summary. */
  variantName?: string | null;
  /** Puts a removed action back at its index; when given, deleting an action offers "Desfazer" for a few seconds. */
  onRestore?: (item: DrawnIntervention, index: number) => void;
  /** Width (m) of lines that do not set their own; when given, lines show a width choice (Rothermel model). */
  defaultLineWidthM?: number;
  /** Ids of the actions the assistant placed, marked on their cards. */
  assistantIds?: ReadonlySet<string>;
  /** The demo: the actions are shown, nothing can be added, changed or removed. */
  readOnly?: boolean;
}

/** Typical containment line widths: hand line, machine line, fuel breaks. */
export const LINE_WIDTHS: { m: number; label: string }[] = [
  { m: 1, label: "1 m · manual" },
  { m: 4, label: "4 m · máquina" },
  { m: 10, label: "10 m · faixa" },
  { m: 25, label: "25 m · faixa larga" },
];

const widthLabel = (m: number) => LINE_WIDTHS.find((w) => w.m === m)?.label ?? `${m.toLocaleString("pt-PT")} m`;

const AGENTS: { value: AerialAgent; label: string }[] = [
  { value: "water", label: `Água · ${AERIAL_DEFAULT_MIN.water} min` },
  { value: "retardant", label: `Retardante · ${(AERIAL_DEFAULT_MIN.retardant / 60).toLocaleString("pt-PT")} h` },
];

/**
 * What each action stands for on the ground and what the engine does with it (Rothermel model:
 * engine/src/spread-rothermel.ts, params.ts, ADR 0070). Flame lengths are Byram's: the attack thresholds
 * (500 kW/m ≈ 1.4 m, 4000 kW/m ≈ 3.5 m), the aerial drop's (2000 kW/m ≈ 2.5 m, 4000 kW/m ≈ 3.5 m). A line
 * holds in the deterministic run when it is at least 5 times as wide as the flames are long
 * (holdWidthPerFlame of PT_CALIBRATION). Update these if they change.
 */
export const TOOLS: {
  kind: InterventionKind;
  icon: IconName;
  /** On the add button: what it is, in a few words. */
  summary: string;
  /** On a placed action: what it does to the fire. */
  effect: string;
  /** While drawing: what it stands for on the ground, what the simulator does, where to draw it. */
  meaning: string;
  rule: string;
  where: string;
}[] = [
  {
    kind: "containmentLine",
    icon: "line",
    summary: "Faixa sem combustível que trava o fogo",
    effect: "Trava o fogo a partir do minuto em que fica pronta, se for larga o bastante para as chamas",
    meaning:
      "Uma faixa sem combustível que os meios abrem à frente do fogo, à mão ou com máquinas. Também serve para uma faixa de gestão que já existe.",
    rule:
      "A partir do minuto em que fica pronta, o fogo para na linha se ela for pelo menos 5 vezes mais larga do que as chamas são compridas, porque o calor e as faúlhas passam faixas mais largas do que a chama. Uma linha de 4 m só trava chamas até 80 cm; uma faixa de 25 m trava chamas até 5 m. Se o fogo lá chegar antes de ela estar pronta, passa. Com um fim definido, a partir daí deixa de ser defendida e o fogo passa-a.",
    where: "Marcar onde os meios a abririam, entre o fogo e o que se quer proteger.",
  },
  {
    kind: "suppression",
    icon: "attack",
    summary: "Meios a combater o fogo numa zona",
    effect: "O fogo anda 5 vezes mais devagar na zona, menos se as chamas forem altas",
    meaning: "Meios a combater o fogo diretamente, com água, ferramentas ou máquinas, na cabeça ou num flanco.",
    rule:
      "A partir do minuto em que os meios chegam, o fogo nessa zona anda 5 vezes mais devagar, até saírem, se houver um fim definido. Atrasa o fogo, não o apaga. Com chamas acima de 1,4 m perde efeito, e acima de 3,5 m já não tem nenhum.",
    where: "Marcar a zona onde os meios vão trabalhar.",
  },
  {
    kind: "protectZone",
    icon: "shield",
    summary: "Meios à espera do fogo junto às casas",
    effect: "O fogo anda 10 vezes mais devagar na zona, menos se as chamas forem altas",
    meaning:
      "Meios já colocados junto a casas ou a uma aldeia, à espera do fogo para o travar ali. Têm mais efeito do que um ataque, porque estão no sítio e preparados.",
    rule:
      "A partir do minuto em que lá estão, o fogo nessa zona anda 10 vezes mais devagar, até saírem, se houver um fim definido. Com chamas acima de 1,4 m perde efeito, e acima de 3,5 m já não tem nenhum.",
    where: "Marcar a zona à volta do que se quer defender.",
  },
  {
    kind: "aerialDrop",
    icon: "drop",
    summary: "Água ou retardante largado por um meio aéreo",
    effect: "Trava o fogo enquanto faz efeito, se as chamas não forem altas demais",
    meaning: "Um helicóptero ou um avião larga água ou retardante numa faixa, à frente ou no flanco do fogo.",
    rule: `Do minuto da descarga até deixar de fazer efeito, a faixa trava o fogo: sempre com chamas até cerca de 2,5 m, nunca com chamas acima de 3,5 m, e umas vezes sim, outras não, entre as duas. A água dura cerca de ${AERIAL_DEFAULT_MIN.water} minutos e o retardante cerca de ${(AERIAL_DEFAULT_MIN.retardant / 60).toLocaleString("pt-PT")} horas; o fim pode ser alterado.`,
    where: "Marcar o percurso da descarga, por onde o fogo vai passar.",
  },
  {
    kind: "backfire",
    icon: "flame",
    summary: "Fogo posto a partir de uma linha, contra o fogo",
    effect: "Queima o terreno entre a linha e o fogo, que fica sem combustível para avançar",
    meaning:
      "Os meios queimam de propósito o combustível entre uma linha de apoio (uma estrada, um caminho ou uma linha aberta) e o fogo que se aproxima, para que a frente chegue a terreno já ardido.",
    rule:
      "No minuto indicado, o simulador acende o lado da linha virado para a ignição. Esse fogo arde como qualquer outro e conta como área ardida. A linha segura-o como uma linha de contenção, se for larga o bastante para as chamas. Aceso tarde, ou com o vento a empurrá-lo contra a linha, pode escapar.",
    where: "Marcar a linha de apoio entre o fogo e o que se quer proteger, de preferência sobre uma estrada ou um caminho.",
  },
];

const STEP = 5;

/** A minute stepper: − and + by STEP minutes, and the number typed in between. */
function Stepper(p: { label: string; value: number; min: number; onChange: (v: number) => void; onBlur?: () => void }) {
  return (
    <span className="stepper" role="group" aria-label={p.label}>
      <button aria-label="Mais cedo" disabled={p.value <= p.min} onClick={() => p.onChange(p.value - STEP)}>
        <Icon name="minus" size={16} />
      </button>
      <label>
        <input
          type="number"
          inputMode="numeric"
          min={p.min}
          step={STEP}
          value={p.value}
          aria-label={p.label}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) p.onChange(v);
          }}
          onBlur={p.onBlur}
        />
        <span>min</span>
      </label>
      <button aria-label="Mais tarde" onClick={() => p.onChange(p.value + STEP)}>
        <Icon name="plus" size={16} />
      </button>
    </span>
  );
}

/** Actions of one decision: a card per action with its start and end minutes, the tools to add one, and expert options. */
export function DecisionTools(p: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [removed, setRemoved] = useState<{ item: DrawnIntervention; index: number } | null>(null);
  // Touch browsers may never blur the button, so the confirmation also expires, after a generous 8 s.
  useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 8000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);
  useEffect(() => {
    if (!removed) return;
    const t = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(t);
  }, [removed]);
  // The end moves with the start, so the action keeps its duration.
  const setStart = (iv: DrawnIntervention, v: number) => {
    const startMin = Math.max(0, Math.round(v));
    p.onUpdate(iv.id, { startMin, ...(iv.endMin !== undefined && { endMin: startMin + (iv.endMin - iv.startMin) }) });
  };
  // While typing the end may pass through values before the start; leaving the field puts it right.
  const setEnd = (iv: DrawnIntervention, v: number) => p.onUpdate(iv.id, { endMin: Math.max(0, Math.round(v)) });
  const fixEnd = (iv: DrawnIntervention) => {
    if (iv.endMin !== undefined && iv.endMin <= iv.startMin) p.onUpdate(iv.id, { endMin: iv.startMin + STEP });
  };
  const remove = (iv: DrawnIntervention, index: number) => {
    setRemoved({ item: iv, index });
    p.onRemove(iv.id);
  };
  return (
    <div className="decision">
      {p.items.length === 0 ? (
        <div className="decision-empty">
          <b>Sem ações (deixar arder)</b>
          <p className="hint">O fogo propaga-se livremente. É a base de comparação.</p>
        </div>
      ) : (
        <ul className="actions">
          {p.items.map((iv, index) => {
            const tool = TOOLS.find((t) => t.kind === iv.kind)!;
            const label = KIND_LABEL[iv.kind];
            const hasWidth = (iv.kind === "containmentLine" || iv.kind === "backfire") && p.defaultLineWidthM !== undefined;
            return (
              <li key={iv.id} className={`action dec-${p.decision}`}>
                <span className="action-icon">
                  <Icon name={tool.icon} size={18} />
                </span>
                <span className="action-text">
                  <b>{label}</b>
                  {p.assistantIds?.has(iv.id) && (
                    <span className="by-assistant" title="Colocada pelo assistente">
                      <Icon name="spark" size={12} /> assistente
                    </span>
                  )}
                  <details className="action-effect">
                    <summary>
                      Efeito no fogo
                      <Icon name="chevron" size={14} />
                    </summary>
                    <small>{tool.effect}</small>
                  </details>
                </span>
                <span className="action-start">
                  <span>{iv.kind === "aerialDrop" ? "Descarga aos" : iv.kind === "backfire" ? "Aceso aos" : "Começa aos"}</span>
                  {p.readOnly ? (
                    <span>{iv.startMin} min</span>
                  ) : (
                    <Stepper label={`Início de ${label}, em minutos`} value={iv.startMin} min={0} onChange={(v) => setStart(iv, v)} />
                  )}
                </span>
                <span className="action-end">
                  <span>{iv.kind === "aerialDrop" ? "Efeito até" : "Acaba aos"}</span>
                  {p.readOnly ? (
                    <span>{iv.endMin === undefined ? "sem fim" : `${iv.endMin} min`}</span>
                  ) : iv.endMin === undefined ? (
                    <>
                      <span>sem fim</span>
                      <button className="link" onClick={() => p.onUpdate(iv.id, { endMin: iv.startMin + 60 })}>
                        Definir fim
                      </button>
                    </>
                  ) : (
                    <>
                      <Stepper
                        label={`Fim de ${label}, em minutos`}
                        value={iv.endMin}
                        min={iv.startMin + STEP}
                        onChange={(v) => setEnd(iv, v)}
                        onBlur={() => fixEnd(iv)}
                      />
                      {iv.kind !== "aerialDrop" && (
                        <button className="icon-btn" aria-label={`Retirar o fim de ${label}`} title="Sem fim" onClick={() => p.onUpdate(iv.id, { endMin: undefined })}>
                          <Icon name="close" size={16} />
                        </button>
                      )}
                      {iv.endMin <= iv.startMin && <span className="warn">O fim tem de ser depois do início.</span>}
                    </>
                  )}
                </span>
                {p.readOnly && iv.kind === "aerialDrop" && (
                  <span className="action-width">Agente: {AGENTS.find((a) => a.value === (iv.agent ?? "water"))!.label}</span>
                )}
                {p.readOnly && hasWidth && (
                  <span className="action-width">Largura: {widthLabel(iv.widthM ?? p.defaultLineWidthM!)}</span>
                )}
                {!p.readOnly && iv.kind === "aerialDrop" && (
                  <label className="action-width">
                    Agente
                    <select
                      value={iv.agent ?? "water"}
                      title="Altera também o fim para a duração habitual deste agente"
                      onChange={(e) => {
                        const agent = e.target.value as AerialAgent;
                        p.onUpdate(iv.id, { agent, endMin: iv.startMin + AERIAL_DEFAULT_MIN[agent] });
                      }}
                    >
                      {AGENTS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!p.readOnly && hasWidth && (
                  <label className="action-width">
                    Largura
                    <select
                      value={iv.widthM ?? p.defaultLineWidthM}
                      title="Chamas mais compridas do que a largura podem galgar a linha"
                      onChange={(e) => p.onUpdate(iv.id, { widthM: Number(e.target.value) })}
                    >
                      {[...new Set([...LINE_WIDTHS.map((w) => w.m), iv.widthM ?? p.defaultLineWidthM!])]
                        .sort((a, b) => a - b)
                        .map((m) => (
                          <option key={m} value={m}>
                            {widthLabel(m)}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {!p.readOnly && (
                  <button className="icon-btn" aria-label={`Apagar ${label}`} title="Apagar" onClick={() => remove(iv, index)}>
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.readOnly ? (
        p.variantName && <p className="hint">Corre na variante de grelha "{p.variantName}".</p>
      ) : (
        <>
          {p.onRestore && (
            <p className="decision-status" role="status">
              {removed && (
                <>
                  <span>Ação removida ({KIND_LABEL[removed.item.kind]}).</span>
                  <button
                    className="link"
                    onClick={() => {
                      p.onRestore!(removed.item, removed.index);
                      setRemoved(null);
                    }}
                  >
                    <Icon name="undo" size={16} />
                    Desfazer
                  </button>
                </>
              )}
            </p>
          )}
          <h3 className="field-label">Adicionar ação à decisão {p.decision}</h3>
          <div className="add-actions">
            {TOOLS.map((t) => (
              <button key={t.kind} className={`add-action dec-${p.decision}`} title={t.summary} onClick={() => p.onPickTool(t.kind)}>
                <Icon name={t.icon} size={18} />
                <span>
                  <b>{KIND_LABEL[t.kind]}</b>
                  <small>{t.summary}</small>
                </span>
              </button>
            ))}
          </div>
          <details className="disclosure decision-more">
            <summary>
              Mais opções da decisão
              {p.variantName && <span className="variant-badge">Variante: {p.variantName}</span>}
            </summary>
            {p.children}
            {p.items.length > 1 && (
              <>
                <button
                  className={`link ${confirmClear ? "danger-text" : ""}`}
                  onClick={() => {
                    if (!confirmClear) return setConfirmClear(true);
                    setConfirmClear(false);
                    p.onClear();
                  }}
                  onBlur={() => setConfirmClear(false)}
                >
                  {confirmClear ? "Confirmar: apagar todas as ações" : "Apagar todas as ações"}
                </button>
                <p className="decision-status" role="status">
                  {confirmClear && "Carregar outra vez para confirmar."}
                </p>
              </>
            )}
          </details>
        </>
      )}
    </div>
  );
}
