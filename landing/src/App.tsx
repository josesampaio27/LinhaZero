import { useState } from "react";
import { DEMO_URL, Hero, SIGNIN_URL, SIGNUP_URL } from "@/components/Hero";
import { ScenarioCard, type Stage } from "@/components/ScenarioCard";

const REPO = "https://github.com/josesampaio27/LinhaZero";
const DOCS = `${REPO}/blob/main/docs`;

const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

// Every section is one screen (`.screen`): it fits one viewport on its own at every size scripts/fit-check.ts
// measures. Where a phone has no room, the section's picture or panel is left out there rather than cropped.

/* ---------- How it works: the five steps beside the scenario panel; pick a step to see the panel at it ---------- */

const STEPS: [string, string][] = [
  ["Marca-se a ignição no mapa.", "A grelha de Guimarães já traz combustível, relevo, estradas e 12 000 edifícios."],
  ["O tempo vem do IPMA.", "Vento, humidade e temperatura daquele local e daquela hora, e ajustáveis."],
  ["Desenham-se duas decisões.", "Uma linha de contenção contra um ataque direto, com a hora a que os meios chegam."],
  ["Os dois mapas avançam juntos.", "Hora a hora, com a área ardida colorida pela hora a que o fogo chega."],
  ["Por baixo, a comparação.", "Edifícios e aldeias protegidos, e em quantas de 30 variações do vento cada decisão ganha."],
];

