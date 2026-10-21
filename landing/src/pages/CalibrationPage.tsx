import { Article, Expert, Figure, References, Section } from "@/components/Article";
import { num, pct, SERIES_COLOR, times, type Series } from "@/components/charts/common";
import { DotPlot } from "@/components/charts/DotPlot";
import { FactorIntervals } from "@/components/charts/FactorIntervals";
import { ValidationBars } from "@/components/charts/ValidationBars";
import { CoverageWeights, IntervalRestart } from "@/components/diagrams/IntervalRestart";
import data from "@/data/site-data.json";
import { fireName } from "@/lib/fires";

const TOC: [string, string][] = [
  ["porque", "Porquê calibrar"],
  ["incendios", "Os incêndios reais"],
  ["combate", "O problema do combate"],
  ["pontuacao", "Como se pontua"],
  ["decisao", "Como se decide"],
  ["resultados", "Resultados na grelha de 100 m"],
  ["validacao", "Desde a ignição"],
  ["falta", "O que falta"],
  ["referencias", "Referências"],
];

type Version = "fitted" | "current" | "physical";
const VERSIONS: Series<Version>[] = [
  { key: "current", label: "Valores em uso", color: SERIES_COLOR.blue, shape: "diamond" },
  { key: "fitted", label: "Ajuste novo", color: SERIES_COLOR.orange, shape: "circle" },
  { key: "physical", label: "Modelo físico (sem calibrar)", color: SERIES_COLOR.aqua, shape: "square" },
];

const FACTORS: [keyof typeof data.coverage.quantiles, string, string][] = [
  ["rosAdjUnderstory", "Velocidade: sub-bosque", "Sub-bosque"],
  ["rosAdjShrub", "Velocidade: matos", "Matos"],
  ["rosAdjGrass", "Velocidade: herbáceas", "Herbáceas"],
  ["windAdj", "Vento a meia chama", "Vento"],
  ["holdWidthPerFlame", "Linhas: largura que segura (× chama)", "Linhas"],
  ["crownAdj", "Velocidade do fogo de copas", "Copas"],
];

const sign = (v: number) => `${v >= 0 ? "+" : "−"}${num(Math.abs(v), 3)}`;

