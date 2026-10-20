import { lazy, Suspense, useEffect, useRef, useState } from "react";

const HeroMap = lazy(() => import("./HeroMap"));

/**
 * The interface: app.<domain> next to this page (landing.<domain> or <domain>), worked out in the browser so one build
 * serves any domain. VITE_APP_URL overrides it; on localhost (`npm run dev:landing`) it is /app/.
 */
export const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) ?? appNextToLanding(globalThis.location ?? { protocol: "https:", hostname: "localhost" });

export function appNextToLanding({ protocol, hostname }: Pick<Location, "protocol" | "hostname">): string {
  if (hostname === "localhost" || /^[\d.:[\]]+$/.test(hostname)) return "/app/";
  return `${protocol}//app.${hostname.replace(/^landing\./, "")}/`;
}
/** The demonstration scenario, which opens without login. Set VITE_DEMO_URL when it moves. */
export const DEMO_URL = (import.meta.env.VITE_DEMO_URL as string | undefined) ?? `${APP_URL}?demo`;
/** The login: the app's API sends the browser to Keycloak (account.<domain>) and back into the app. */
export const SIGNIN_URL = (import.meta.env.VITE_SIGNIN_URL as string | undefined) ?? `${APP_URL}api/auth/login`;
/** The request form at the end of the page; it posts to the app's API (docs/decisoes/0062). */
export const SIGNUP_URL = "#pedir-acesso";
/** Where the divider between A and B settles: through the head of the fire, where A and B differ. */
export const SPLIT_START = 0.7;
/** Where the load sweep starts: almost all of the frame is decision A. */
const SPLIT_FROM = 0.97;
const SPLIT_MIN = 0.06;

const NAV = [
  ["#como-funciona", "Como funciona"],
  ["#validacao", "Validação"],
  ["#dados", "Dados"],
  ["#para-quem", "Para quem"],
  ["#quem-somos", "Quem somos"],
] as const;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The 3D relief only where it earns its cost: a pointer to follow, motion allowed, a wide screen. */
function wants3d(): boolean {
  return matchMedia("(pointer: fine)").matches && !reduced() && matchMedia("(min-width: 1024px)").matches;
}

const HOURS = [
  ["var(--fire-1)", "1.ª hora"],
  ["var(--fire-2)", "2.ª"],
  ["var(--fire-3)", "3.ª"],
  ["var(--fire-4)", "4.ª"],
] as const;

/** The posters at three widths (scripts/to-webp.ts makes the smaller two); index.html preloads the same set. */
const POSTER_SET = (d: "a" | "b") => `/hero/hero-${d}-800.webp 800w, /hero/hero-${d}-1200.webp 1200w, /hero/hero-${d}.webp 1600w`;
/** Phones show the poster zoomed (.poster in index.css): about twice the screen's width. */
const POSTER_SIZES = "(max-width: 639px) 200vw, 100vw";

const clampSplit = (v: number) => Math.max(SPLIT_MIN, Math.min(1 - SPLIT_MIN, v));

/**
 * The same fire under two decisions. Two full frames of the map (A, then B over it, clipped at the divider)
 * are on the page from the first paint; the live 3D map replaces them on desktop once the browser is idle.
 * The divider sweeps in on load from almost all A to its start, so B's smaller fire is revealed, and then
 * belongs to the visitor: drag it, or move it with the arrow keys.
 */
