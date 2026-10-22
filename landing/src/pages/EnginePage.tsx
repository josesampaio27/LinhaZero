import { Article, Expert, Figure, References, Section } from "@/components/Article";
import { num, pct } from "@/components/charts/common";
import { ReliabilityCurve, type ReliabilityBin } from "@/components/charts/ReliabilityCurve";
import { CellLayers } from "@/components/diagrams/CellLayers";
import { SpreadStencil } from "@/components/diagrams/SpreadStencil";
import data from "@/data/site-data.json";

const TOC: [string, string][] = [
  ["pergunta", "A pergunta"],
  ["territorio", "O território em células"],
  ["avanco", "Como o fogo avança"],
  ["decisoes", "As decisões"],
  ["incerteza", "A incerteza"],
  ["limites", "O que ainda não faz"],
  ["referencias", "Referências"],
];

/** The layer pictures (landing/scripts/figures.ts): file, name, description. */
const LAYER_IMAGES: [string, string, string][] = [
  ["camada-combustivel.png", "Combustível", "Mapa do combustível de Guimarães: mato debaixo de árvores, mato a céu aberto, erva, estradas e o que não arde."],
  ["camada-relevo.png", "Relevo", "Mapa do relevo de Guimarães, com a serra da Penha mais clara a nascente."],
  ["camada-copas.png", "Coberto arbóreo", "Mapa do coberto das árvores de Guimarães: mais verde onde há mais copas."],
  ["camada-edificios.png", "Edifícios", "Mapa dos edifícios de Guimarães: a cidade ao centro e as aldeias à volta."],
];

/** FUMOD labels as the page shows them (one of the source's labels carries a note to check its name). */
const fuelName = (label: string) => label.replace(/Mato \(V-MH;.*\)/, "Mato e herbáceas (V-MH)");

/** The 20 reliability bins of the data, two by two: ten points, each weighted by its cells. */
function reliabilityPoints(): ReliabilityBin[] {
  const bins = data.reliability.bins;
  const out: ReliabilityBin[] = [];
  for (let k = 0; k < bins.length; k += 2) {
    const pair = [bins[k], bins[k + 1]].filter((b) => b && b.n > 0 && b.predicted !== null && b.observed !== null);
    const n = pair.reduce((a, b) => a + b.n, 0);
    if (!n) continue;
    out.push({
      n,
      predicted: pair.reduce((a, b) => a + b.n * b.predicted!, 0) / n,
      observed: pair.reduce((a, b) => a + b.n * b.observed!, 0) / n,
    });
  }
  return out;
}

