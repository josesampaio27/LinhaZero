import { SIGNIN_URL, SIGNUP_URL } from "@/components/Hero";

/**
 * The bar's links. Sections of the main page are written as "/#id", so they work from the subpages too (on the main
 * page the browser only scrolls); the two subpages explain the engine and its calibration.
 */
const NAV = [
  ["/#como-funciona", "Como funciona"],
  ["/motor", "O simulador"],
  ["/calibracao", "Calibração"],
  ["/#dados", "Dados"],
  ["/#quem-somos", "Quem somos"],
] as const;

/**
 * The bar stays at the top while the page scrolls (sticky on the page root, var(--nav) tall). Over the hero it sits on the
 * page ground; once the page scrolls it turns translucent and blurs what passes under it.
 * Once the hero's top has left the screen it steps one tone up, so it reads as a bar over the content.
 */
export function Nav({ stuck }: { stuck: boolean }) {
  const here = location.pathname.replace(/\/$/, "") || "/";
  return (
    <nav
      aria-label="Principal"
      className={`sticky top-0 z-30 flex h-(--nav) items-center justify-between gap-6 px-margin transition-[background-color,backdrop-filter] duration-200 ${stuck ? "nav-glass" : "bg-background"}`}
    >
      <a href="#conteudo" className="skip btn btn-solid">Saltar para o conteúdo</a>
      <a href="/" className="flex min-h-11 items-center gap-2.5" aria-label="LinhaZero, início">
        <img src="/logo-outline.png" alt="" width={85} height={99} className="h-8 w-auto" />
        <span className="font-display text-statement leading-none">LinhaZero</span>
      </a>
      <ul className="hidden items-center gap-7 text-small font-medium lg:flex">
        {NAV.map(([href, label]) => (
          <li key={href}>
            <a
              href={href}
              aria-current={href === here ? "page" : undefined}
              className="inline-block py-3 underline-offset-[0.3em] decoration-2 hover:underline aria-[current=page]:underline"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Phones keep one compact row: the wordmark and the request; "Entrar" is in the footer too. */}
        <a href={SIGNIN_URL} className="link px-1 py-3 text-small font-medium max-sm:hidden">Entrar</a>
        <a href={SIGNUP_URL} className="btn btn-line min-h-11 px-4 text-small">Pedir acesso</a>
      </div>
    </nav>
  );
}
