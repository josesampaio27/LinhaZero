import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Mark, type IconName } from "./Icon";

export interface Tab<T extends string> {
  id: T;
  label: string;
  done?: boolean;
}

interface Props<T extends string> {
  title: string;
  /** App bar menu; `close` hides it after an action. */
  menu: (close: () => void) => ReactNode;
  /** The map area. */
  stage: ReactNode;
  /** Steps shown as tabs; omit to hide them (e.g. while drawing). */
  tabs?: Tab<T>[];
  tab?: T;
  onTab?: (t: T) => void;
  /** Pinned under the sheet body: the primary action. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Page layout shared by the simulation and the grid editor. Phones: app bar, map, bottom sheet.
 * From 900 px: the sheet becomes a left panel and the map takes the rest (styles.css).
 */
export function Shell<T extends string>({ title, menu, stage, tabs, tab, onTab, footer, children }: Props<T>) {
  const [open, setOpen] = useState(true);
  return (
    <div className="shell">
      <header className="appbar">
        <Mark />
        <span className="appbar-title">
          <b>
            Linha<span>Zero</span>
          </b>
          <span title={title}>{title}</span>
        </span>
        <Popover icon="menu" label="Menu" className="menu">
          {menu}
        </Popover>
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

/** An icon button that opens a floating panel; a tap outside closes it. */
export function Popover({
  icon,
  label,
  badge,
  className = "",
  children,
}: {
  icon: IconName;
  label: string;
  badge?: number;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
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
      <button ref={trigger} className="icon-btn" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? "close" : icon} />
        {!!badge && <span className="badge">{badge}</span>}
      </button>
      {open && (
        <>
          <div className="popover-scrim" onClick={close} />
          <div className="popover-panel">
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