export function EnginePage() {
  const g = data.grid;
  const p = data.calibration.params;
  const fuels = g.fuels.filter((f) => f.share >= 0.01);
  const rel = reliabilityPoints();
  const top = rel[rel.length - 1];
  return (
    <Article
      kicker="O simulador"
      title="Como funciona o simulador"
      lead="O que o LinhaZero calcula quando se marca uma ignição e se desenham duas decisões: o território, a física do fogo, o combate e a incerteza, explicados sem fórmulas."
      toc={TOC}
      next={{ href: "/calibracao", label: "Como foi calibrado e validado" }}
    >
      <Section id="pergunta" title="A pergunta">
        <p>
          O simulador responde a uma pergunta de quem comanda nas primeiras horas: <strong>se eu tomar a decisão A ou a decisão B, o
          que acontece ao fogo?</strong> Simula as duas com o mesmo território e o mesmo tempo e compara a área ardida hora a hora,
          os edifícios atingidos, a hora a que o fogo chega a cada lugar e em quantas variações do vento uma decisão ganha à outra.
        </p>
        <p>
          Não é um oráculo. É uma estimativa física, honesta sobre a sua incerteza, para comparar opções. Não prevê o perímetro ao
          metro.
        </p>
      </Section>

      <Section id="territorio" title="O território em células">
        <p>
          O simulador vê Guimarães como uma grelha de quadrados de {g.cellSize} m, {g.rows} por {g.cols}, cerca de{" "}
          {Math.round(g.areaKm2)} km² da cidade à Penha. Há também uma grelha de 30 m, com estradas e rios mais finos e cerca de oito
          vezes mais cálculo. Cada célula guarda o que importa ao fogo:
        </p>
        <Figure caption={`As camadas de cada célula. A grelha de Guimarães tem ${g.buildings.toLocaleString("pt-PT")} edifícios e ${g.places} lugares com nome.`}>
          <CellLayers />
        </Figure>
        <Figure caption="A grelha de Guimarães a 100 m, camada a camada: um quadrado por célula. No combustível, o verde escuro é mato debaixo de árvores, o verde claro mato a céu aberto, o amarelo erva e o creme as estradas; o escuro não arde.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {LAYER_IMAGES.map(([file, name, alt]) => (
              <figure key={file} className="m-0">
                <img src={`/figures/${file}`} alt={alt} width={152} height={157} loading="lazy" decoding="async" className="aspect-[152/157] w-full rounded-md bg-raised [image-rendering:pixelated]" />
                <figcaption className="mt-1.5 text-small text-ink">{name}</figcaption>
              </figure>
            ))}
          </div>
        </Figure>
        <h3>O que arde</h3>
        <p>
          O mais importante é o combustível. O mapa FUMOD classifica cada hectare num modelo de combustível português: quanto
          material há, de que tamanho, a que altura e quão inflamável. Em Guimarães:
        </p>
        <table>
          <thead>
            <tr><th scope="col">Combustível</th><th scope="col" className="n">Da grelha</th></tr>
          </thead>
          <tbody>
            {fuels.map((f) => (
              <tr key={f.code}><td>{fuelName(f.label)}</td><td className="n">{pct(f.share)}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          O simulador junta-os em quatro grupos, que trata de forma diferente: a folhada no chão da floresta, o mato debaixo das
          árvores (onde o vento é mais fraco), o mato a céu aberto e a erva, que seca no verão.
        </p>
        <h3>Barreiras que cedem</h3>
        <p>
          Uma estrada ou um rio não param sempre um fogo: depende da largura e de quão alta é a chama. Cada linha guarda a sua
          largura (autoestrada 30 m, estrada nacional 10 m, rio 15 m) e o simulador decide se a chama a galga. Só lagos e albufeiras são
          barreiras absolutas.
        </p>
      </Section>

      <Section id="avanco" title="Como o fogo avança">
        <p>
          Para cada célula, o simulador calcula <strong>a que horas o fogo lá chega</strong>. Pense-se num mapa de estradas em que cada
          troço demora um certo tempo a percorrer: o fogo faz sempre o caminho mais rápido, e o tempo de cada troço é o que o fogo
          demora a atravessar aquele terreno naquela direção, com aquele vento.
        </p>
        <Figure caption="De cada célula, o fogo pode seguir em 32 direções. Cada direção representa também o ângulo à sua volta, para que a cabeça do fogo não perca velocidade quando o vento sopra entre duas direções da grelha.">
          <SpreadStencil />
        </Figure>
        <Expert>
          <p>
            Tempos de chegada pelo caminho mínimo (algoritmo de Dijkstra, como no FlamMap). O tempo de cada passo reparte-se pelas
            células que a linha atravessa. Com vento, a elipse vai até 8 vezes mais comprida do que larga (Anderson 1983); cada
            direção usa a velocidade da elipse no ponto do seu setor mais próximo da cabeça (60% do setor), o que mantém a cabeça a
            80–100% da velocidade teórica para qualquer direção do vento.
          </p>
        </Expert>
        <h3>A velocidade: o modelo de Rothermel</h3>
        <p>
          A velocidade em cada célula vem do modelo de Rothermel (1972), o mais usado no mundo para o fogo de superfície, também em
          Portugal. Em poucas palavras: o fogo avança quando o calor que liberta chega para secar e acender o combustível à frente.
          Acelera com combustível fino e seco, com vento (que inclina a chama para a frente) e a subir (a chama fica mais perto da
          encosta). Abranda com humidade, que tem de evaporar primeiro, e com a erva verde.
        </p>
        <p>
          O primeiro protótipo usava um modelo mais simples: uma velocidade fixa por tipo de vegetação, que o vento e o declive
          aumentavam, sem humidade. Nos incêndios reais acertava menos e fazia as decisões parecerem melhores do que são, por isso
          foi substituído pelo de Rothermel; aparece ainda nos resultados como referência, com o nome "modelo simples".
        </p>
        <p>
          Debaixo das árvores o vento é muito mais fraco: um eucaliptal com metade do chão coberto deixa passar cerca de um décimo
          do vento. O simulador usa o coberto de cada célula para isso.
        </p>
        <Expert>
          <p>
            Rothermel tal como no BehavePlus, com os modelos de combustível de Fernandes e Loureiro (2021); os testes reproduzem o
            BehavePlus com menos de 1% de diferença. Vento a meia chama pelo fator de ajuste de Albini e Baughman (1979), com abrigo
            das copas; limite do vento original (0,9 × intensidade de reação).
          </p>
        </Expert>
        <h3>A humidade vem do tempo</h3>
        <p>
          A humidade dos raminhos e folhas secas é calculada hora a hora a partir da temperatura, da humidade do ar, das nuvens e
          da posição do sol. Numa tarde quente e seca desce a 3–5%; de noite sobe, e é por isso que os fogos abrandam. A humidade da
          erva e dos arbustos verdes vem de uma curva típica por mês. Com "Seguir a previsão", o vento e a humidade mudam a cada
          hora durante a simulação.
        </p>
        <h3>Copas e faúlhas</h3>
        <p>
          Num pinhal ou eucaliptal com pelo menos 30% de coberto, um fogo de superfície intenso sobe às copas e passa a correr à
          velocidade do fogo de copas. Fogos acima de 2000 kW/m lançam faúlhas que podem acender focos à frente, mesmo do outro lado
          de uma estrada; só nas simulações com incerteza, porque são um fenómeno aleatório.
        </p>
        <Expert>
          <p>
            Humidade do combustível morto pelo NFDRS (Cohen e Deeming 1985). Início do fogo de copas pelo critério de Van Wagner
            (1977) e velocidade pelo modelo de Cruz et al. (2005). Distâncias dos focos secundários de Sardoy et al. (2008), como no
            ELMFIRE.
          </p>
        </Expert>
      </Section>

      <Section id="decisoes" title="As decisões">
        <p>
          <strong>Sem nada desenhado, o fogo não é combatido.</strong> Só há combate onde se desenha. Assim, a diferença entre a
          decisão A e a B mede só o efeito do que se desenhou.
        </p>
        <p>
          Cada decisão junta uma ou mais ações, desenhadas no mapa, cada uma com o minuto em que começa e, se se quiser, o minuto
          em que acaba. Há cinco:
        </p>
        <ul className="actions-list">
          <li>
            <strong>Linha de contenção.</strong> No terreno: uma faixa sem combustível que os meios abrem à frente do fogo, à mão
            ou com máquinas, ou uma faixa de gestão que já existe. Desenha-se como uma linha. No simulador: a partir do minuto em
            que fica pronta, o fogo para nela, se a faixa for larga o bastante para as chamas.
          </li>
          <li>
            <strong>Ataque.</strong> No terreno: meios a combater o fogo diretamente, com água, ferramentas ou máquinas, na cabeça
            ou num flanco. Desenha-se a zona onde trabalham. No simulador: a partir do minuto em que os meios chegam, o fogo nessa
            zona anda 5 vezes mais devagar. Atrasa o fogo, não o apaga.
          </li>
          <li>
            <strong>Proteger zona.</strong> No terreno: meios já colocados junto a casas ou a uma aldeia, à espera do fogo para o
            travar ali. Desenha-se a zona à volta do que se defende. No simulador: a partir do minuto em que lá estão, o fogo nessa
            zona anda 10 vezes mais devagar, mais do que num ataque, porque os meios estão no sítio e preparados.
          </li>
          <li>
            <strong>Descarga aérea.</strong> No terreno: um helicóptero ou um avião larga água ou retardante numa faixa, à frente
            ou no flanco do fogo. Desenha-se o percurso da descarga. No simulador: enquanto faz efeito (a água cerca de 20 minutos,
            o retardante cerca de 2 horas), a faixa trava o fogo, se as chamas não forem altas demais.
          </li>
          <li>
            <strong>Contrafogo.</strong> No terreno: os meios queimam de propósito o combustível entre uma linha de apoio (uma
            estrada, um caminho ou uma linha aberta) e o fogo que se aproxima. Desenha-se a linha de apoio. No simulador: no minuto
            indicado, acende o lado da linha virado para a ignição; esse fogo arde como qualquer outro, e a linha segura-o se for
            larga o bastante para as chamas.
          </li>
        </ul>
        <p>
          Como na realidade, tudo depende da força do fogo. Um ataque, ou uma zona protegida, tem efeito total até chamas de cerca de
          1,4 m (500 kW/m), o fogo que uma equipa com ferramentas manuais controla, e perde-o por completo com chamas de 3,5 m
          (4000 kW/m), onde nenhum meio terrestre atua. Uma linha trava o fogo se for pelo menos 5 vezes mais larga do que as chamas
          são compridas, porque o calor e as faúlhas passam faixas mais largas do que a chama: uma linha de 4 m só trava chamas até
          80 cm, uma faixa de 25 m trava chamas até 5 m. Uma descarga aérea trava sempre chamas até cerca de 2,5 m (2000 kW/m) e
          nunca acima de 3,5 m (4000 kW/m); estes limites são provisórios. Qualquer ação só conta se estiver no terreno antes de o
          fogo lá chegar.
        </p>
      </Section>

      <Section id="incerteza" title="A incerteza">
        <p>
          O vento previsto nunca é exato, a humidade varia de sítio para sítio e a ignição nem sempre se conhece ao metro. Com a
          incerteza ligada, o simulador corre <strong>de 200 a 500 simulações</strong> de cada decisão, no servidor (o número
          escolhe-se na aplicação), e, em cada uma, sorteia:
        </p>
        <ul>
          <li>a direção do vento, até ±{data.reliability.perturbation.windDirJitterDeg}°, e a velocidade, até ±{num(data.reliability.perturbation.windSpeedJitterPct, 1)}%;</li>
          <li>a humidade do combustível morto, até ±{Math.round(data.reliability.perturbation.perturb.deadMoisturePts * 100)} pontos;</li>
          <li>a velocidade de cada grupo de combustível;</li>
          <li>o ponto de ignição, até {data.reliability.perturbation.perturb.ignitionRadiusM} m.</li>
        </ul>
        <p>
          <strong>A comparação é emparelhada:</strong> a simulação n.º 7 da decisão A tem exatamente o mesmo vento, humidade e
          ignição que a n.º 7 da decisão B. A diferença entre as duas é só o efeito da decisão. É daí que vem a frase "B é melhor do
          que A em N dos cenários".
        </p>
        <h3>Como ler o mapa de cenários</h3>
        <p>
          O mapa mostra em quantas das simulações cada célula arde, sem combate além do desenhado. Pusemo-lo à prova em{" "}
          {data.reliability.fires} incêndios reais, com {data.reliability.runs} simulações por incêndio, onde o fogo menos foi travado
          (nas horas em que corria livre e até à primeira observação):
        </p>
        <Figure caption={`Nas células em que todas as simulações ardem, arderam de facto ${pct(top.observed)}. O mapa arde mais do que os incêndios reais porque estes foram combatidos, mesmo nas horas em que corriam livres. Por isso a aplicação lhe chama "cenários em que arde", e não probabilidade. Avisa ${pct(data.reliability.coverage10)} das células que arderam (com pelo menos 10% das simulações).`}>
          <ReliabilityCurve label="Fração das simulações em que cada célula arde, contra a fração que ardeu de facto" bins={rel} />
        </Figure>
      </Section>

      <Section id="limites" title="O que ainda não faz">
        <ul>
          <li><strong>Corridas rápidas:</strong> nas horas em que os fogos reais correram mais depressa, o simulador fica abaixo da velocidade observada. Os fogos reais são mais alongados do que o modelo dá: cabeça mais rápida, flancos mais lentos.</li>
          <li><strong>Vento igual em toda a grelha:</strong> muda hora a hora, mas não entre vales e cumeadas.</li>
          <li><strong>Combustível de 100 m:</strong> o mapa perde faixas de gestão estreitas e pequenas manchas, mesmo na grelha de 30 m.</li>
          <li><strong>Relevo com árvores e casas:</strong> o modelo de elevação inclui a altura das copas e dos edifícios.</li>
          <li><strong>Copas e erva com valores típicos:</strong> a altura das copas e a humidade da vegetação verde não são medidas.</li>
          <li><strong>Faúlhas de longa distância:</strong> a casca de eucalipto leva fogo a quilómetros; o simulador só tem focos a dezenas ou centenas de metros.</li>
        </ul>
        <p>
          Os parâmetros em uso na grelha de 100 m: velocidade ×{num(p.rosAdj, 1)}, vento ×{num(p.windAdj, 1)}, linhas que seguram com{" "}
          {p.holdWidthPerFlame} comprimentos de chama e fogo de copas ×{num(p.crownAdj)}. Como chegámos a eles está na página
          seguinte.
        </p>
      </Section>

      <Section id="referencias" title="Referências">
        <References
          items={[
            "Albini, F.A., Baughman, R.G. (1979). Estimating windspeeds for predicting wildland fire behavior. USDA Forest Service, Research Paper INT-221.",
            "Anderson, H.E. (1983). Predicting wind-driven wild land fire size and shape. USDA Forest Service, Research Paper INT-305.",
            "Cohen, J.D., Deeming, J.E. (1985). The National Fire-Danger Rating System: basic equations. USDA Forest Service, GTR PSW-82.",
            "Cruz, M.G., Alexander, M.E., Wakimoto, R.H. (2005). Development and testing of models for predicting crown fire rate of spread in conifer forest stands. Canadian Journal of Forest Research 35.",
            "Fernandes, P.M., Loureiro, C. (2021). Modelos de combustível florestal para Portugal.",
            "Rothermel, R.C. (1972). A mathematical model for predicting fire spread in wildland fuels. USDA Forest Service, Research Paper INT-115.",
            "Sardoy, N. et al. (2008). Numerical study of ground-level distribution of firebrands generated by line fires. Combustion and Flame 154.",
            "Van Wagner, C.E. (1977). Conditions for the start and spread of crown fire. Canadian Journal of Forest Research 7.",
            "Dados: FUMOD; Copernicus DEM GLO-30 e Tree Cover Density 2018; IPMA e Open-Meteo; OpenStreetMap; Censos 2021.",
          ]}
        />
      </Section>
    </Article>
  );
}