function Scene({ follow, className = "" }: { follow: React.RefObject<HTMLElement | null>; className?: string }) {
  const [split, setSplit] = useState(() => (reduced() ? SPLIT_START : SPLIT_FROM));
  const [touched, setTouched] = useState(false);
  const [load3d, setLoad3d] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hold = useRef(false);

  // The load moment: the divider travels to its start in about a second, with the title's rise.
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const t0 = performance.now() + 220, dur = 950;
    const tick = (t: number) => {
      if (hold.current) return;
      const k = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      setSplit(SPLIT_FROM + (SPLIT_START - SPLIT_FROM) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The MapLibre chunk and the grid are fetched after the page has loaded and the browser is idle.
  useEffect(() => {
    if (!wants3d()) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    const start = () => idle(() => setLoad3d(true));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  const splitFrom = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setSplit(clampSplit((clientX - r.left) / r.width));
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    hold.current = true;
    setTouched(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    splitFrom(e.clientX);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { if (hold.current) splitFrom(e.clientX); };
  const onUp = () => { hold.current = false; };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const to = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05, Home: -1, End: 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    hold.current = false;
    setTouched(true);
    setSplit((s) => clampSplit(s + to));
  };
  const pct = `${(split * 100).toFixed(2)}%`;

  return (
    <figure ref={box} data-ui className={`relative m-0 overflow-clip bg-raised select-none ${className}`}>
      {/* The posters are the same 3D view captured once per decision (scripts/hero-poster.ts). */}
      {/* On phones the frame is closer, centred on the fire's head, so the fire is not a speck. The zoom is on the
          picture and B's clip on its wrapper, so the clip stays on the divider. */}
      <img
        src="/hero/hero-a.webp"
        srcSet={POSTER_SET("a")}
        sizes={POSTER_SIZES}
        alt="Mapa em relevo de Guimarães com um fogo de quatro horas na Penha, a área ardida colorida pela hora a que o fogo chega: à esquerda com a decisão A, à direita com a decisão B, que arde menos."
        width={1600}
        height={1000}
        fetchPriority="high"
        className="poster absolute inset-0 h-full w-full object-cover object-[60%_55%]"
      />
      <div className="absolute inset-0 overflow-clip" style={{ clipPath: `inset(0 0 0 ${pct})` }}>
        <img
          src="/hero/hero-b.webp"
          srcSet={POSTER_SET("b")}
          sizes={POSTER_SIZES}
          alt=""
          width={1600}
          height={1000}
          fetchPriority="high"
          className="poster absolute inset-0 h-full w-full object-cover object-[60%_55%]"
        />
      </div>
      {load3d && (
        <div className={`absolute inset-0 transition-opacity duration-700 ${mapReady ? "opacity-100" : "opacity-0"}`}>
          <Suspense fallback={null}>
            <HeroMap follow={follow} split={split} hold={hold} onReady={() => setMapReady(true)} />
          </Suspense>
        </div>
      )}

      {/* The interface's map titles, each on its own side of the divider. */}
      <span
        className={`map-title border-decision-a transition-opacity duration-200 ${split < 0.16 ? "opacity-0" : ""}`}
        style={{ right: `calc(${(100 - split * 100).toFixed(2)}% + 12px)` }}
      >
        Decisão A
      </span>
      <span
        className={`map-title border-decision-b transition-opacity duration-200 ${split > 0.84 ? "opacity-0" : ""}`}
        style={{ left: `calc(${pct} + 12px)` }}
      >
        Decisão B
      </span>

      <div
        role="slider"
        aria-label="Divisor entre a decisão A e a decisão B"
        aria-valuemin={Math.round(SPLIT_MIN * 100)}
        aria-valuemax={Math.round((1 - SPLIT_MIN) * 100)}
        aria-valuenow={Math.round(split * 100)}
        aria-valuetext={`Decisão A à esquerda, decisão B à direita, divisor a ${Math.round(split * 100)} %`}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="divider absolute top-0 bottom-0 w-11 -translate-x-1/2 cursor-col-resize touch-none outline-none"
        style={{ left: pct }}
      >
        <span className="divider-line absolute top-0 bottom-0 left-1/2 w-[3px] -translate-x-1/2 bg-white" />
        <i className="divider-handle absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-white text-[#18211f]">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 3 1 8l4 5M11 3l4 5-4 5" />
          </svg>
        </i>
        <span className={`drag-hint ${touched ? "is-gone" : ""}`} aria-hidden="true">Arraste para comparar</span>
      </div>

      <figcaption className="legend absolute bottom-3 left-3 max-sm:right-3 sm:bottom-4 sm:left-4">
        <span className="font-medium">O fogo chega na</span>
        {HOURS.map(([c, h]) => (
          <span key={h}><i style={{ background: c }} />{h}</span>
        ))}
      </figcaption>
    </figure>
  );
}

function Nav() {
  return (
    <nav aria-label="Principal" className="relative z-10 flex items-center justify-between gap-6 bg-background px-margin py-4">
      <a href="#conteudo" className="skip btn btn-solid">Saltar para o conteúdo</a>
      <a href="#" className="flex min-h-11 items-center gap-2.5" aria-label="LinhaZero, início">
        <img src="/logo-outline.png" alt="" width={85} height={99} className="h-8 w-auto" />
        <span className="font-display text-statement leading-none">LinhaZero</span>
      </a>
      <ul className="hidden items-center gap-7 text-small font-medium lg:flex">
        {NAV.map(([href, label]) => (
          <li key={href}><a href={href} className="inline-block py-3 underline-offset-[0.3em] decoration-2 hover:underline">{label}</a></li>
        ))}
      </ul>
      <div className="flex items-center gap-3 sm:gap-5">
        <a href={SIGNIN_URL} className="link px-1 py-3 text-small font-medium">Entrar</a>
        <a href={SIGNUP_URL} className="btn btn-line min-h-11 px-4 text-small">Pedir acesso</a>
      </div>
    </nav>
  );
}

/**
 * The two words that carry the story: "fogo" in the map's own hour ramp with a heat shimmer, "decisões" in the two
 * decision inks with a slow swell. Both are SVG filters (turbulence displacing the letters by about a pixel, low
 * frequency so the edges never tear) and the gradients drift with them. The effect is one run of four seconds,
 * from 1.1 s after load (the title has risen and the divider sweep has ended) to 5.1 s, easing out to still words: no endless motion beside the content (WCAG 2.2.2), and under
 * reduced motion the words keep their colours and never move.
 */
const HEAT = { begin: "1.1s", dur: "4s" };
const HEAT_MS = 4000;

/**
 * Hovering (or tapping) a word lights it again: the same 4 s eased run. A hover during a run is ignored, so it never
 * stutters; nothing moves under reduced motion; the run pauses while the hero is off screen.
 */
function useReignite() {
  const svg = useRef<SVGSVGElement>(null);
  const words = useRef<Record<"fire" | "water", HTMLSpanElement | null>>({ fire: null, water: null });
  // When each word's current run ends (the first run ends 5.1 s after load).
  const until = useRef({ fire: performance.now() + 1100 + HEAT_MS, water: performance.now() + 1100 + HEAT_MS });

  useEffect(() => {
    const s = svg.current, h1 = s?.nextElementSibling;
    if (!s || !h1 || reduced()) return;
    let pausedAt = 0;
    const running = () => Object.values(words.current).flatMap((w) => w?.getAnimations() ?? []);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && !pausedAt) {
        pausedAt = performance.now();
        s.pauseAnimations();
        for (const a of running()) if (a.playState === "running") a.pause();
      } else if (e.isIntersecting && pausedAt) {
        const away = performance.now() - pausedAt;
        pausedAt = 0;
        until.current.fire += away;
        until.current.water += away;
        s.unpauseAnimations();
        // Only what was paused: play() on a finished animation would start it over.
        for (const a of running()) if (a.playState === "paused") a.play();
      }
    });
    io.observe(h1);
    return () => io.disconnect();
  }, []);

  const reignite = (kind: "fire" | "water") => {
    const now = performance.now();
    if (reduced() || now < until.current[kind]) return;
    until.current[kind] = now + HEAT_MS;
    svg.current?.querySelectorAll<SVGAnimationElement>(`#lz-${kind} animate`).forEach((a) => a.beginElement());
    // The gradient's drift: back to the start of its run, past the load delay.
    for (const a of words.current[kind]?.getAnimations() ?? []) { a.currentTime = 1100; a.play(); }
  };
  return { svg, words, reignite };
}

function Title({ className = "" }: { className?: string }) {
  const { svg, words, reignite } = useReignite();
  // The displacement eases in, holds and eases back to 0, so the words come to rest exactly as drawn.
  const amp = (peak: number) => (
    <animate attributeName="scale" values={`0;${peak};${peak};0`} keyTimes="0;0.2;0.75;1" begin={HEAT.begin} dur={HEAT.dur} fill="freeze" />
  );
  return (
    <>
      <svg ref={svg} width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
          <filter id="lz-fire" x="-4%" y="-10%" width="108%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="1" seed="7" result="noise" />
            <feOffset in="noise" dy="0" result="rise">
              <animate attributeName="dy" values="0;-60" begin={HEAT.begin} dur={HEAT.dur} fill="freeze" />
            </feOffset>
            <feDisplacementMap in="SourceGraphic" in2="rise" scale="0" xChannelSelector="R" yChannelSelector="G">{amp(2)}</feDisplacementMap>
          </filter>
          <filter id="lz-water" x="-4%" y="-10%" width="108%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.004 0.008" numOctaves="1" seed="3" result="swell" />
            <feOffset in="swell" dx="0" result="drift">
              <animate attributeName="dx" values="0;-60" begin={HEAT.begin} dur={HEAT.dur} fill="freeze" />
            </feOffset>
            <feDisplacementMap in="SourceGraphic" in2="drift" scale="0" xChannelSelector="G" yChannelSelector="R">{amp(1.6)}</feDisplacementMap>
          </filter>
        </defs>
      </svg>
      <h1 className={`lines text-display ${className}`}>
        <span className="line"><span data-line style={{ "--i": 0 } as React.CSSProperties}>O mesmo <span className="word-fire" ref={(el) => { words.current.fire = el; }} onPointerEnter={() => reignite("fire")}>fogo</span>,</span></span>
        <span className="line"><span data-line style={{ "--i": 1 } as React.CSSProperties}>duas <span className="word-water" ref={(el) => { words.current.water = el; }} onPointerEnter={() => reignite("water")}>decisões</span></span></span>
      </h1>
    </>
  );
}

const Lead = ({ className = "" }: { className?: string }) => (
  <div className={className} data-load style={{ "--d": "420ms" } as React.CSSProperties}>
    <p className="max-w-[48ch]">
      O LinhaZero simula um incêndio rural com a decisão A e com a B, lado a lado, e diz em português claro qual
      protege mais edifícios e aldeias. Feito em Guimarães, com dados e incêndios de Portugal.
    </p>
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
      <a href={DEMO_URL} className="btn btn-solid">Cenário de demonstração</a>
      <a href="#como-funciona" className="link py-2 font-medium">Ver como funciona</a>
    </div>
  </div>
);

/**
 * The first screen: the title band (the title, and the sentence with the action on its baseline), then the
 * split map at the full width with the height that remains. The map is the dominant mass and the one live thing.
 */
export function Hero() {
  // The camera follows the pointer across the whole window, not just the hero.
  const page = useRef<HTMLElement | null>(document.body);
  return (
    <header className="relative flex h-svh flex-col">
      <Nav />
      <div className="grid gap-x-6 gap-y-[clamp(0.75rem,2.5svh,1.75rem)] px-margin py-[clamp(1rem,3.5svh,2.5rem)] md:grid-cols-12 lg:items-end">
        <Title className="md:col-span-12 lg:col-span-7" />
        <Lead className="md:col-span-12 lg:col-span-5 lg:col-start-8 lg:pb-3" />
      </div>
      <Scene follow={page} className="min-h-[200px] flex-1" />
    </header>
  );
}

/**
 * Dev only: `/?poster` renders the 3D scene at 800 × 500 (captured at 2× for 1600 × 1000 frames) and writes
 * three WebP data URLs into <pre id="poster"> as JSON: decision A's frame, decision B's frame, and the two split
 * at SPLIT_START (the small map in the scenario panel). scripts/hero-poster.ts reads them with a headless browser.
 */
export function Poster() {
  const scene = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={scene} className="relative bg-raised" style={{ width: 800, height: 500 }}>
        <Suspense fallback={null}>
          <HeroMap
            follow={scene}
            split={1}
            readable
            onReady={([a, b]) => {
              const out = document.createElement("canvas");
              out.width = a.width;
              out.height = a.height;
              const ctx = out.getContext("2d")!;
              const x = Math.round(a.width * SPLIT_START);
              ctx.drawImage(a, 0, 0, x, a.height, 0, 0, x, a.height);
              ctx.drawImage(b, x, 0, b.width - x, b.height, x, 0, b.width - x, b.height);
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(x - 2, 0, 4, a.height);
              document.getElementById("poster")!.textContent = JSON.stringify({
                a: a.toDataURL("image/webp", 0.74),
                b: b.toDataURL("image/webp", 0.74),
                split: out.toDataURL("image/webp", 0.7),
              });
            }}
          />
        </Suspense>
      </section>
      <pre id="poster" hidden />
    </>
  );
}
