import { useEffect, useState } from "react";
import type { DecisionId, DrawnIntervention, InterventionKind } from "@linha-zero/engine";
import { KIND_LABEL } from "../lib/scenario";
import { Icon, type IconName } from "./Icon";

interface Props {
  decision: DecisionId;
  items: DrawnIntervention[];
  onPickTool: (kind: InterventionKind) => void;
  onUpdate: (id: string, patch: Partial<DrawnIntervention>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Shown before the actions, e.g. the grid this decision runs on. */
  children?: React.ReactNode;
  /** Width (m) of lines that do not set their own; when given, lines show a width choice (Rothermel model). */
  defaultLineWidthM?: number;
}

/** Typical containment line widths: hand line, machine line, fuel breaks. */
const LINE_WIDTHS: { m: number; label: string }[] = [
  { m: 1, label: "1 m · manual" },
  { m: 4, label: "4 m · máquina" },
  { m: 10, label: "10 m · faixa" },
  { m: 25, label: "25 m · faixa larga" },
];

/**
 * What each action stands for on the ground and what the engine does with it (Rothermel model:
 * engine/src/spread-rothermel.ts, params.ts). Flame lengths are Byram's for the attack thresholds
 * (500 kW/m ≈ 1.4 m, 4000 kW/m ≈ 3.5 m); a line holds in the deterministic run when it is at least 5
 * times as wide as the flames are long (holdWidthPerFlame of PT_CALIBRATION). Update these if they change.
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
      "A partir do minuto em que fica pronta, o fogo para na linha se ela for pelo menos 5 vezes mais larga do que as chamas são compridas, porque o calor e as faúlhas passam faixas mais largas do que a chama. Uma linha de 4 m só trava chamas até 80 cm; uma faixa de 25 m trava chamas até 5 m. Se o fogo lá chegar antes de ela estar pronta, passa.",
    where: "Desenha-a onde os meios a abririam, entre o fogo e o que queres proteger.",
  },
  {
    kind: "suppression",
    icon: "attack",
    summary: "Meios a combater o fogo numa zona",
    effect: "O fogo anda 5 vezes mais devagar na zona, menos se as chamas forem altas",
    meaning: "Meios a combater o fogo diretamente, com água, ferramentas ou máquinas, na cabeça ou num flanco.",
    rule:
      "A partir do minuto em que os meios chegam, o fogo nessa zona anda 5 vezes mais devagar. Atrasa o fogo, não o apaga. Com chamas acima de 1,4 m perde efeito, e acima de 3,5 m já não tem nenhum.",
    where: "Desenha a zona onde os meios vão trabalhar.",
  },
  {
    kind: "protectZone",
    icon: "shield",
    summary: "Meios à espera do fogo junto às casas",
    effect: "O fogo anda 10 vezes mais devagar na zona, menos se as chamas forem altas",
    meaning:
      "Meios já colocados junto a casas ou a uma aldeia, à espera do fogo para o travar ali. Têm mais efeito do que um ataque, porque estão no sítio e preparados.",
    rule:
      "A partir do minuto em que lá estão, o fogo nessa zona anda 10 vezes mais devagar. Com chamas acima de 1,4 m perde efeito, e acima de 3,5 m já não tem nenhum.",
    where: "Desenha a zona à volta do que queres defender.",
  },
];

const STEP = 5;

/** Actions of one decision: a card per action with its start minute, and the tools to add one. */
export function DecisionTools(p: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  // The second tap must come soon: touch browsers may never blur the button.
  useEffect(() => {
    if (!confirmClear) return;
    const t = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmClear]);
  const setStart = (iv: DrawnIntervention, v: number) => p.onUpdate(iv.id, { startMin: Math.max(0, Math.round(v)) });
  return (
    <div className="decision">
      {p.children}
      {p.items.length === 0 ? (
        <p className="hint">Sem ações: o fogo evolui livremente.</p>
      ) : (
        <ul className="actions">
          {p.items.map((iv) => {
            const tool = TOOLS.find((t) => t.kind === iv.kind)!;
            return (
              <li key={iv.id} className={`action dec-${p.decision}`}>
                <span className="action-icon">
                  <Icon name={tool.icon} size={18} />
                </span>
                <span className="action-text">
                  <b>{KIND_LABEL[iv.kind]}</b>
                  <small>{tool.effect}</small>
                </span>
                <span className="action-start">
                  Começa aos
                  <span className="stepper" role="group" aria-label={`Início de ${KIND_LABEL[iv.kind]}, em minutos`}>
                    <button aria-label="Mais cedo" disabled={iv.startMin <= 0} onClick={() => setStart(iv, iv.startMin - STEP)}>
                      <Icon name="minus" size={16} />
                    </button>
                    <label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={STEP}
                        value={iv.startMin}
                        aria-label="Minuto de início"
                        onChange={(e) => setStart(iv, Number(e.target.value))}
                      />
                      <span>min</span>
                    </label>
                    <button aria-label="Mais tarde" onClick={() => setStart(iv, iv.startMin + STEP)}>
                      <Icon name="plus" size={16} />
                    </button>
                  </span>
                </span>
                {iv.kind === "containmentLine" && p.defaultLineWidthM !== undefined && (
                  <label className="action-width">
                    Largura
                    <select
                      value={iv.widthM ?? p.defaultLineWidthM}
                      title="Chamas mais compridas do que a largura podem galgar a linha"
                      onChange={(e) => p.onUpdate(iv.id, { widthM: Number(e.target.value) })}
                    >
                      {[...new Set([...LINE_WIDTHS.map((w) => w.m), iv.widthM ?? p.defaultLineWidthM])]
                        .sort((a, b) => a - b)
                        .map((m) => (
                          <option key={m} value={m}>
                            {LINE_WIDTHS.find((w) => w.m === m)?.label ?? `${m} m`}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <button className="icon-btn" aria-label={`Apagar ${KIND_LABEL[iv.kind]}`} title="Apagar" onClick={() => p.onRemove(iv.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="field-label">Adicionar ação à decisão {p.decision}</p>
      <div className="add-actions">
        {TOOLS.map((t) => (
          <button key={t.kind} className={`add-action dec-${p.decision}`} onClick={() => p.onPickTool(t.kind)}>
            <Icon name={t.icon} size={18} />
            <span>
              <b>{KIND_LABEL[t.kind]}</b>
              <small>{t.summary}</small>
            </span>
          </button>
        ))}
      </div>
      {p.items.length > 1 && (
        <button
          className={`link ${confirmClear ? "danger-text" : ""}`}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            setConfirmClear(false);
            p.onClear();
          }}
          onBlur={() => setConfirmClear(false)}
        >
          {confirmClear ? "Toca outra vez para apagar todas" : "Apagar todas as ações"}
        </button>
      )}
    </div>
  );
}
