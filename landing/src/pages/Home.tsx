import { useEffect, useState, type FormEvent } from "react";
import { APP_URL, DEMO_URL, Hero } from "@/components/Hero";
import { ScenarioCard, type Stage } from "@/components/ScenarioCard";
import { Footer } from "@/components/Footer";
import { WinsBars } from "@/components/charts/WinsBars";
import { num, pct } from "@/components/charts/common";
import data from "@/data/site-data.json";
import { fireName } from "@/lib/fires";

const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

// Every section is one screen (`.screen`): it fits one viewport on its own at every size scripts/fit-check.ts
// measures. Where a phone has no room, the section's picture or panel is left out there rather than cropped.

/* ---------- How it works: the five steps beside the scenario panel; pick a step to see the panel at it ---------- */

const STEPS: [string, string][] = [
  ["Marca-se a ignição no mapa.", "A grelha de Guimarães já traz combustível, relevo, estradas e 12 000 edifícios."],
  ["O tempo vem do IPMA.", "Vento, humidade e temperatura daquele local e daquela hora, que se podem ajustar."],
  ["Desenham-se duas decisões.", "Uma linha de contenção contra um ataque direto, com a hora a que os meios chegam."],
  ["Os dois mapas avançam juntos.", "Hora a hora, com a área ardida colorida pela hora a que o fogo chega."],
  ["Por baixo, a comparação.", "Edifícios e aldeias protegidos, e em quantas de 30 variações do vento cada decisão ganha."],
];

