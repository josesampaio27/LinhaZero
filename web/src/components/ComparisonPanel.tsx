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

/** Main messages and who each one favours. With an ensemble, each one says in how many wind scenarios the same decision wins. */
function headline(a: Metrics, b: Metrics, paired?: Props["paired"]): { text: string; winner: Winner }[] {
  const out: { text: string; winner: Winner }[] = [];
  // text and winner come from the unperturbed run; with an ensemble, the run-by-run verdict is appended.
  const withVerdict = (text: string, winner: Winner, c?: PairedComparison) => {
    if (!c) {
      if (winner) out.push({ text, winner });
      return;
    }
    if (!winner && c.ties === c.runs) return; // no difference in any run
    const v = verdict(c);
    const split = !!(v.winner && winner && v.winner !== winner);
    out.push({ text: `${text} ${split ? "· mas" : "·"} ${v.text}`, winner: split ? null : (v.winner ?? winner) });
  };
  const db = a.buildingsReached - b.buildingsReached;
  const dbWinner = db > 0 ? "B" : db < 0 ? "A" : null;
  const nb = Math.abs(db);
  const dbText = dbWinner ? `${dbWinner} poupa ${fmtInt(nb)} edifício${nb === 1 ? "" : "s"}` : "Mesmos edifícios atingidos";
  withVerdict(dbText, dbWinner, paired?.buildings);
  const last = a.burnedHaByHour.length - 1;
  const dh = a.burnedHaByHour[last] - b.burnedHaByHour[last];
  const dhWinner = Math.abs(dh) < 1 ? null : dh > 0 ? "B" : "A";
  const dhText = dhWinner ? `${dhWinner} arde menos ${fmtHa(Math.abs(dh))} ao fim de ${last + 1} h` : "Mesma área ardida";
  withVerdict(dhText, dhWinner, paired?.ha);
  // One line per decision, however many places it spares (real grids have dozens).
  const spared = sparedBy(b, a);
  if (spared.length) out.push({ text: `B impede o fogo de chegar a ${nameList(spared)}`, winner: "B" });
  const lost = sparedBy(a, b);
  if (lost.length) out.push({ text: `A impede o fogo de chegar a ${nameList(lost)}`, winner: "A" });
  return out.length ? out : [{ text: "Sem diferença relevante entre as duas decisões", winner: null }];
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
  return (
    <>
      <tr>
        <td>Cenários em que é melhor ({what})</td>
        <td>{`${c.aBetter} de ${c.runs}`}</td>
        <td>{`${c.bBetter} de ${c.runs}`}</td>
        <td className="note">{c.ties > 0 && `${c.ties} sem diferença`}</td>
      </tr>
      <tr>
        <td title="Mediana das diferenças B − A, corrida a corrida; entre parênteses, o intervalo onde caem 80% dos cenários">
          Diferença típica por cenário ({what})
        </td>
        <td />
        <td />
        <td className={mid.cls}>
          {mid.text} <small>({end(-c.highGain)} a {end(-c.lowGain)})</small>
        </td>
      </tr>
    </>
  );
}

/** Side-by-side impact metrics for decisions A and B, with the difference highlighted. */
export function ComparisonPanel({ a, b, durationMin, likelyHa, likelyIsExpected, paired, stale }: Props) {
  const hours = a.burnedHaByHour.length;
  const shown = [...new Set([1, 2, 4, hours].filter((h) => h <= hours))];
  // Only villages the fire reaches in A or B, earliest first (real grids have dozens of places).
  const first = (v: { firstArrivalMin: number | null }) => v.firstArrivalMin ?? Infinity;
  const allPairs = a.villages.map((va, i) => ({ va, vb: b.villages[i] }));
  const reachedAll = allPairs
    .filter(({ va, vb }) => va.firstArrivalMin !== null || vb.firstArrivalMin !== null)
    .sort((x, y) => Math.min(first(x.va), first(x.vb)) - Math.min(first(y.va), first(y.vb)));
  const reached = reachedAll.slice(0, MAX_VILLAGES);
  const untouched = allPairs.length - reachedAll.length;
  return (
    <div className={`comparison ${stale ? "stale" : ""}`}>
      <div className="headline">
        {headline(a, b, paired).map((h) => (
          <span key={h.text} className={h.winner ? `win-${h.winner}` : ""}>
            {h.text}
          </span>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th />
            {/* Short headers: the full words do not fit the 400 px panel next to the numbers. */}
            <th className="col-a" aria-label="Decisão A" title="Decisão A">
              <span className="letter dec-A">A</span>
            </th>
            <th className="col-b" aria-label="Decisão B" title="Decisão B">
              <span className="letter dec-B">B</span>
            </th>
            <th className="col-diff" aria-label="Diferença (B − A)" title="Diferença (B − A)">
              B − A
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((h) => {
            const d = lowerIsBetter(a.burnedHaByHour[h - 1], b.burnedHaByHour[h - 1], fmtHa);
            return (
              <tr key={`h${h}`}>
                <td>Área ardida às {h} h</td>
                <td>{fmtHa(a.burnedHaByHour[h - 1])}</td>
                <td>{fmtHa(b.burnedHaByHour[h - 1])}</td>
                <td className={d.cls}>{d.text}</td>
              </tr>
            );
          })}
          {likelyHa && (
            <tr>
              <td
                title={
                  likelyIsExpected
                    ? "Soma da probabilidade de arder de cada célula, sem combate além do desenhado"
                    : undefined
                }
              >
                {likelyIsExpected ? "Área ardida esperada" : "Área com probabilidade ≥ 50%"}
              </td>
              <td>{fmtHa(likelyHa.a)}</td>
              <td>{fmtHa(likelyHa.b)}</td>
              <td className={lowerIsBetter(likelyHa.a, likelyHa.b, fmtHa).cls}>{lowerIsBetter(likelyHa.a, likelyHa.b, fmtHa).text}</td>
            </tr>
          )}
          {paired && <PairedRows c={paired.ha} what="área ardida" unit={fmtHa} />}
          <tr className="strong">
            <td>Edifícios atingidos ({formatMinutes(durationMin)})</td>
            <td>{fmtInt(a.buildingsReached)}</td>
            <td>{fmtInt(b.buildingsReached)}</td>
            <td className={lowerIsBetter(a.buildingsReached, b.buildingsReached, fmtInt).cls}>
              {lowerIsBetter(a.buildingsReached, b.buildingsReached, fmtInt).text}
            </td>
          </tr>
          {paired && <PairedRows c={paired.buildings} what="edifícios" unit={fmtInt} />}
          {reached.map(({ va, vb }) => {
            const d = arrivalDiff(va.firstArrivalMin, vb.firstArrivalMin);
            const fmt = (m: number | null) => (m === null ? "não atingida" : formatMinutes(m));
            return (
              <tr key={va.id}>
                <td>Chegada a {va.name}</td>
                <td>{fmt(va.firstArrivalMin)}</td>
                <td>{fmt(vb.firstArrivalMin)}</td>
                <td className={d.cls}>{d.text}</td>
              </tr>
            );
          })}
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
    </div>
  );
}