function HowItWorks() {
  const [stage, setStage] = useState<Stage>(5);
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-h" className="fit px-margin">
      <div className="grid items-center gap-x-6 md:grid-cols-12">
        {/* The panel keeps the height of its fullest stage, so picking a step never moves the list. */}
        <div className="hidden md:col-span-6 md:block lg:col-span-5" data-reveal>
          <div className="grid">
            <div className="invisible col-start-1 row-start-1"><ScenarioCard stage={5} /></div>
            <div className="col-start-1 row-start-1"><ScenarioCard stage={stage} /></div>
          </div>
        </div>
        <div className="md:col-span-6 lg:col-start-7">
          <h2 id="como-funciona-h" className="text-heading" data-reveal>Como funciona</h2>
          <ol className="mt-[clamp(1rem,3svh,2rem)] grid gap-1">
            {STEPS.map(([step, detail], i) => (
              <li key={step} data-reveal="row" style={css({ "--i": i + 1 })}>
                <button
                  type="button"
                  aria-pressed={stage === i + 1}
                  onClick={() => setStage((i + 1) as Stage)}
                  onMouseEnter={() => setStage((i + 1) as Stage)}
                  className={`block w-full border-l-[5px] py-[clamp(0.4rem,1.2svh,0.9rem)] pl-5 text-left transition-colors duration-200 hover:bg-panel ${stage === i + 1 ? "border-decision-a-light bg-panel" : "border-raised"}`}
                >
                  <span className="block text-statement font-medium">{step}</span>
                  <span className="mt-1 block max-w-[52ch] text-muted">{detail}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------- The answer: the sentences the interface writes, at the size of the page ---------- */

const Slot = ({ children }: { children: React.ReactNode }) => <span className="slot">{children}</span>;

function Answer() {
  return (
    <section id="resposta" aria-labelledby="resposta-h" className="fit flex flex-col bg-deep px-margin lg:min-h-svh">
      <div className="grid flex-1 gap-x-6 gap-y-10 md:grid-cols-12">
        <div className="self-center md:col-span-12 lg:col-span-7">
          <h2 id="resposta-h" className="text-heading" data-reveal>A resposta, por palavras</h2>
          <p className="mt-4 max-w-[54ch]" data-reveal style={css({ "--i": 1 })}>
            Por baixo dos dois mapas, o LinhaZero escreve o que muda. As frases são sempre estas; os números saem do cenário.
          </p>
          <div data-ui className="says mt-[clamp(1.25rem,4svh,2.5rem)] text-statement">
            <p className="win-A" data-reveal="row" style={css({ "--i": 2 })}>A decisão A protege <Slot>X</Slot> edifícios a mais do que a B.</p>
            <p className="win-B" data-reveal="row" style={css({ "--i": 3 })}>Com a decisão A, o fogo chega a <Slot>aldeia</Slot> às <Slot>hh:mm</Slot>. Com a B, não chega.</p>
            <p className="win-B" data-reveal="row" style={css({ "--i": 4 })}>B é melhor do que A em <Slot>N</Slot> de 30 variações do vento.</p>
            <p className="warn" data-reveal="row" style={css({ "--i": 5 })}>A equipa só chega à linha aos <Slot>mm</Slot> minutos; o fogo passa lá aos <Slot>mm</Slot>.</p>
          </div>
        </div>
        {/* Desktop only: on narrower screens the four sentences take the whole screen. */}
        <figure className="m-0 hidden lg:col-span-4 lg:col-start-9 lg:-mr-margin lg:flex lg:flex-col" data-reveal="mask" style={css({ "--i": 1 })}>
          <div className="relative flex-1 overflow-clip">
            <img
              src="/photos/monchique-2018.webp"
              alt="Casas de telha com a encosta por trás ardida até ao topo, em Monchique, dias depois do incêndio de agosto de 2018."
              width={1400}
              height={1050}
              loading="lazy"
              decoding="async"
              className="drift absolute inset-0 h-full w-full bg-raised object-cover object-[52%_50%]"
            />
          </div>
          <figcaption className="mt-3 pr-margin text-small text-muted">Monchique, dias depois do incêndio de agosto de 2018: as casas ficaram, a encosta ardeu.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ---------- Portugal from orbit on the day of Pedrógão Grande: one picture, one screen ---------- */

function Satellite() {
  return (
    <section id="satelite" aria-label="Portugal visto do espaço a 18 de junho de 2017">
      <figure className="relative m-0 overflow-clip" data-reveal="mask">
        <img
          src="/photos/portugal-2017-modis.webp"
          alt="Imagem de satélite de Portugal continental a 18 de junho de 2017, com o fumo dos incêndios a cobrir o centro do país."
          width={1920}
          height={1828}
          loading="lazy"
          decoding="async"
          className="drift block h-[min(70svh,125vw)] w-full object-cover object-[50%_38%] sm:h-[min(80svh,62vw)]"
        />
        <figcaption className="bg-panel px-margin py-4 text-small sm:absolute sm:bottom-0 sm:left-0 sm:max-w-[42ch] sm:py-5">
          Portugal visto pelo satélite MODIS da NASA a 18 de junho de 2017, o dia do incêndio de Pedrógão Grande.
        </figcaption>
      </figure>
    </section>
  );
}

/* ---------- Proof: the validation, as a table ---------- */

const VALIDATION: [string, string, string, string][] = [
  ["34 de 2018 a 2021", "0,25", "0,34", "0,38"],
  ["8 na região Norte", "0,18", "0,26", "0,39"],
  ["26 fora do ajuste", "0,26", "0,35", "0,38"],
];

function Proof() {
  return (
    <section id="validacao" aria-labelledby="validacao-h" className="fit px-margin">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 id="validacao-h" className="text-heading" data-reveal>
            Testado em 80
            <br />
            incêndios portugueses
          </h2>
          <p className="mt-4 max-w-[34ch] text-statement lg:hidden" data-reveal style={css({ "--i": 1 })}>
            O motor calibrado ganha ao modelo simples em 28 dos 34 incêndios em que pode ser medido.
          </p>
          <table className="mt-[clamp(1.25rem,4svh,3rem)] w-full border-collapse text-left tabular-nums" data-reveal style={css({ "--i": 2 })}>
            <caption className="mb-3 text-left text-small text-muted">
              Sobreposição entre a área simulada e a que ardeu (Sørensen; 1 é perfeito).
            </caption>
            <thead>
              <tr className="text-small text-muted">
                <th scope="col" className="py-2.5 pr-3 font-medium">Incêndios</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Simples</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Rothermel</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium text-ink">Calibrado</th>
              </tr>
            </thead>
            <tbody>
              {VALIDATION.map(([set, a, b, c], i) => (
                <tr key={set} className={i % 2 ? "" : "bg-panel"}>
                  <td className="py-3 pr-3 pl-3">{set}</td>
                  <td className="py-3 pr-3 text-right">{a}</td>
                  <td className="py-3 pr-3 text-right">{b}</td>
                  <td className="py-3 pr-3 text-right font-medium">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 hidden max-w-[62ch] sm:block" data-reveal style={css({ "--i": 3 })}>
            Incêndios portugueses do PT-FireSprd, de 2015 a 2021, simulados da ignição real, com o tempo real e sem combate.
            Uma mudança no motor só entra se melhorar em fogos que não serviram para a afinar.{" "}
            <a href={`${DOCS}/modelo/validacao-resumo.md`} className="link font-medium">Ver incêndio a incêndio</a>.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-6 lg:col-span-5 lg:col-start-8 lg:mt-0">
          <p className="hidden max-w-[34ch] text-statement lg:block" data-reveal style={css({ "--i": 1 })}>
            O motor calibrado ganha ao modelo simples em 28 dos 34 incêndios em que pode ser medido.
          </p>
          {/* Placeholder for the validation chart, which is about to change. */}
          <div
            role="img"
            aria-label="Gráfico da validação, em preparação"
            className="flex aspect-[5/2] items-end bg-panel p-5 text-small text-muted sm:aspect-[3/1] lg:aspect-auto lg:min-h-[200px] lg:flex-1"
            data-reveal
            style={css({ "--i": 3 })}
          >
            Gráfico da validação, incêndio a incêndio
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Data: the sources as a list, beside the place they describe ---------- */

const SOURCES: [string, string][] = [
  ["FUMOD", "O combustível de cada célula de 100 metros."],
  ["Copernicus", "O relevo e as copas de Portugal, célula a célula."],
  ["IPMA", "Vento, humidade e temperatura, hora a hora."],
  ["OpenStreetMap", "Estradas, aceiros e os edifícios da grelha."],
  ["Censos 2021", "Quem vive em cada um dos 88 lugares."],
  ["fogos.pt", "As ocorrências ativas da ANEPC."],
];

function Data() {
  return (
    <section id="dados" aria-labelledby="dados-h" className="screen bg-panel px-margin">
      <div className="grid flex-1 gap-x-6 gap-y-8 lg:grid-cols-12">
        <div className="self-center lg:col-span-6">
          <h2 id="dados-h" className="text-heading" data-reveal>
            Feito com os dados
            <br />
            de Portugal
          </h2>
          <p className="mt-4 max-w-[46ch]" data-reveal style={css({ "--i": 1 })}>
            Fontes portuguesas e europeias sobre Portugal, numa grelha de Guimarães que vai da cidade à Penha.
          </p>
          <dl className="mt-[clamp(1rem,3.5svh,2.5rem)] grid gap-y-[clamp(0.5rem,1.6svh,1rem)]">
            {SOURCES.map(([name, what], i) => (
              <div key={name} className="grid sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-6" data-reveal="row" style={css({ "--i": i + 2 })}>
                <dt className="font-display text-statement leading-tight">{name}</dt>
                <dd className="m-0">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Two pictures of the grid's own ground; left out on phones, where the list takes the screen. */}
        <div className="hidden gap-6 sm:grid sm:grid-cols-2 lg:col-span-6 lg:-mr-margin lg:grid-cols-1 lg:grid-rows-[3fr_2fr]">
          <figure className="m-0 flex flex-col" data-reveal="mask">
            <div className="relative aspect-[3/2] overflow-clip lg:aspect-auto lg:flex-1">
              <img
                src="/photos/guimaraes-da-penha.webp"
                alt="Guimarães vista do alto da Penha, num dia limpo de inverno, com a serra ao fundo."
                width={1600}
                height={1069}
                loading="lazy"
                decoding="async"
                className="drift absolute inset-0 h-full w-full object-cover object-[30%_70%]"
              />
            </div>
            <figcaption className="mt-2 pr-margin text-small text-muted">Guimarães vista da Penha, em dezembro de 2018.</figcaption>
          </figure>
          <figure className="m-0 flex flex-col lg:w-2/3" data-reveal="mask">
            <div className="relative aspect-[3/2] overflow-clip lg:aspect-auto lg:flex-1">
              <img
                src="/photos/penha-caminho.webp"
                alt="Caminho de pedra na Penha, entre carvalhos e penedos de granito cobertos de musgo."
                width={960}
                height={638}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <figcaption className="mt-2 text-small text-muted">Um caminho entre carvalhos e penedos, na Penha.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ---------- Who it is for: an index of the people who decide ---------- */

const ROLES: [string, string][] = [
  ["Comandante das operações", "Escolher entre duas táticas, e justificar a escolha."],
  ["Proteção civil municipal", "Preparar planos prévios para cada encosta."],
  ["GNR", "Que estradas cortar e que aldeias avisar."],
  ["INEM", "Onde posicionar os meios de socorro."],
  ["Bombeiros", "Treinar, e rever ocorrências reais."],
  ["Câmara e Laboratório da Paisagem", "Onde as faixas de gestão protegem mais casas."],
];

function Audience() {
  return (
    <section id="para-quem" aria-labelledby="para-quem-h" className="fit px-margin">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <h2 id="para-quem-h" className="text-heading lg:col-span-5" data-reveal>Para quem decide</h2>
        <p className="mt-4 max-w-[52ch] lg:col-span-6 lg:col-start-7 lg:mt-0 lg:self-end" data-reveal style={css({ "--i": 1 })}>
          Feito em Guimarães, por quem conhece os incêndios do país: a mesma imagem para todas as entidades, antes,
          durante e depois de um incêndio.
        </p>
        <dl className="mt-[clamp(1rem,3svh,3.5rem)] lg:col-span-12">
          {ROLES.map(([who, why], i) => (
            <div
              key={who}
              className={`grid px-3 py-[clamp(0.45rem,1.4svh,1rem)] sm:grid-cols-12 sm:items-baseline sm:gap-6 ${i % 2 ? "" : "bg-panel"}`}
              data-reveal="row"
              style={css({ "--i": i })}
            >
              <dt className="text-statement font-medium sm:col-span-6 lg:col-span-5">{who}</dt>
              <dd className="m-0 sm:col-span-6 lg:col-span-6 lg:col-start-7">{why}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------- Close: the slogan, and the first step already open ---------- */

const KINDS = ["Bombeiros", "Proteção civil", "Câmara", "GNR"];

function AccessRequest() {
  const [entity, setEntity] = useState("Bombeiros Voluntários de Guimarães");
  const [kind, setKind] = useState(KINDS[0]);
  const href = `${SIGNUP_URL}?entidade=${encodeURIComponent(entity)}&tipo=${encodeURIComponent(kind)}`;
  return (
    <form data-ui className="dialog" action={SIGNUP_URL} method="get" onSubmit={(e) => { e.preventDefault(); location.assign(href); }}>
      <p className="font-display text-[26px] leading-tight">Pedir acesso ao LinhaZero</p>
      <label>
        Entidade
        <input type="text" name="entidade" value={entity} onChange={(e) => setEntity(e.target.value)} autoComplete="organization" />
      </label>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[15px] font-medium">Tipo de entidade</legend>
        <div className="seg">
          {KINDS.map((k) => (
            <label key={k} className="relative">
              <input type="radio" name="tipo" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span>{k}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit">Pedir acesso</button>
    </form>
  );
}

function Close() {
  return (
    <section id="pedir-acesso" aria-labelledby="pedir-acesso-h" className="screen bg-decision-a px-margin text-white">
      <div className="grid items-center gap-x-6 gap-y-8 lg:grid-cols-12">
        <div className="lg:col-span-6" data-reveal>
          <h2 id="pedir-acesso-h" className="text-heading">
            Simular, comparar
            <br />
            e aperfeiçoar.
          </h2>
          <p className="mt-4 max-w-[44ch]">
            Peça acesso para a sua entidade. O pedido chega à equipa do LinhaZero, que responde com os próximos passos.
            Até lá, o cenário de demonstração abre sem login.
          </p>
          <a href={DEMO_URL} className="link mt-3 hidden py-2 font-medium sm:inline-block">Cenário de demonstração</a>
        </div>
        <div className="lg:col-span-5 lg:col-start-8" data-reveal style={css({ "--i": 1 })}>
          <AccessRequest />
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer: a quiet close, on the page's margins ---------- */

const CREDITS: [string, string, string, string, string][] = [
  ["18 June 2017 Portugal Wildfires", "https://commons.wikimedia.org/wiki/File:18_June_2017_Portugal_Wildfires.png", "NASA, MODIS", "domínio público", "https://creativecommons.org/publicdomain/mark/1.0/"],
  ["Guimarães vista da Penha", "https://commons.wikimedia.org/wiki/File:Guimar%C3%A3es_vista_da_Penha_(46424699582).jpg", "Halley Oliveira", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0"],
  ["Caminho pedonal na Penha, Guimarães 01", "https://commons.wikimedia.org/w/index.php?curid=10814320", "Manuel_Rocha", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0"],
  ["Incêndio de Monchique - 2018", "https://commons.wikimedia.org/wiki/File:Inc%C3%AAndio_de_Monchique_-_2018.jpg", "Bextrel", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0"],
];

const DOC_LINKS: [string, string][] = [
  [`${DOCS}/modelo/o-motor-explicado.md`, "O motor explicado"],
  [`${DOCS}/modelo/validacao-resumo.md`, "O motor contra incêndios reais"],
  [`${DOCS}/proposta-desafio.md`, "A proposta ao desafio"],
  [REPO, "Código aberto"],
];

function Footer() {
  return (
    <footer className="bg-deep px-margin pt-[clamp(3rem,8svh,6rem)] pb-6">
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <a href="#" className="inline-flex items-center gap-2.5" aria-label="LinhaZero, voltar ao início">
            <img src="/logo.png" alt="" width={28} height={33} className="h-8 w-auto" />
            <span className="font-display text-statement leading-none">LinhaZero</span>
          </a>
          <p className="mt-4 max-w-[42ch]">
            Compara duas decisões de combate a um incêndio rural antes de comprometer meios no terreno. Por portugueses,
            para Portugal.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-medium">
            <li><a href={DEMO_URL} className="link text-decision-a-light">Cenário de demonstração</a></li>
            <li><a href={SIGNUP_URL} className="link text-decision-a-light">Pedir acesso</a></li>
            <li><a href={SIGNIN_URL} className="link text-decision-a-light">Entrar</a></li>
          </ul>
        </div>
        <div className="lg:col-span-2 lg:col-start-7">
          <p className="font-medium">Documentação</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-small text-muted lg:grid">
            {DOC_LINKS.map(([href, label]) => (
              <li key={label}><a href={href} className="link">{label}</a></li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <p className="font-medium">Imagens</p>
          <p className="mt-2 text-small text-muted">
            {CREDITS.map(([title, page, who, lic, licUrl], i) => (
              <span key={title}>
                <a href={page} className="link">“{title}”</a>, {who}, <a href={licUrl} className="link">{lic}</a>
                {i < CREDITS.length - 1 ? "; " : ". "}
              </span>
            ))}
            Via Wikimedia Commons. Mapa © contribuidores do OpenStreetMap.
          </p>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small text-muted">
        <p>Protótipo do Hack4Guimarães 2035, com a Universidade do Minho e o Laboratório da Paisagem.</p>
        <a href="#" className="link">Voltar ao topo</a>
      </div>
    </footer>
  );
}

export function App() {
  return (
    <>
      <Hero />
      <main>
        <HowItWorks />
        <Answer />
        <Satellite />
        <Proof />
        <Data />
        <Audience />
        <Close />
      </main>
      <Footer />
    </>
  );
}
