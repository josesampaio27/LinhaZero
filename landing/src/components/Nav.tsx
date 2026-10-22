import { DropdownMenu } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { SIGNIN_URL, SIGNUP_URL } from "@/components/Hero";

/**
 * The bar's links are all sections of the main page, written as "/#id" so they work from the subpages too (on the main
 * page the browser only scrolls). The two subpages, which load a new page, sit apart under "Documentação", so every
 * link in the bar does one thing.
 */
const SECTIONS = [
  ["/#como-funciona", "Como funciona"],
  ["/#validacao", "Validação"],
  ["/#dados", "Dados"],
  ["/#quem-somos", "Quem somos"],
] as const;

const DOCS = [
  ["/motor", "O simulador", "Como o território, o fogo e as decisões são simulados"],
  ["/calibracao", "Calibração e validação", "Como foi ajustado e posto à prova em incêndios reais"],
  ["/ficha-tecnica", "Ficha técnica", "Os modelos em que se baseia e como usa o combustível do mapa"],
] as const;

/**
 * The bar stays at the top while the page scrolls (sticky on the page root, var(--nav) tall). Over the hero it sits on the
 * page ground; once the page scrolls it turns translucent and blurs what passes under it.
 * Once the hero's top has left the screen it steps one tone up, so it reads as a bar over the content.
 */
export function Nav({ stuck }: { stuck: boolean }) {
  const here = location.pathname.replace(/\/$/, "") || "/";
  const inDocs = DOCS.some(([href]) => href === here);
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
        {SECTIONS.map(([href, label]) => (
          <li key={href}>
            <a href={href} className="inline-block py-3 underline-offset-[0.3em] decoration-2 hover:underline">
              {label}
            </a>
          </li>
        ))}
        <li className="border-l border-border pl-7">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger
              data-current={inDocs || undefined}
              className="group inline-flex items-center gap-1 py-3 underline-offset-[0.3em] decoration-2 hover:underline data-current:underline"
            >
              Documentação
              <ChevronDown aria-hidden size={16} strokeWidth={2} className="transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-40 w-80 border border-border bg-panel p-2 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)]"
              >
                {DOCS.map(([href, label, blurb]) => (
                  <DropdownMenu.Item key={href} asChild>
                    <a
                      href={href}
                      aria-current={href === here ? "page" : undefined}
                      className="block px-3 py-2.5 outline-none data-highlighted:bg-raised aria-[current=page]:bg-raised"
                    >
                      <span className="block font-medium">{label}</span>
                      <span className="block text-small text-muted">{blurb}</span>
                    </a>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </li>
      </ul>
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Phones keep one compact row: the wordmark and the request; "Entrar" is in the footer too. */}
        <a href={SIGNIN_URL} className="link px-1 py-3 text-small font-medium max-sm:hidden">Entrar</a>
        <a href={SIGNUP_URL} className="btn btn-line min-h-11 px-4 text-small">Pedir acesso</a>
      </div>
    </nav>
  );
}
