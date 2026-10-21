import { DEMO_URL, SIGNIN_URL, SIGNUP_URL } from "@/components/Hero";

/* ---------- Footer: a quiet close, on the page's margins ---------- */

const CREDITS: [string, string, string, string, string][] = [
  ["18 June 2017 Portugal Wildfires", "https://commons.wikimedia.org/wiki/File:18_June_2017_Portugal_Wildfires.png", "NASA, MODIS", "domínio público", "https://creativecommons.org/publicdomain/mark/1.0/"],
  ["Guimarães vista da Penha", "https://commons.wikimedia.org/wiki/File:Guimar%C3%A3es_vista_da_Penha_(46424699582).jpg", "Halley Oliveira", "CC BY-SA 2.0", "https://creativecommons.org/licenses/by-sa/2.0"],
  ["Caminho pedonal na Penha, Guimarães 01", "https://commons.wikimedia.org/w/index.php?curid=10814320", "Manuel_Rocha", "CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0"],
  ["Incêndio de Monchique - 2018", "https://commons.wikimedia.org/wiki/File:Inc%C3%AAndio_de_Monchique_-_2018.jpg", "Bextrel", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0"],
];

/** The site explains the engine itself: the two pages on how it works and how it was calibrated and validated. */
const DOC_LINKS: [string, string][] = [
  ["/motor", "Como funciona o motor"],
  ["/calibracao", "Calibração e validação"],
];

export function Footer() {
  return (
    <footer className="tex tex-edificios bg-deep px-margin pt-[clamp(3rem,8svh,6rem)] pb-6">
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <a href="/" className="inline-flex min-h-11 items-center gap-2.5" aria-label="LinhaZero, voltar ao início">
            <img src="/logo-outline.png" alt="" width={85} height={99} className="h-8 w-auto" />
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
              <li key={label}><a href={href} className="link inline-block py-0.5">{label}</a></li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <p className="font-medium">Imagens</p>
          <p className="mt-2 max-w-[70ch] text-small text-muted">
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

