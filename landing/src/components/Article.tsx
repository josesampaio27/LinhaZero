import { useEffect, useState, type ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

/** True once the page has scrolled: the bar turns translucent over the content, as on the main page. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(() => scrollY > 0);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 0);
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return scrolled;
}

/**
 * The long-form pages (/motor, /calibracao). Unlike the main page they read as an article, not one screen per
 * section: a title band, an index (sticky beside the text on wide screens), the sections, and what to read next.
 */
export function Article({
  kicker,
  title,
  lead,
  toc,
  next,
  children,
}: {
  kicker: string;
  title: ReactNode;
  lead: ReactNode;
  toc: [string, string][];
  next: { href: string; label: string };
  children: ReactNode;
}) {
  const scrolled = useScrolled();
  return (
    <>
      <Nav stuck={scrolled} />
      <header className="tex tex-isocronas bg-deep px-margin pt-[clamp(2.5rem,8svh,6rem)] pb-[clamp(2rem,6svh,4.5rem)]">
        <p className="text-small font-medium text-muted" data-reveal>{kicker}</p>
        <h1 className="mt-3 max-w-[18ch] text-heading" data-reveal>{title}</h1>
        <p className="mt-5 max-w-[60ch] text-statement" data-reveal style={{ "--i": 1 } as React.CSSProperties}>{lead}</p>
      </header>
      <div className="px-margin lg:grid lg:grid-cols-12 lg:gap-x-6">
        <nav aria-label="Nesta página" className="py-8 lg:col-span-3 lg:py-12">
          <div className="lg:sticky lg:top-[calc(var(--nav)+2rem)]">
            <p className="text-small font-medium text-muted">Nesta página</p>
            <ol className="mt-2 grid gap-1 text-small max-lg:grid-cols-1 sm:max-lg:grid-cols-2">
              {toc.map(([id, label], i) => (
                <li key={id}>
                  <a href={`#${id}`} className="link inline-block py-1">
                    <span className="mr-2 tabular-nums text-muted">{i + 1}.</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <main id="conteudo" tabIndex={-1} className="article min-w-0 pb-16 outline-none lg:col-span-9 lg:col-start-4 lg:py-12">
          {children}
          <p className="mt-16 border-t pt-6">
            <span className="text-small text-muted">A seguir</span>
            <br />
            <a href={next.href} className="link font-display text-statement">{next.label} →</a>
          </p>
        </main>
      </div>
      <Footer />
    </>
  );
}

/** One section of an article, with its heading as the anchor the index links to. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[calc(var(--nav)+1rem)] pt-10 first:pt-0">
      <h2 id={`${id}-h`} className="text-[clamp(1.875rem,min(3.6vw,6svh),3rem)] leading-[0.95]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A figure wider than the text column, with its caption under it. */
export function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="my-8">
      <div className="overflow-x-auto">{children}</div>
      <figcaption className="mt-3 max-w-[72ch] text-small text-muted">{caption}</figcaption>
    </figure>
  );
}

/** The precise terms for a specialist, out of the way of the plain explanation. */
export function Expert({ children }: { children: ReactNode }) {
  return (
    <aside className="expert my-6 max-w-[68ch] rounded-lg border-l-[5px] border-raised bg-panel px-5 py-4 text-small">
      <p className="mb-1 font-medium text-ink">Para especialistas</p>
      {children}
    </aside>
  );
}

/** A short numbered list of references at the end of a page. */
export function References({ items }: { items: string[] }) {
  return (
    <ol className="refs mt-4 grid max-w-[80ch] gap-2 text-small text-muted">
      {items.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ol>
  );
}
