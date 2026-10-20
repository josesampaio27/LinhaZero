// The interface's scenario panel at true size, one step further along at each stage of "Como funciona": the
// ignition marked, the weather in, both decisions drawn, the two maps running, the comparison written. The
// comparison is shown as the templates the interface fills in, not as one scenario's numbers.
export type Stage = 1 | 2 | 3 | 4 | 5;

const Slot = ({ children }: { children: React.ReactNode }) => <span className="slot">{children}</span>;

export function ScenarioCard({ stage }: { stage: Stage }) {
  const row = (k: React.ReactNode, v: React.ReactNode, at: Stage, empty = false) => (
    <div className={`row${stage === at ? " on" : ""}`}>
      <span className="k">{k}</span>
      <span className={`v${empty ? " empty" : ""}`}>{v}</span>
    </div>
  );
  return (
    <div data-ui className="panel" aria-hidden="true">
      <div className="head">
        <b>Cenário na Penha</b>
        <span>Guimarães</span>
      </div>
      <div className="body">
        {row("Ignição", <><i className="pin" />41,423 N, 8,276 O</>, 1)}
        {stage === 1 ? (
          <>
            {row("Vento", "por preencher", 0 as Stage, true)}
            {row("Humidade do mato", "por preencher", 0 as Stage, true)}
            <span className="go ghost">Usar o tempo do IPMA</span>
          </>
        ) : (
          <>
            {row("Vento", "de sudoeste, 9 m/s", 2)}
            {row("Humidade do mato", "4 %", 2)}
          </>
        )}
        {stage === 2 && (
          <>
            {row(<span className="tag a">A</span>, "por desenhar", 0 as Stage, true)}
            {row(<span className="tag b">B</span>, "por desenhar", 0 as Stage, true)}
          </>
        )}
        {stage >= 3 && (
          <>
            {row(<span className="tag a">A</span>, "Linha de contenção, pronta aos 45 min", 3)}
            {row(<span className="tag b">B</span>, "Ataque direto à cabeça, aos 30 min", 3)}
          </>
        )}
        {stage === 3 && <span className="go">Simular 4 horas</span>}
        {stage >= 4 && (
          <div className="maps">
            <img src="/hero/hero.webp" alt="" width={900} height={563} loading="lazy" decoding="async" />
            <span className="map-title left-1.5 border-decision-a">A</span>
            <span className="map-title right-1.5 border-decision-b">B</span>
          </div>
        )}
        {stage === 4 && (
          <div className="time" style={{ "--t": "62%" } as React.CSSProperties}>
            <span>2h30</span><span /><span>4h00</span>
          </div>
        )}
        {stage === 5 && (
          <>
            <p className="say win-B">B protege <Slot>X</Slot> edifícios a mais do que a A</p>
            <p className="say win-B">Com a A, o fogo chega a <Slot>aldeia</Slot> às <Slot>hh:mm</Slot></p>
            <p className="say win-B">B é melhor em <Slot>N</Slot> de 30 variações do vento</p>
          </>
        )}
      </div>
    </div>
  );
}
