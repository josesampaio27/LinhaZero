import type { Metrics, PairedComparison } from "@linha-zero/engine";
import { formatMinutes } from "./TimeBar";

interface Props {
  a: Metrics;
  b: Metrics;
  durationMin: number;
  /** Hectares with burn probability >= 50%, when an ensemble was run. */
  likelyHa?: { a: number; b: number };
  /** likelyHa is the expected burned area (Σ probability × area), not the area with ≥ 50% of runs. */
  likelyIsExpected?: boolean;
  /** Run-by-run comparison of the two ensembles, when one was run. */
  paired?: { buildings: PairedComparison; ha: PairedComparison };
  stale: boolean;
  /** Action count per decision; 0 reads "sem ações (deixar arder)". */
  actions?: { A: number; B: number };
  /** Run telemetry, shown at the bottom of the full table. */
  note?: string;
}

const MAX_VILLAGES = 10;
const MAX_HEADLINE_NAMES = 3;

const fmtHa = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} ha`;
const fmtInt = (v: number) => Math.round(v).toLocaleString("pt-PT");

/** Who wins run by run, e.g. "B é melhor em 27 de 30 cenários"; winner is null without a clear one. */
function verdict(c: PairedComparison): { text: string; winner: Winner } {
  if (c.ties * 2 > c.runs) {
    let rest = "";
    if (c.aBetter === 0 && c.bBetter > 0) rest = "; B é melhor nos restantes";
    else if (c.bBetter === 0 && c.aBetter > 0) rest = "; A é melhor nos restantes";
    return { text: `sem diferença em ${c.ties} de ${c.runs} cenários${rest}`, winner: null };
  }
  if (c.bBetter === c.aBetter) {
    return { text: `sem vencedor claro: cada decisão é melhor em ${c.bBetter} de ${c.runs} cenários`, winner: null };
  }
  const winner = c.bBetter > c.aBetter ? "B" : "A";
  return { text: `${winner} é melhor em ${Math.max(c.bBetter, c.aBetter)} de ${c.runs} cenários`, winner };
}

/** Signed difference B - A where lower is better, as text and a good/bad class. */
function lowerIsBetter(a: number, b: number, unit: (v: number) => string) {
  const d = b - a;
  // Round the magnitude so +0.5 and -0.5 look alike (Math.round(-0.5) is 0, Math.round(0.5) is 1).
  if (Math.round(Math.abs(d)) === 0) return { text: "=", cls: "" };
  return { text: `${d > 0 ? "+" : "−"}${unit(Math.abs(d))}`, cls: d < 0 ? "good" : "bad" };
}

function arrivalDiff(a: number | null, b: number | null) {
  if (a === null && b === null) return { text: "=", cls: "" };
  if (a !== null && b === null) return { text: "B salva", cls: "good" };
  if (a === null && b !== null) return { text: "A salva", cls: "bad" };
  const d = b! - a!;
  if (Math.abs(d) < 1) return { text: "=", cls: "" };
  return { text: `${d > 0 ? "+" : "−"}${formatMinutes(Math.abs(d))}`, cls: d > 0 ? "good" : "bad" };
}

type Winner = "A" | "B" | null;
type Side = "A" | "B";

/** "1 ação", "3 ações", or "sem ações (deixar arder)" when the decision has no actions. */
function actionLabel(n: number, short = false): string {
  if (n === 0) return short ? "deixar arder" : "sem ações (deixar arder)";
  return `${fmtInt(n)} ${n === 1 ? "ação" : "ações"}`;
}

/** "com 1 ação" / "com 3 ações", but "sem ações (deixar arder)" with no "com". */
const withActions = (n: number) => (n > 0 ? `com ${actionLabel(n)}` : actionLabel(n));

export interface Summary {
  /**
   * Overall pick: the decision every message favours; "tradeoff" when each is better on something;
   * "split" when the single run and the scenarios disagree; "none" when nothing differs;
   * "same" when neither decision has actions.
   */
  pick: Side | "tradeoff" | "split" | "none" | "same";
  title: string;
  /** "A com 2 ações vs. B sem ações (deixar arder)", when action counts are known. */
  meta?: string;
  /** One sentence with the building and area difference ("" when there is nothing to compare). */
  sentence: string;
  /** Run-by-run verdicts, one per metric, when an ensemble was run. */
  confidence: string[];
  /** Places one decision keeps the fire away from. */
  places: { text: string; winner: Side }[];
}

/** Verdict wording. With an ensemble, a run-by-run verdict that contradicts the single run makes it "split". */
export function headline(
  a: Metrics, b: Metrics, durationMin: number, paired?: Props["paired"], actions?: Props["actions"],
): Summary {
  if (actions && actions.A === 0 && actions.B === 0) {
    return { pick: "same", title: "Sem ações em nenhuma decisão: os resultados são iguais", sentence: "", confidence: [], places: [] };
  }
  const meta = actions && `A ${withActions(actions.A)} vs. B ${withActions(actions.B)}`;
  const winners: Winner[] = [];
  const verdicts: { label: string; v: { text: string; winner: Winner }; base: Winner }[] = [];
  let split = false;
  // winner comes from the single (unperturbed) run; the scenarios' verdict wins when it has one.
  const withVerdict = (label: string, winner: Winner, c?: PairedComparison) => {
    if (!c) return winners.push(winner);
    const v = verdict(c);
    verdicts.push({ label, v, base: winner });
    if (v.winner && winner && v.winner !== winner) split = true;
    else winners.push(v.winner ?? winner);
  };
  const db = a.buildingsReached - b.buildingsReached;
  const dbWinner = db > 0 ? "B" : db < 0 ? "A" : null;
  const nb = Math.abs(db);
  const dbText = dbWinner ? `${dbWinner} poupa ${fmtInt(nb)} edifício${nb === 1 ? "" : "s"}` : "Mesmos edifícios atingidos";
  withVerdict("Edifícios", dbWinner, paired?.buildings);
  const last = a.burnedHaByHour.length - 1;
  const dh = a.burnedHaByHour[last] - b.burnedHaByHour[last];
  const dhWinner = Math.abs(dh) < 1 ? null : dh > 0 ? "B" : "A";
  const dhText = dhWinner
    ? `${dhWinner} queima menos ${fmtHa(Math.abs(dh))} ao fim de ${formatMinutes(durationMin)}`
    : "mesma área ardida";
  withVerdict("Área ardida", dhWinner, paired?.ha);
  // One line per decision, however many places it spares (real grids have dozens).
  const places: Summary["places"] = [];
  const spared = sparedBy(b, a);
  if (spared.length) places.push({ text: `B impede o fogo de chegar a ${nameList(spared)}`, winner: "B" });
  const lost = sparedBy(a, b);
  if (lost.length) places.push({ text: `A impede o fogo de chegar a ${nameList(lost)}`, winner: "A" });
  const distinct = [...new Set([...winners, ...places.map((p) => p.winner)].filter((w) => w !== null))];
  const pick: Summary["pick"] = split ? "split" : distinct.length > 1 ? "tradeoff" : (distinct[0] ?? "none");
  const title =
    pick === "A" || pick === "B" ? `A decisão ${pick} é melhor`
    : pick === "split" ? "Resultado incerto"
    : pick === "tradeoff" ? "Depende do critério"
    : "Sem diferença relevante";
  // "B é melhor em 24 de 30" reads "melhor em 24 de 30" next to a B chip.
  const confidence = verdicts.map(({ label, v, base }) => {
    if (v.winner && base && v.winner !== base) {
      return `${label}: a simulação de referência favorece ${base}, mas nos cenários ${v.text}`;
    }
    return `${label}: ${v.winner && v.winner === pick ? v.text.replace(`${v.winner} é melhor`, "melhor") : v.text}`;
  });
  return { pick, title, meta, sentence: `${dbText}; ${dhText}.`, confidence, places };
}

/** Places the fire reaches with `other` but not with `by`, the earliest reached first. */
function sparedBy(by: Metrics, other: Metrics): string[] {
  return other.villages
    .filter((v, i) => v.firstArrivalMin !== null && by.villages[i].firstArrivalMin === null)
    .sort((x, y) => x.firstArrivalMin! - y.firstArrivalMin!)
    .map((v) => v.name);
}

/** "X", "X e Y", "X, Y e Z", or the first MAX_HEADLINE_NAMES names and how many more. */
function nameList(names: string[]): string {
  const extra = names.length - MAX_HEADLINE_NAMES;
  if (extra > 0) {
    return `${names.slice(0, MAX_HEADLINE_NAMES).join(", ")} e mais ${extra} ${extra === 1 ? "lugar" : "lugares"}`;
  }
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Run-by-run rows: how many scenarios each decision wins, and the typical B - A difference. */
function PairedRows({ c, what, unit }: { c: PairedComparison; what: string; unit: (v: number) => string }) {
  // Gains are A - B, so in the B - A column they flip sign and the interval ends swap.
  const mid = lowerIsBetter(0, -c.medianGain, unit);
  // Interval ends are plain signed numbers ("=" is only for the whole cell).
  const end = (v: number) => (Math.round(Math.abs(v)) === 0 ? "0" : `${v > 0 ? "+" : "−"}${fmtInt(Math.abs(v))}`);
  if (c.ties === c.runs) {
    return (
      <tr>
        <td>Cenários ({what})</td>
        <td colSpan={3} className="num note">{`Sem diferença em ${fmtInt(c.runs)} cenários`}</td>
      </tr>
    );
  }
  const range = end(-c.highGain) === "0" && end(-c.lowGain) === "0" ? null : `(${end(-c.highGain)} a ${end(-c.lowGain)})`;
  return (
    <>
      <tr>
        <td>Cenários em que é melhor ({what})</td>
        <td className="num">{`${fmtInt(c.aBetter)} de ${fmtInt(c.runs)}`}</td>
        <td className="num">{`${fmtInt(c.bBetter)} de ${fmtInt(c.runs)}`}</td>
        <td className="num note">{c.ties > 0 && `${c.ties} sem diferença`}</td>
      </tr>
      <tr>
        <td title="Mediana das diferenças B − A, corrida a corrida; entre parênteses, o intervalo onde caem 80% dos cenários">
          Diferença típica por cenário ({what})
        </td>
        <td />
        <td />
        <td className={`num ${mid.cls}`}>
          {mid.text} {range && <small className="range">{range}</small>}
        </td>
      </tr>
    </>
  );
}

const COMPACT_VILLAGES = 3;
const fmtArrival = (m: number | null) => (m === null ? "não atingida" : formatMinutes(m));

function Head({ actions }: { actions?: Props["actions"] }) {
  return (
    <thead>
      <tr>
        <th />
        {(["A", "B"] as const).map((d) => (
          <th key={d} className={`col-${d.toLowerCase()}`} aria-label={`Decisão ${d}`} title={`Decisão ${d}`}>
            <span className={`letter dec-${d}`}>{d}</span>
            {actions && <span className="col-label">{actionLabel(actions[d], true)}</span>}
          </th>
        ))}
        <th className="col-diff" aria-label="Diferença (B − A)" title="Diferença (B − A)">
          B − A
        </th>
      </tr>
    </thead>
  );
}

function Row({ label, a, b, d, title, strong }: {
  label: string; a: string; b: string; d: { text: string; cls: string }; title?: string; strong?: boolean;
}) {
  return (
    <tr className={strong ? "strong" : undefined}>
      <td title={title}>{label}</td>
      <td className="num">{a}</td>
      <td className="num">{b}</td>
      <td className={`num ${d.cls}`}>{d.text}</td>
    </tr>
  );
}

/** Side-by-side impact metrics for decisions A and B: a verdict, a compact table, and the full table on demand. */
export function ComparisonPanel({ a, b, durationMin, likelyHa, likelyIsExpected, paired, stale, actions, note }: Props) {
  const hours = a.burnedHaByHour.length;
  const sum = headline(a, b, durationMin, paired, actions);
  const expectedInCompact = !!(likelyHa && likelyIsExpected);
  // The compact table already shows the final hour unless the expected area takes its place.
  const shown = [...new Set([1, 2, 4, hours])].filter((h) => h < hours || (h === hours && expectedInCompact));
  // Only villages the fire reaches in A or B, earliest first (real grids have dozens of places).
  const first = (v: { firstArrivalMin: number | null }) => v.firstArrivalMin ?? Infinity;
  const allPairs = a.villages.map((va, i) => ({ va, vb: b.villages[i] }));
  const reachedAll = allPairs
    .filter(({ va, vb }) => va.firstArrivalMin !== null || vb.firstArrivalMin !== null)
    .sort((x, y) => Math.min(first(x.va), first(x.vb)) - Math.min(first(y.va), first(y.vb)));
  const reached = reachedAll.slice(0, MAX_VILLAGES);
  const untouched = allPairs.length - reachedAll.length;
  const likelyRow = likelyHa && (
    <Row
      label={likelyIsExpected ? "Área ardida esperada" : "Área com probabilidade ≥ 50%"}
      title={likelyIsExpected ? "Soma da probabilidade de arder de cada célula, sem combate além do desenhado" : undefined}
      a={fmtHa(likelyHa.a)}
      b={fmtHa(likelyHa.b)}
      d={lowerIsBetter(likelyHa.a, likelyHa.b, fmtHa)}
    />
  );
  const hourRow = (h: number) => (
    <Row
      key={`h${h}`}
      // The last entry is at durationMin (e.g. 6 h 30 min), not at a full hour.
      label={`Área ardida ao fim de ${h * 60 >= durationMin ? formatMinutes(durationMin) : `${h} h`}`}
      a={fmtHa(a.burnedHaByHour[h - 1])}
      b={fmtHa(b.burnedHaByHour[h - 1])}
      d={lowerIsBetter(a.burnedHaByHour[h - 1], b.burnedHaByHour[h - 1], fmtHa)}
    />
  );
  const villageRows = (list: typeof reached) =>
    list.map(({ va, vb }) => (
      <Row
        key={va.id}
        label={`Chegada a ${va.name}`}
        a={fmtArrival(va.firstArrivalMin)}
        b={fmtArrival(vb.firstArrivalMin)}
        d={arrivalDiff(va.firstArrivalMin, vb.firstArrivalMin)}
      />
    ));
  return (
    <div className={`comparison ${stale ? "stale" : ""}`}>
      <section className={`verdict ${sum.pick === "A" || sum.pick === "B" ? `win-${sum.pick}` : ""}`} aria-label="Resultado">
        <div className="verdict-pick">
          {(sum.pick === "A" || sum.pick === "B" ? [sum.pick] : sum.pick === "tradeoff" ? (["A", "B"] as const) : []).map((d) => (
            <span key={d} className={`letter verdict-letter dec-${d}`} aria-hidden="true">{d}</span>
          ))}
          <div>
            <p className="verdict-title">{sum.title}</p>
            {sum.meta && <p className="verdict-meta">{sum.meta}</p>}
          </div>
        </div>
        {sum.sentence && <p className="verdict-sentence">{sum.sentence}</p>}
        {sum.confidence.length > 0 && <p className="verdict-meta">{sum.confidence.join(" · ")}</p>}
        {sum.places.map((p) => (
          <p key={p.text} className={`verdict-place win-${p.winner}`}>{p.text}</p>
        ))}
      </section>
      <table>
        <Head actions={actions} />
        <tbody>
          {expectedInCompact ? likelyRow : hourRow(hours)}
          <Row
            strong
            label={`Edifícios atingidos (${formatMinutes(durationMin)})`}
            a={fmtInt(a.buildingsReached)}
            b={fmtInt(b.buildingsReached)}
            d={lowerIsBetter(a.buildingsReached, b.buildingsReached, fmtInt)}
          />
          {villageRows(reached.slice(0, COMPACT_VILLAGES))}
        </tbody>
      </table>
      <details className="disclosure">
        <summary>Ver tabela completa</summary>
        <table>
          <Head actions={actions} />
          <tbody>
            {shown.map(hourRow)}
            {!expectedInCompact && likelyRow}
            {paired && <PairedRows c={paired.ha} what="área ardida" unit={fmtHa} />}
            {paired && <PairedRows c={paired.buildings} what="edifícios" unit={fmtInt} />}
            {villageRows(reached.slice(COMPACT_VILLAGES))}
            {(untouched > 0 || reachedAll.length > reached.length) && (
              <tr>
                <td colSpan={4} className="note">
                  {reachedAll.length > reached.length && `Mais ${reachedAll.length - reached.length} lugares atingidos não listados. `}
                  {untouched > 0 && `${untouched} ${untouched === 1 ? "lugar não é atingido" : "lugares não são atingidos"} em nenhuma das decisões.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {note && <p className="hint">{note}</p>}
      </details>
    </div>
  );
}
