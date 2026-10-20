import { lazy, Suspense, useEffect, useRef, useState } from "react";

const HeroMap = lazy(() => import("./HeroMap"));

/** The interface. Set VITE_APP_URL when the two are served apart. */
export const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? "/app/";
/** The demonstration scenario, which opens without login. Set VITE_DEMO_URL when it moves. */
export const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) ?? `${APP_URL}?demo`;
/** The login: the app's API sends the browser to Keycloak (account.<domain>) and back into the app. */
export const SIGNIN_URL = (import.meta.env.VITE_SIGNIN_URL as string | undefined) ?? `${APP_URL}api/auth/login`;
/** Not built yet: the request goes to the LinhaZero team (docs/plano/landing.md). */
export const SIGNUP_URL = "/pedir-acesso";
/** Where the divider between A and B starts: just west of the ignition, so both fires are in view. */
export const SPLIT_START = 0.62;
/** The hero map's box on desktop, and the poster's (scripts/hero-poster.ts captures at 960 × 400, 2×). */
export const MAP_RATIO = "12 / 5";

const NAV = [
  ["#como-funciona", "Como funciona"],
  ["#validacao", "Validação"],
  ["#dados", "Dados"],
  ["#para-quem", "Para quem"],
] as const;

/** The 3D relief only where it earns its cost: a pointer to follow, motion allowed, a wide screen. */
function wants3d(): boolean {
  return (
    matchMedia("(pointer: fine)").matches &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    matchMedia("(min-width: 1024px)").matches
  );
}

const HOURS = [
  ["var(--fire-1)", "1.ª hora"],
  ["var(--fire-2)", "2.ª"],
  ["var(--fire-3)", "3.ª"],
  ["var(--fire-4)", "4.ª"],
] as const;

/** The map scene: the poster first, the live split map over it once loaded (desktop only). */
function Scene({ follow }: { follow: React.RefObject<HTMLElement | null> }) {
  const [load3d, setLoad3d] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // The MapLibre chunk and the grid are fetched after the page has loaded and the browser is idle.
  useEffect(() => {
    if (!wants3d()) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    const start = () => idle(() => setLoad3d(true));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  return (
    <figure className="relative m-0 min-h-[200px] flex-1 overflow-clip bg-raised" data-open>
      <img
        src="/hero/hero.webp"
        alt="Mapa em relevo de Guimarães com um fogo de quatro horas na Penha, a área ardida colorida pela hora a que o fogo chega: à esquerda com a decisão A, à direita com a decisão B, que arde menos."
        width={1920}
        height={800}
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-[64%_50%]"
      />
      {load3d && (
        <div className={`absolute inset-0 transition-opacity duration-700 ${mapReady ? "opacity-100" : "opacity-0"}`}>
          <Suspense fallback={null}>
            <HeroMap follow={follow} splitStart={SPLIT_START} onReady={() => setMapReady(true)} />
          </Suspense>
        </div>
      )}
      {/* Before the live map arrives (and on phones), the poster carries the same two titles. */}
      {!mapReady && (
        <div data-ui className="pointer-events-none absolute inset-0">
          <span className="map-title left-2.5 border-decision-a">Decisão A</span>
          <span className="map-title right-2.5 border-decision-b">Decisão B</span>
        </div>
      )}
      <figcaption data-ui className="legend absolute bottom-3 left-3 max-sm:right-3 sm:bottom-4 sm:left-4">
        <span className="font-medium">O fogo chega na</span>
        {HOURS.map(([c, h]) => (
          <span key={h}><i style={{ background: c }} />{h}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * The first screen: the title on the dark ground, the sentence and the action at its right on the same
 * baseline, then the live split map at the full width: the same fire, decision A left, decision B right.
 */
export function Hero() {
  // The camera follows the pointer across the whole window, not just the hero.
  const page = useRef<HTMLElement | null>(document.body);
  return (
    <header className="relative flex h-svh flex-col">
      <nav aria-label="Principal" className="flex items-center justify-between gap-6 px-margin py-4">
        <a href="#" className="flex items-center gap-2.5" aria-label="LinhaZero, início">
          <img src="/logo.png" alt="" width={28} height={33} className="h-8 w-auto" />
          <span className="font-display text-statement leading-none">LinhaZero</span>
        </a>
        <ul className="hidden items-center gap-7 text-small font-medium lg:flex">
          {NAV.map(([href, label]) => (
            <li key={href}><a href={href} className="underline-offset-[0.3em] decoration-2 hover:underline">{label}</a></li>
          ))}
        </ul>
        <div className="flex items-center gap-3 sm:gap-5">
          <a href={SIGNIN_URL} className="link px-1 py-3 text-small font-medium">Entrar</a>
          <a href={SIGNUP_URL} className="btn btn-line min-h-11 px-4 text-small">Pedir acesso</a>
        </div>
      </nav>

      {/* Title and text share one baseline; the gaps above and below the block are equal, and the map takes the rest. */}
      <div className="grid gap-x-6 gap-y-[clamp(0.75rem,2.5svh,1.75rem)] px-margin py-[clamp(1rem,3.5svh,2.5rem)] md:grid-cols-12 lg:items-end">
        <h1 className="lines text-display md:col-span-12 lg:col-span-7">
          <span className="line"><span data-line style={{ "--i": 0 } as React.CSSProperties}>O mesmo fogo,</span></span>
          <span className="line"><span data-line style={{ "--i": 1 } as React.CSSProperties}>duas decisões</span></span>
        </h1>
        <div
          className="md:col-span-12 md:grid md:grid-cols-12 md:items-end md:gap-x-6 lg:col-span-5 lg:col-start-8 lg:block lg:pb-3 2xl:col-start-7"
          data-load
          style={{ "--d": "380ms" } as React.CSSProperties}
        >
          <p className="max-w-[52ch] md:col-span-7">
            O LinhaZero simula um incêndio rural com a decisão A e com a B, lado a lado, e diz em português claro qual
            protege mais edifícios e aldeias. Feito em Guimarães, com dados e incêndios de Portugal.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-5 md:mt-0 md:justify-end lg:mt-5 lg:justify-start">
            <a href={DEMO_URL} className="btn btn-solid">Cenário de demonstração</a>
            <a href="#como-funciona" className="link py-2 font-medium">Ver como funciona</a>
          </div>
        </div>
      </div>

      <Scene follow={page} />
    </header>
  );
}

/**
 * Dev only: `/?poster` renders just the 3D scene at the hero box's ratio (captured at 2× for a 1920 × 800 image)
 * and writes it as a WebP data URL into <pre id="poster">, which scripts/hero-poster.ts reads with a headless browser.
 */
export function Poster() {
  const scene = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={scene} className="relative bg-raised" style={{ width: 960, height: 400 }}>
        <Suspense fallback={null}>
          <HeroMap
            follow={scene}
            splitStart={SPLIT_START}
            readable
            onReady={([a, b]) => {
              // A on the left of the divider, B on the right, split where the live divider starts.
              const out = document.createElement("canvas");
              out.width = a.width;
              out.height = a.height;
              const ctx = out.getContext("2d")!;
              const x = Math.round(a.width * SPLIT_START);
              ctx.drawImage(a, 0, 0, x, a.height, 0, 0, x, a.height);
              ctx.drawImage(b, x, 0, b.width - x, b.height, x, 0, b.width - x, b.height);
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x - 2, 0, 4, a.height);
              document.getElementById("poster")!.textContent = out.toDataURL("image/webp", 0.8);
            }}
          />
        </Suspense>
      </section>
      <pre id="poster" hidden />
    </>
  );
}