export function CalibrationPage() {
  const c = data.coverage;
  const h = c.heldOut;
  const v = data.validation;
  const inc = c.incumbent as Record<string, number>;
  const inUse = (k: string) => (k.startsWith("rosAdj") ? (inc.rosAdj ?? 1) * (inc[k] ?? 1) : inc[k] ?? 1);
  const rows = c.perFire.map((r) => ({ label: fireName(r.fire), starred: r.seen, fitted: r.fitted, current: r.current, physical: r.physical }));
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lever = (name: string) => data.levers.find((l) => l.lever === name)!;
  const best = lever("best");
  return (
    <Article
      kicker="Calibração e validação"
      title="Como foi calibrado e posto à prova"
      lead="Como os fatores do motor foram ajustados a incêndios portugueses reais, porque é que isso exige cuidado com fogos que foram combatidos, e o que os resultados dizem."
      toc={TOC}
      next={{ href: "/motor", label: "Como funciona o motor" }}
    >
      <Section id="porque" title="Porquê calibrar">
        <p>
          A física do motor é a de modelos publicados e testados. Mas uma simulação não tem tudo o que um incêndio real tem: o
          vento vem de uma reanálise com células de 31 km, o combustível de um mapa de 100 m, as estradas são células inteiras. A
          calibração não muda as equações; ajusta seis fatores que absorvem o que falta.
        </p>
        <table>
          <thead>
            <tr><th scope="col">Fator</th><th scope="col">O que corrige</th></tr>
          </thead>
          <tbody>
            <tr><td>Velocidade do sub-bosque, dos matos e das herbáceas</td><td>Combustíveis que diferem do seu modelo, e o efeito médio do relevo e da humidade</td></tr>
            <tr><td>Vento a meia chama</td><td>O vento local, mais forte e mais rajado do que o da reanálise</td></tr>
            <tr><td>Largura que segura uma linha</td><td>Estradas e faixas galgadas por calor e faúlhas antes de a chama ter a largura delas</td></tr>
            <tr><td>Velocidade do fogo de copas</td><td>Um modelo de copas feito para pinhais, usado também no eucaliptal</td></tr>
          </tbody>
        </table>
        <p>Cada grelha, a de 100 m e a de 30 m, tem a sua calibração: os efeitos da resolução não passam de uma para a outra.</p>
      </Section>

      <Section id="incendios" title="Os incêndios reais">
        <p>
          A base é o <strong>PT-FireSprd</strong> (Benali et al. 2023): 80 grandes incêndios portugueses de 2015 a 2021, com os
          perímetros observados ao longo do tempo, de satélite e de relatórios operacionais. Cada um é reconstruído na grelha da
          calibração com o mesmo código da grelha de Guimarães: o combustível do ano, o relevo, as estradas, o coberto das árvores e o
          tempo hora a hora desses dias.
        </p>
        <p>
          Os 34 incêndios de 2018 a 2021 têm o mapa de combustível do próprio ano; os outros 46 só têm um mapa de depois do fogo, em
          que a cicatriz já aparece, e servem só de verificação. Para calibrar, escolhemos <strong>só com os dados</strong>, antes de
          pontuar qualquer modelo, os {c.fires} que fazem sentido para Guimarães: com o mapa do próprio ano, onde o mapa e o fogo não
          se contradizem e que ardem nos combustíveis que Guimarães tem.
        </p>
      </Section>

      <Section id="combate" title="O problema do combate">
        <p>
          O motor simula o fogo <strong>sem combate</strong>: só há combate onde quem o usa o desenha, para que comparar duas
          decisões meça só o que se desenhou. Mas os incêndios do PT-FireSprd foram todos combatidos, e o combate não está nos
          dados. Um motor certo deve, por isso, arder <strong>mais</strong> do que o fogo real onde os meios o travaram.
        </p>
        <p>
          As pontuações habituais contam igual um hectare a mais e um a menos. Com elas, um ajuste aprende a imitar o combate,
          abrandando o fogo. Foi o que aconteceu numa primeira calibração da grelha de 30 m: os fogos ficaram com metade da área
          habitual, e só cobriam 44% do que ardeu de facto. Por isso mudámos a pontuação:
        </p>
        <Figure caption="O peso de um hectare na pontuação: falhar área que ardeu custa quatro vezes mais do que arder a mais.">
          <CoverageWeights />
        </Figure>
      </Section>

      <Section id="pontuacao" title="Como se pontua">
        <p>
          Cada incêndio pontua-se de duas formas. <strong>Por intervalo:</strong> entre duas observações, a simulação recomeça do
          fogo observado no início e compara-se com o que ardeu durante o intervalo. Assim mede-se a velocidade e a direção onde
          acontecem, sem que um erro cedo estrague tudo o que vem depois. <strong>Desde a ignição:</strong> o fogo inteiro, como a
          aplicação o mostra.
        </p>
        <Figure caption="Um intervalo: a simulação parte do fogo observado em t₁. O que ardeu e ela falhou custa quatro vezes mais do que o que ardeu a mais; para lá de um flanco que os meios seguraram, a área a mais não conta.">
          <IntervalRestart />
        </Figure>
        <ul>
          <li><strong>A área em falta conta sempre.</strong> A área a mais só conta acima de três vezes a área real, e só nas horas em que o fogo corria livre. À noite, ou com o fogo travado, só conta o que falta.</li>
          <li><strong>Flancos travados:</strong> onde a borda do fogo observado não avançou durante o intervalo, os meios seguraram-na. Decide-se só com a observação.</li>
          <li><strong>A cabeça nas corridas rápidas:</strong> acima de 15 m/min os meios não seguram o fogo, e aí compara-se a velocidade da cabeça simulada com a observada. É isto que impede que "arder tudo" ganhe.</li>
        </ul>
        <Expert>
          <p>
            Por intervalo: 1 − Tversky(α = 0,2 na área a mais, β = 0,8 na área em falta) + 0,5 × erro de área em falta + 0,5 × erro
            de área acima de ×3 (só em fogo livre), cada erro em log com +1 ha e limite ln 5; intervalos lentos pesam 0,25. Flanco
            travado: nenhuma célula observada a arder a menos de 150 m. Cabeça: |ln(simulada/observada)| nos intervalos com velocidade
            PT-FireSprd acima de 15 m/min e qualidade ≥ 3. Objetivo de cada incêndio: esta pontuação + (1 − Tversky desde a ignição).
          </p>
        </Expert>
      </Section>

      <Section id="decisao" title="Como se decide">
        <ul>
          <li><strong>Validação cruzada em 5 partes:</strong> cada incêndio é pontuado com os fatores ajustados nos outros quatro quintos. É a estimativa do que esperar num incêndio novo.</li>
          <li><strong>Incerteza:</strong> {c.bootstrap} reajustes em amostras dos incêndios dão o intervalo de cada fator.</li>
          <li><strong>Regra fixada antes de correr:</strong> uma calibração nova substitui a atual só se, nos incêndios de teste, o custo descer pelo menos 0,02 com o intervalo de 90% abaixo de zero, sem perder cobertura nem velocidade da cabeça. Num empate, fica a atual.</li>
          <li><strong>Hipóteses</strong>, como um combate de fundo só durante a calibração, testam-se nas mesmas partes e pela mesma regra.</li>
        </ul>
        <Expert>
          <p>
            Ajuste por CMA-ES em escala logarítmica, com uma prior fraca para os valores físicos (0,01 × Σ ln²), a partir de dois
            pontos (os valores físicos e o vento ×2) e com regra de paragem. Comparação emparelhada incêndio a incêndio, com o intervalo
            de 90% por bootstrap sobre os incêndios. O protocolo foi registado antes de pontuar qualquer modelo.
          </p>
        </Expert>
      </Section>

      <Section id="resultados" title="Resultados na grelha de 100 m">
        <p>
          <strong>Os valores em uso ficam.</strong> Um ajuste novo com esta pontuação empata com eles nos {c.paired.fires} incêndios
          de teste: o custo desce {num(Math.abs(c.paired.cost), 3)}, mas o intervalo de 90% vai de {sign(c.paired.costP05)} a{" "}
          {sign(c.paired.costP95)} e inclui o zero. Os dois cobrem muito mais do fogo real do que o modelo físico.
        </p>
        <table>
          <thead>
            <tr><th scope="col">Incêndios de teste ({c.paired.fires})</th><th scope="col" className="n">Em uso</th><th scope="col" className="n">Ajuste novo</th><th scope="col" className="n">Físico</th></tr>
          </thead>
          <tbody>
            <tr><td>Cobertura da área que ardeu</td><td className="n">{pct(h.current.recall)}</td><td className="n">{pct(h.fitted.recall)}</td><td className="n">{pct(h.physical.recall)}</td></tr>
            <tr><td>Erro da velocidade da cabeça</td><td className="n">{num(h.current.anchor)}</td><td className="n">{num(h.fitted.anchor)}</td><td className="n">{num(h.physical.anchor)}</td></tr>
            <tr><td>Área simulada / real (mediana)</td><td className="n">{times(median(rows.map((r) => r.current.areaRatio)))}</td><td className="n">{times(median(rows.map((r) => r.fitted.areaRatio)))}</td><td className="n">{times(median(rows.map((r) => r.physical.areaRatio)))}</td></tr>
          </tbody>
        </table>
        <Figure caption="Por incêndio de teste, desde a ignição: a média, nas horas observadas, da fração da área que ardeu que a simulação também arde. * = os valores em uso foram ajustados neste incêndio.">
          <DotPlot
            label="Cobertura do fogo real por incêndio"
            rows={rows.map((r) => ({ label: r.label, starred: r.starred, values: { fitted: r.fitted.recall, current: r.current.recall, physical: r.physical.recall } }))}
            series={VERSIONS}
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={pct}
            value={pct}
            axis="Cobertura da área que ardeu (mais = melhor)"
            sortBy="current"
          />
        </Figure>
        <Figure caption="Na última observação, a área simulada sobre a real. O motor não tem combate: arder mais do que o fogo real é esperado onde os meios o travaram. Mais de metade da área a mais dos intervalos fica para lá de flancos que os meios seguraram.">
          <DotPlot
            label="Área simulada contra a área real por incêndio"
            rows={rows.map((r) => ({ label: r.label, starred: r.starred, values: { fitted: r.fitted.areaRatio, current: r.current.areaRatio, physical: r.physical.areaRatio } }))}
            series={VERSIONS}
            domain={[0.05, 20]}
            log
            ticks={[0.1, 0.3, 1, 3, 10]}
            tick={(x) => `×${String(x).replace(".", ",")}`}
            value={times}
            band={[1, 3, "até 3 vezes: o combate pode explicar"]}
            rule={[1, "a área real"]}
            axis="Área simulada / área real (escala logarítmica)"
            sortBy="current"
          />
        </Figure>
        <Figure caption="Os fatores: o ajuste novo, com o intervalo dos reajustes, e os valores em uso; 1 é o valor físico. O ajuste novo pede o sub-bosque mais rápido e linhas que cedem mais cedo, mas os intervalos são largos: com estes incêndios, não se distingue dos valores em uso.">
          <FactorIntervals
            label="Fatores de calibração da grelha de 100 m"
            fits={c.bootstrap}
            rows={FACTORS.map(([k, label, short]) => ({ label, short, best: c.best[k] as number, low: c.quantiles[k].p05, high: c.quantiles[k].p95, inUse: inUse(k) }))}
          />
        </Figure>
        <h3>Que fator pesa mais</h3>
        <p>O ajuste novo, com um fator de cada vez de volta ao valor físico, nos mesmos incêndios:</p>
        <table>
          <thead>
            <tr><th scope="col">Fator no valor físico</th><th scope="col" className="n">Cobertura</th></tr>
          </thead>
          <tbody>
            <tr><td>Nenhum (o ajuste)</td><td className="n">{pct(best.recall)}</td></tr>
            <tr><td>Vento a meia chama</td><td className="n">{pct(lever("windAdj").recall)}</td></tr>
            <tr><td>Largura das linhas</td><td className="n">{pct(lever("holdWidthPerFlame").recall)}</td></tr>
            <tr><td>Fogo de copas</td><td className="n">{pct(lever("crownAdj").recall)}</td></tr>
          </tbody>
        </table>
        <p>
          O vento a meia chama forte (cerca de 2,3 a 2,5 vezes o físico) é o que mais pesa: a reanálise subestima o vento local. As
          linhas que cedem vêm a seguir; o fator do fogo de copas quase não conta. A hipótese de um combate de fundo só na calibração
          empatou com a base.
        </p>
        <p>
          Pelo caminho encontrámos e corrigimos um erro: a 100 m, a zona de ignição observada de dois incêndios caía numa estrada,
          e a simulação não tinha por onde começar. Agora parte da célula com combustível mais próxima, como já fazia uma ignição marcada num
          ponto. A calibração correu de novo com a correção.
        </p>
      </Section>

      <Section id="validacao" title="Desde a ignição">
        <p>
          A prova mais direta: simular cada incêndio de 2018 a 2021 desde a ignição observada, com o tempo real hora a hora e sem
          combate, e medir a sobreposição com o que ardeu (1 seria perfeito; os fogos reais foram combatidos, por isso nem um motor
          perfeito chegaria lá).
        </p>
        <p>
          Comparam-se três versões. <strong>O LinhaZero calibrado</strong> é o que a aplicação usa. <strong>Sem calibrar</strong>{" "}
          é a mesma física com os valores dos manuais. <strong>O modelo simples</strong> é o do primeiro protótipo: cada tipo de
          vegetação tinha uma velocidade fixa, que o vento e o declive aumentavam, sem humidade do combustível, com linhas que
          seguravam sempre e ataques que nunca perdiam efeito. Fazia as decisões parecerem melhores do que são, e foi retirado; fica
          aqui como referência, para mostrar o que a física acrescenta.
        </p>
        <Expert>
          <p>
            Modelo simples: velocidade base por modelo de combustível (m/min), em 8 direções, multiplicada por exp(0,15 × vento ×
            cos θ), com θ o ângulo entre o passo e o vento, e por exp(3 × tan declive), nunca abaixo de 0,5. Os coeficientes nunca foram
            ajustados a incêndios reais. Substituído pelo modelo de Rothermel em todo o lado (ADR 0058).
          </p>
        </Expert>
        <Figure caption={`Sobreposição média nas horas observadas (índice de Sørensen), na grelha de 100 m. O motor calibrado ganha ao modelo simples, já retirado, em ${v.winsOverSimple} dos ${v.sets.all.fires} incêndios. Com o vento de cada hora invertido, cai para ${num(v.windReversed)}: a comparação mede de facto a física.`}>
          <ValidationBars
            label="Sobreposição com a área ardida, por conjunto de incêndios"
            sets={[
              { label: "2018 a 2021", ...v.sets.all },
              { label: "Região Norte", ...v.sets.norte },
              { label: "Fora do ajuste", ...v.sets.unseen },
            ]}
            series={[
              { key: "calibrated", label: "LinhaZero (calibrado)", color: SERIES_COLOR.blue, shape: "diamond" },
              { key: "physical", label: "Sem calibrar", color: SERIES_COLOR.aqua, shape: "square" },
              { key: "simple", label: "Modelo simples (retirado)", color: SERIES_COLOR.orange, shape: "circle" },
            ]}
          />
        </Figure>
        <Figure caption="Alijó, julho de 2019, simulado desde a ignição observada com o tempo real: a cor é a hora a que o fogo chega (amarelo primeiro, vermelho depois) e a linha branca é o perímetro observado ao fim de seis horas e meia. Sem calibrar, o fogo fica pequeno e quase todo ao lado do que ardeu; calibrado, cobre o perímetro e vai além dele, onde os meios travaram o fogo real. Alijó é um dos sete incêndios em que os valores em uso foram ajustados.">
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["alijo-fisico.png", "Sem calibrar", "Simulação do incêndio de Alijó sem calibrar: o fogo simulado é pequeno e fica quase todo fora do perímetro observado."],
                ["alijo-calibrado.png", "LinhaZero (calibrado)", "Simulação do incêndio de Alijó calibrada: o fogo simulado cobre o perímetro observado e vai além dele."],
              ] as const
            ).map(([file, name, alt]) => (
              <figure key={file} className="m-0">
                <img src={`/figures/${file}`} alt={alt} width={126} height={106} loading="lazy" decoding="async" className="aspect-[126/106] w-full rounded-md bg-raised [image-rendering:pixelated]" />
                <figcaption className="mt-1.5 text-small text-ink">{name}</figcaption>
              </figure>
            ))}
          </div>
        </Figure>
        <p className="text-small text-muted">
          "Fora do ajuste": os {v.sets.unseen.fires} incêndios em que os valores em uso nunca foram ajustados. Algumas escolhas do
          modelo foram decididas a olhar para os mesmos incêndios, por isso estes números são um pouco otimistas.
        </p>
      </Section>

      <Section id="falta" title="O que falta">
        <ul>
          <li><strong>A grelha de 30 m</strong> usa por agora os valores da de 100 m. A sua própria calibração, com esta pontuação, está planeada e registada.</li>
          <li><strong>A forma do fogo:</strong> os fogos reais pedem uma cabeça mais rápida e flancos mais lentos do que o modelo dá. É o próximo passo para as corridas rápidas.</li>
          <li><strong>Um mapa de combustível mais fino,</strong> e o combate real dos incêndios, se houver dados, para separar a física do efeito dos meios.</li>
        </ul>
      </Section>

      <Section id="referencias" title="Referências">
        <References
          items={[
            "Benali, A. et al. (2023). The Portuguese Large Wildfire Spread database (PT-FireSprd). Earth System Science Data 15.",
            "Bennett, L. et al. (2026). Assessment of fire spread predictions from W.I.S.E. using satellite-derived wildfire perimeters. International Journal of Wildland Fire 35.",
            "Cruz, M.G., Alexander, M.E. (2013). Uncertainty associated with model predictions of surface and crown fire rates of spread. Environmental Modelling & Software 47.",
            "Finney, M.A., Grenfell, I.C., McHugh, C.W. (2009). Modeling containment of large wildfires using generalized linear mixed-model analysis. Forest Science 55.",
            "Hansen, N. (2016). The CMA Evolution Strategy: a tutorial. arXiv:1604.00772.",
            "Tversky, A. (1977). Features of similarity. Psychological Review 84.",
            "Dados: PT-FireSprd v0.08 (CC BY 4.0); ERA5 (Copernicus) pelo arquivo do Open-Meteo; FUMOD; Copernicus DEM GLO-30; OpenStreetMap.",
          ]}
        />
      </Section>
    </Article>
  );
}
