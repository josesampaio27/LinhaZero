import { useEffect, useRef, useState, type ReactNode } from "react";
import { FeedbackDialog } from "./FeedbackDialog";
import { Icon, Mark, type IconName } from "./Icon";
import { ACCOUNT_URL, loginUrl, logout, useSession } from "../lib/session";

export interface Tab<T extends string> {
  id: T;
  label: string;
  done?: boolean;
  /** Keyboard shortcut that opens this tab (e.g. "1"), announced and shown in the tooltip. */
  shortcut?: string;
}

interface Props<T extends string> {
  title: string;
  /** Optional: the title becomes a button ("Guimarães ▾") opening this panel, e.g. the zone and scenario switcher. */
  titleMenu?: (close: () => void) => ReactNode;
  /** App bar menu; `close` hides it after an action. Omitted (the demo), there is no menu button. */
  menu?: (close: () => void) => ReactNode;
  /** The map area. */
  stage: ReactNode;
  /** Steps shown as tabs; omit to hide them (e.g. while drawing). */
  tabs?: Tab<T>[];
  tab?: T;
  onTab?: (t: T) => void;
  /** Pinned under the sheet body: the primary action. */
  footer?: ReactNode;
  /** Phones: true folds the sheet down to its footer (e.g. while drawing, so the map gets the height); false unfolds it. */
  collapse?: boolean;
  children: ReactNode;
}

/**
 * Page layout shared by the simulation and the grid editor. Phones: app bar, map, bottom sheet.
 * From 900 px: the sheet becomes a left panel and the map takes the rest (styles.css).
 */
export function Shell<T extends string>({ title, titleMenu, menu, stage, tabs, tab, onTab, footer, collapse, children }: Props<T>) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (collapse !== undefined) setOpen(!collapse);
  }, [collapse]);
  return (
    <div className="shell">
      <header className="appbar">
        <Mark />
        <span className="appbar-title">
          <b>
            Linha<span>Zero</span>
          </b>
          {titleMenu ? (
            <Popover className="title-menu" label={title} text={<span className="title-text">{title}</span>}>
              {titleMenu}
            </Popover>
          ) : (
            <span title={title}>{title}</span>
          )}
        </span>
        <SignIn />
        <FeedbackButton />
        <AccountMenu />
        {menu && (
          <Popover icon="menu" label="Menu" className="menu">
            {menu}
          </Popover>
        )}
      </header>
      <div className="stage">{stage}</div>
      <section className={`sheet ${open ? "" : "collapsed"}`}>
        <button className="grab" aria-label={open ? "Recolher o painel" : "Expandir o painel"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <i />
        </button>
        {tabs && (
          <nav className="tabs" aria-label="Etapas">
            {tabs.map((t) => (
              <button
                key={t.id}
                aria-current={t.id === tab ? "step" : undefined}
                className={t.id === tab ? "on" : ""}
                aria-keyshortcuts={t.shortcut}
                title={t.shortcut ? `${t.label} (tecla ${t.shortcut})` : undefined}
                onClick={() => {
                  onTab?.(t.id);
                  setOpen(true);
                }}
              >
                {t.done && <Icon name="check" size={14} />}
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </div>
  );
}

/** "Entrar" in the app bar when nobody is signed in (the demo opens without login). */
function SignIn() {
  const session = useSession();
  if (session.state !== "anonymous") return null;
  return (
    <a className="button signin" href={loginUrl()}>
      Entrar
    </a>
  );
}

/** "UT" for "Utilizador de teste": the first letters of the first and last words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** "Reportar" in the app bar, next to the initials, for whoever is signed in: opens the problem/suggestion form. */
function FeedbackButton() {
  const session = useSession();
  const [reporting, setReporting] = useState(false);
  if (session.state !== "signed-in") return null;
  const label = "Reportar problema ou sugestão";
  return (
    <>
      <button className="feedback-btn" aria-label={label} title={label} onClick={() => setReporting(true)}>
        <Icon name="feedback" />
        <span>Reportar</span>
      </button>
      {reporting && <FeedbackDialog onClose={() => setReporting(false)} />}
    </>
  );
}

/** The signed-in person's initials in the app bar; opens who it is, the account (on account.<domain>) and "Sair". */
function AccountMenu() {
  const session = useSession();
  if (session.state !== "signed-in") return null;
  const { name, email, isAdmin } = session.me;
  return (
    <>
      <Popover label={`Conta de ${name}`} face={<span className="avatar">{initials(name)}</span>} className="account-menu">
        {(close) => (
          <div className="account">
            <p>
              <b>{name}</b>
              {email && email !== name && <span>{email}</span>}
            </p>
            {isAdmin && (
              <a className="button menu-item" href="#/pedidos" onClick={close}>
                Pedidos de acesso
              </a>
            )}
            {isAdmin && (
              <a className="button menu-item" href="#/relatorios" onClick={close}>
                Relatórios
              </a>
            )}
            <a className="button menu-item" href={ACCOUNT_URL}>
              Conta
            </a>
            <button className="menu-item" onClick={() => void logout()}>
              Sair
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

/**
 * An icon button (or `face`, e.g. initials, or `text` with a chevron) that opens a floating panel; a tap outside or Esc
 * closes it. Focus moves into the panel on open and back to the button on close.
 */
export function Popover({
  icon = "menu",
  face,
  text,
  label,
  ariaLabel,
  badge,
  className = "",
  children,
}: {
  icon?: IconName;
  /** Shown instead of the icon while closed. */
  face?: ReactNode;
  /** A text button instead of an icon (kept while open, with a chevron); `label` then becomes its tooltip. */
  text?: ReactNode;
  label: string;
  /** Accessible name of a text trigger when its visible text needs context (e.g. "Definições da simulação: 4 h, 1 cenário"). */
  ariaLabel?: string;
  badge?: number;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const p = panel.current;
    const t = trigger.current;
    (p?.querySelector<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea, [tabindex]:not([tabindex='-1'])") ?? p)?.focus();
    // Back to the button on close, unless the action moved focus somewhere on purpose (e.g. a dialog it opened).
    return () => {
      const at = document.activeElement;
      if (!at || at === document.body || p?.contains(at)) t?.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    // Capture phase + stopPropagation: this Escape closes the popover only, not also the drawing underneath.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  return (
    <div className={`popover ${className}`}>
      {text ? (
        <button ref={trigger} className="popover-chip" title={label} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
          {text}
          <Icon name="chevronDown" size={16} />
        </button>
      ) : (
        <button ref={trigger} className="icon-btn" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open || !face ? <Icon name={open ? "close" : icon} /> : face}
          {!!badge && <span className="badge">{badge}</span>}
        </button>
      )}
      {open && (
        <>
          <div className="popover-scrim" onClick={close} />
          <div ref={panel} className="popover-panel" role="dialog" aria-label={label} tabIndex={-1}>
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

/** A labelled on/off switch (a checkbox styled as a toggle). */
export function Toggle({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <span className="toggle-text">{children}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Buttons that pick one value, e.g. the horizon or arrival/probability. */
export function Segmented<V extends string | number>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: V;
  options: { value: V; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={o.value === value}
          className={o.value === value ? "active" : ""}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
