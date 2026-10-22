import { describe, expect, it } from "vitest";
import type { Metrics, PairedComparison } from "@linha-zero/engine";
import { headline } from "../src/components/ComparisonPanel";

const m = (ha: number, buildings: number): Metrics => ({ burnedHaByHour: [ha / 2, ha], buildingsReached: buildings, villages: [] });
const paired = (bBetter: number, aBetter: number): PairedComparison => ({
  runs: 30, bBetter, aBetter, ties: 30 - bBetter - aBetter, lowGain: 0, medianGain: 0, highGain: 0,
});

describe("headline", () => {
  it.each([
    [0, 3, "A sem ações (deixar arder) vs. B com 3 ações"],
    [3, 0, "A com 3 ações vs. B sem ações (deixar arder)"],
    [1, 2, "A com 1 ação vs. B com 2 ações"],
    [2, 1, "A com 2 ações vs. B com 1 ação"],
  ])("action line for %i vs %i", (A, B, text) => {
    expect(headline(m(100, 5), m(50, 2), 390, undefined, { A, B }).meta).toBe(text);
  });

  it("says plainly when neither decision has actions", () => {
    const s = headline(m(100, 5), m(100, 5), 390, undefined, { A: 0, B: 0 });
    expect(s.pick).toBe("same");
    expect(s.title).toBe("Sem ações em nenhuma decisão: os resultados são iguais");
    expect(s.sentence).toBe("");
  });

  it("shows a trade-off when each decision wins a metric", () => {
    const s = headline(m(100, 2), m(50, 5), 390, undefined, { A: 1, B: 1 });
    expect(s.pick).toBe("tradeoff");
    expect(s.title).toBe("Depende do critério");
    expect(s.sentence).toBe("A poupa 3 edifícios; B queima menos 50 ha ao fim de 6 h 30 min.");
  });

  it("keeps 'Sem diferença relevante' when nothing differs", () => {
    const s = headline(m(100, 5), m(100, 5), 390, undefined, { A: 1, B: 1 });
    expect(s.pick).toBe("none");
    expect(s.title).toBe("Sem diferença relevante");
  });

  it("names a clear winner", () => {
    expect(headline(m(100, 5), m(50, 2), 390).title).toBe("A decisão B é melhor");
  });

  it("says when the single run and the scenarios disagree", () => {
    // Single run: B saves buildings; scenarios: A is better in 20 of 30.
    const s = headline(m(100, 5), m(100, 2), 390, { buildings: paired(5, 20), ha: paired(0, 0) });
    expect(s.pick).toBe("split");
    expect(s.title).toBe("Resultado incerto");
    expect(s.confidence[0]).toBe("Edifícios: a simulação de referência favorece B, mas nos cenários A é melhor em 20 de 30 cenários");
  });
});