/** True from the md breakpoint up, where the scenario panel is on screen. */
function useWide() {
  const q = "(min-width: 768px)";
  const [wide, setWide] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function HowItWorks() {
  const [stage, setStage] = useState<Stage>(5);
  // Without the panel (phones) a step has nothing to show: plain list items, not buttons that do nothing.
  const wide = useWide();
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
          <ol className="mt-[clamp(0.75rem,2.5svh,2rem)] grid gap-1">
            {STEPS.map(([step, detail], i) => (
              <li key={step} data-reveal="row" style={css({ "--i": i + 1 })}>
                {wide ? (
                  <button
                    type="button"
                    aria-pressed={stage === i + 1}
                    onClick={() => setStage((i + 1) as Stage)}
                    onMouseEnter={() => setStage((i + 1) as Stage)}
                    className={`block w-full border-l-[5px] py-[clamp(0.35rem,1svh,0.9rem)] pl-5 text-left transition-colors duration-200 hover:bg-panel ${stage === i + 1 ? "border-ink bg-panel" : "border-raised"}`}
                  >
                    <span className="block text-statement font-medium">{step}</span>
                    <span className="mt-1 block max-w-[52ch] text-muted">{detail}</span>
                  </button>
                ) : (
                  <div className="border-l-[5px] border-raised py-[clamp(0.35rem,1svh,0.9rem)] pl-5">
                    <span className="block text-statement font-medium">{step}</span>
                    <span className="mt-1 block max-w-[52ch] text-muted">{detail}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-small" data-reveal style={css({ "--i": 6 })}>
            <a href="/motor" className="link font-medium">Como o motor simula o fogo</a>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- The answer: the sentences the interface writes, at the size of the page ---------- */

const Slot = ({ children }: { children: React.ReactNode }) => <span className="slot">{children}</span>;

function Answer() {
  return (
    <section id="resposta" aria-labelledby="resposta-h" className="tex tex-isocronas fit flex flex-col bg-deep px-margin lg:min-h-[calc(100svh-var(--nav))]">
      <div className="grid flex-1 gap-x-6 gap-y-10 md:grid-cols-12">
        <div className="self-center md:col-span-12 lg:col-span-7">
          <h2 id="resposta-h" className="text-heading" data-reveal>A resposta, por palavras</h2>
          <p className="mt-5 max-w-[54ch]" data-reveal style={css({ "--i": 1 })}>
            Por baixo dos dois mapas, o LinhaZero escreve o que muda, com a cor da decisão que ganha. As frases são sempre
            estas; os números saem do cenário.
          </p>
          <div data-ui className="says mt-[clamp(1.25rem,4svh,2.5rem)] text-statement">
            <p className="win-B" data-reveal="row" style={css({ "--i": 2 })}>A decisão B protege <Slot>X</Slot> edifícios a mais do que a A.</p>
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

/* ---------- Proof: the validation, as a table and the coverage of the test fires (numbers from data/site-data.json) ---------- */

const V = data.validation.sets;
const VALIDATION: [string, number, number, number][] = [
  [`${V.all.fires} de 2018 a 2021`, V.all.simple, V.all.physical, V.all.calibrated],
  [`${V.norte.fires} no Norte`, V.norte.simple, V.norte.physical, V.norte.calibrated],
  [`${V.unseen.fires} fora do ajuste`, V.unseen.simple, V.unseen.physical, V.unseen.calibrated],
];
const COVERED = data.coverage.heldOut;
const WINS = `O LinhaZero acerta mais do que o modelo simples em ${data.validation.winsOverSimple} destes ${V.all.fires} incêndios.`;

function Proof() {
  const fires = data.coverage.perFire.map((f) => fireName(f.fire));
  return (
    <section id="validacao" aria-labelledby="validacao-h" className="fit px-margin">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 id="validacao-h" className="text-heading" data-reveal>
            Testado em 80
            <br />
            incêndios portugueses
          </h2>
          <p className="mt-4 max-w-[34ch] text-statement lg:hidden" data-reveal style={css({ "--i": 1 })}>{WINS}</p>
          <table className="mt-[clamp(1.25rem,4svh,3rem)] w-full border-collapse text-left tabular-nums" data-reveal style={css({ "--i": 2 })}>
            <caption className="mb-3 text-left text-small text-muted">
              Dos 80, só os 34 de 2018 a 2021 têm o combustível do próprio ano. Sobreposição com a área que ardeu: os fogos
              reais foram combatidos e a simulação não, por isso nem um motor perfeito chegaria a 1. O modelo simples é o do
              primeiro protótipo: uma velocidade fixa por tipo de vegetação, mais rápida com vento e a subir.
            </caption>
            <thead>
              <tr className="text-small text-muted">
                <th scope="col" className="py-2.5 pr-3 font-medium">Incêndios</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Modelo simples</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium">Sem calibrar</th>
                <th scope="col" className="py-2.5 pr-3 text-right font-medium text-ink">LinhaZero</th>
              </tr>
            </thead>
            <tbody>
              {VALIDATION.map(([set, a, b, c], i) => (
                <tr key={set} className={i % 2 ? "" : "bg-panel"}>
                  <td className="py-1.5 pr-3 pl-3 sm:py-3">{set}</td>
                  <td className="py-1.5 pr-3 text-right sm:py-3">{num(a)}</td>
                  <td className="py-1.5 pr-3 text-right sm:py-3">{num(b)}</td>
                  <td className="py-1.5 pr-3 text-right font-medium sm:py-3">{num(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 max-w-[62ch]" data-reveal style={css({ "--i": 3 })}>
            <span className="max-sm:hidden">
              Incêndios do PT-FireSprd simulados da ignição real, com o tempo real e sem combate. Uma mudança no motor só entra se
              melhorar em fogos que não serviram para a afinar.{" "}
            </span>
            <a href="/calibracao" className="link font-medium">Como foi calibrado e validado</a>
            {" · "}
            <a href="/motor" className="link font-medium">Como funciona o motor</a>
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-4 max-md:hidden lg:col-span-5 lg:col-start-8 lg:mt-0">
          <p className="hidden max-w-[34ch] text-statement lg:block" data-reveal style={css({ "--i": 1 })}>{WINS}</p>
          <div data-reveal style={css({ "--i": 3 })}>
            <WinsBars
              label="Diferença de sobreposição com a área ardida, LinhaZero menos modelo simples, por incêndio"
              rows={data.validation.perFire.map((f) => ({ fire: fireName(f.fire), calibrated: f.calibrated, simple: f.simple }))}
            />
            <p className="mt-3 text-small text-muted">
              E da área que ardeu, a simulação calibrada também arde {pct(COVERED.current.recall)}; sem calibrar, {pct(COVERED.physical.recall)}{" "}
              ({fires.length} incêndios de teste).
            </p>
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
          <p className="mt-5 max-w-[46ch]" data-reveal style={css({ "--i": 1 })}>
            Fontes portuguesas e europeias sobre Portugal, numa grelha de Guimarães que vai da cidade à Penha.
          </p>
          <dl className="mt-[clamp(1rem,3.5svh,2.5rem)] grid gap-y-[clamp(0.5rem,1.6svh,1rem)]">
            {SOURCES.map(([name, what], i) => (
              <div key={name} className="grid sm:grid-cols-[11.5rem_1fr] sm:items-baseline sm:gap-6" data-reveal="row" style={css({ "--i": i + 2 })}>
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
  ["Comandante das operações", "Escolher entre duas táticas e justificar a escolha."],
  ["Proteção civil municipal", "Preparar planos prévios para cada encosta."],
  ["GNR", "Que estradas cortar e que aldeias avisar."],
  ["INEM", "Onde posicionar os meios de socorro."],
  ["Bombeiros", "Treinar e rever ocorrências reais."],
  ["Câmara e Laboratório da Paisagem", "Onde as faixas de gestão protegem mais casas."],
];

function Audience() {
  return (
    <section id="para-quem" aria-labelledby="para-quem-h" className="fit px-margin">
      <div className="grid gap-x-6 lg:grid-cols-12">
        <h2 id="para-quem-h" className="text-heading lg:col-span-5" data-reveal>Para quem decide</h2>
        <p className="mt-4 max-w-[52ch] lg:col-span-6 lg:col-start-7 lg:mt-0 lg:self-end" data-reveal style={css({ "--i": 1 })}>
          Feito por quem conhece os incêndios do país: a mesma imagem para todas as entidades, antes,
          durante e depois de um incêndio.
        </p>
        <dl className="mt-[clamp(1rem,3svh,3.5rem)] lg:col-span-12">
          {ROLES.map(([who, why], i) => (
            <div
              key={who}
              className={`grid px-3 py-[clamp(0.35rem,1svh,1rem)] sm:grid-cols-12 sm:items-baseline sm:gap-6 ${i % 2 ? "" : "bg-panel"}`}
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

/* ---------- Who makes it: the two developers, between who it is for and the request ---------- */

// Sample content until the real one arrives: the pictures in public/team/ are placeholders (4:5); swap the files.
const TEAM: { name: string; role: string; photo: string }[] = [
  // Alphabetical.
  { name: "José Sampaio", role: "Senior Software Engineer", photo: "/team/jose-sampaio.webp" },
  { name: "Rodrigo Vicente", role: "Mid Software Engineer & DevOps", photo: "/team/rodrigo.webp" },
];

function Team() {
  return (
    <section id="quem-somos" aria-labelledby="quem-somos-h" className="fit bg-deep px-margin">
      <div className="grid gap-x-6 gap-y-[clamp(1.25rem,4svh,3rem)] lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-4 lg:pb-2">
          <h2 id="quem-somos-h" className="text-heading" data-reveal>Quem somos</h2>
          <p className="mt-5 max-w-[34ch]" data-reveal style={css({ "--i": 1 })}>
            As duas pessoas que construíram o LinhaZero para o Hack4Guimarães 2035.
          </p>
        </div>
        {/* Two portraits side by side at every size, each with its name and role under it. */}
        <ul className="grid grid-cols-2 gap-x-[clamp(0.75rem,2vw,1.5rem)] lg:col-span-8">
          {TEAM.map((p, i) => (
            <li key={p.photo} className="flex flex-col" data-reveal="mask" style={css({ "--i": i + 1 })}>
              <img
                src={p.photo}
                alt={`Retrato de ${p.name}`}
                width={800}
                height={1000}
                loading="lazy"
                decoding="async"
                className="aspect-[4/5] max-h-[min(58svh,44rem)] w-full bg-raised object-cover lg:h-[min(52svh,40rem)] lg:max-h-none lg:w-auto lg:self-start"
              />
              <div>
                <p className="mt-3 font-display text-statement leading-tight">{p.name}</p>
                <p className="mt-1 text-small text-muted" lang="en">{p.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Close: the slogan, and the first step already open ---------- */

/** The same list the API accepts (backend/src/LinhaZero.Api/Validation/AccessRequestValidator.cs). */
const KINDS = ["Bombeiros", "Proteção civil", "Câmara", "GNR", "Outra"];

/** The app's API, which keeps the requests: app.<domain>/api/v1/access-requests (docs/decisoes/0062). */
const ACCESS_REQUESTS_URL = new URL("api/v1/access-requests", new URL(APP_URL, location.href)).toString();

type Sent = "idle" | "sending" | "sent";

function AccessRequest() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [entity, setEntity] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // the trap: hidden from people, filled in by bots
  const [state, setState] = useState<Sent>("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch(ACCESS_REQUESTS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "X-LinhaZero": "1" },
        body: JSON.stringify({ name, email, organization: entity, organizationType: kind, message, website }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const body: { error?: string } | null = await res.json().catch(() => null);
      setError(body?.error ?? `Não foi possível enviar o pedido (erro ${res.status}).`);
    } catch {
      setError("Não foi possível enviar o pedido. Verifique a ligação e tente de novo.");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div data-ui className="dialog" role="status">
        <p className="font-display text-[clamp(1.25rem,3.2svh,1.625rem)] leading-tight">Pedido enviado</p>
        <p>
          Obrigado, {name.split(" ")[0]}. A equipa do LinhaZero vai ver o pedido de {entity}. Quando for aprovado, recebe em{" "}
          <b>{email}</b> um email para escolher a palavra-passe e entrar.
        </p>
      </div>
    );
  }

  return (
    <form data-ui className="dialog" onSubmit={(e) => void send(e)}>
      {/* On phones the section's heading already names the form: the title stays for screen readers only. */}
      <p className="font-display text-[clamp(1.25rem,3.2svh,1.625rem)] leading-tight max-sm:sr-only">Pedir acesso ao LinhaZero</p>
      {/* Name and email share a row where there is width for both. */}
      <div className="pair">
      <label>
        Nome
        <input type="text" name="name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <label>
        Email
        <input type="email" name="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      </div>
      <label>
        Entidade
        <input
          type="text"
          name="organization"
          required
          maxLength={200}
          placeholder="Ex.: BV de Guimarães"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          autoComplete="organization"
        />
      </label>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[15px] font-medium">Tipo de entidade</legend>
        <div className="seg">
          {KINDS.map((k) => (
            <label key={k} className="relative">
              <input type="radio" name="organizationType" value={k} checked={kind === k} onChange={() => setKind(k)} />
              <span>{k}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <span>
          Mensagem <span className="font-normal text-muted">(opcional)</span>
        </span>
        <textarea name="message" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="trap" aria-hidden="true">
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "A enviar…" : "Pedir acesso"}
      </button>
    </form>
  );
}

function Close() {
  return (
    <section id="pedir-acesso" aria-labelledby="pedir-acesso-h" className="tex tex-penha screen bg-decision-a px-margin text-white">
      <div className="grid items-center gap-x-6 gap-y-[clamp(0.75rem,3svh,2rem)] lg:grid-cols-12">
        <div className="lg:col-span-6" data-reveal>
          <h2 id="pedir-acesso-h" className="text-heading">
            Simular, comparar
            <br />
            e aperfeiçoar.
          </h2>
          <p className="mt-5 max-w-[44ch] max-sm:hidden">
            Peça acesso para a sua entidade. O pedido chega à equipa do LinhaZero, que responde com os próximos passos.
            Até lá, o cenário de demonstração abre sem login.
          </p>
          <a href={DEMO_URL} className="link mt-3 inline-block py-2 font-medium max-sm:mt-1">Cenário de demonstração</a>
        </div>
        <div className="lg:col-span-5 lg:col-start-8" data-reveal style={css({ "--i": 1 })}>
          <AccessRequest />
        </div>
      </div>
    </section>
  );
}

export function Home() {
  return (
    <>
      <Hero />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <HowItWorks />
        <Answer />
        <Satellite />
        <Proof />
        <Data />
        <Audience />
        <Team />
        <Close />
      </main>
      <Footer />
    </>
  );
}
