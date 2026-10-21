import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Chart colours: the reference categorical palette's dark steps, validated on the page ground (#111615): all pairs
 * apart for colour-blind and normal vision, 3:1 or better against the ground. Teal and violet are left to the
 * decisions A and B. Every series also has its own marker shape, and every chart a legend and a table.
 */
export const SERIES_COLOR = { blue: "#3987e5", orange: "#d95926", aqua: "#199e70" } as const;
export type Shape = "circle" | "diamond" | "square";
export const SURFACE = "#111615";

export interface Series<K extends string> {
  key: K;
  label: string;
  color: string;
  shape: Shape;
}

/** A data mark with a 2 px ring in the page colour, so it stays legible where marks touch. */
export function Marker({ shape, x, y, color, r = 5 }: { shape: Shape; x: number; y: number; color: string; r?: number }) {
  const ring = { stroke: SURFACE, strokeWidth: 2 };
  if (shape === "circle") return <circle cx={x} cy={y} r={r} fill={color} {...ring} />;
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1.5} fill={color} {...ring} />;
  const d = r * 1.3;
  return <path d={`M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z`} fill={color} {...ring} />;
}

/** The legend: the mark beside the name; the text stays in the ink colour. */
export function Legend({ items }: { items: { label: string; color: string; shape: Shape }[] }) {
  return (
    <ul className="chart-legend" aria-hidden="true">
      {items.map((s) => (
        <li key={s.label}>
          <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
            <Marker shape={s.shape} x={0} y={0} color={s.color} r={5} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** The width the chart has, so its text stays at its real size at any screen width. */
export function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The hover tooltip: one mark's name and values, over the mark. */
export interface Tip {
  x: number;
  y: number;
  title: string;
  lines: string[];
}
export function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map((l) => (
        <div key={l}>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

/** The numbers behind a chart, one click away: the chart is never the only way to read them. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="chart-table">
      <summary>Ver os números</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i ? "n" : ""} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((v, i) => (i ? <td key={i} className="n">{v}</td> : <th key={i} scope="row" className="font-normal text-ink">{v}</th>))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** pt-PT number with a fixed number of decimals ("0,40"). */
export const num = (v: number, digits = 2) => v.toFixed(digits).replace(".", ",");
/** "68%" */
export const pct = (v: number) => `${Math.round(v * 100)}%`;
/** "×3,9" */
export const times = (v: number) => `×${v < 10 ? num(v, 1) : Math.round(v)}`;

export function ChartFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="chart" role="group" aria-label={label}>
      {children}
    </div>
  );
}
