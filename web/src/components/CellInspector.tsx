import { useMemo } from "react";
import { computeSlopeAspect, type GridData } from "@linha-zero/engine";
import { lngLatToGrid, type LngLat } from "../lib/projection";
import { fuelSwatch } from "../lib/render";

/** Index of the cell under a map position, or null outside the grid. */
export function cellUnder(grid: GridData | null, lngLat: LngLat | null): number | null {
  if (!grid || !lngLat) return null;
  const { rows, cols } = grid.header;
  const p = lngLatToGrid(grid.header, lngLat[0], lngLat[1]);
  const row = Math.floor(p.y), col = Math.floor(p.x);
  return row >= 0 && col >= 0 && row < rows && col < cols ? row * cols + col : null;
}

const fmt = (v: number, digits = 0) => v.toLocaleString("pt-PT", { maximumFractionDigits: digits });

interface Props {
  grid: GridData | null;
  /** The official grid, to show what a variant changed; omit when grid is the official one. */
  base?: GridData | null;
  cell: number | null;
  /** Extra rows after the cell description, e.g. the fire arrival time of each decision. */
  extra?: [string, string][];
  /** Shown when the pointer is not over the grid. Keep it to one short line: in the bar under the maps it must not wrap. */
  placeholder?: string;
  /** One line instead of a list, for the bar under the maps. */
  compact?: boolean;
}

/** What the grid says about one cell: fuel, speed, elevation, slope, barrier, buildings, place. */
export function CellInspector({ grid, base, cell, extra = [], placeholder = "Passar o cursor ou tocar longamente no mapa.", compact = false }: Props) {
  const elevation = grid?.elevation;
  const header = grid?.header;
  // Elevation does not change between variants, so the slope is computed once per grid.
  const slope = useMemo(
    () => (elevation && header ? computeSlopeAspect(elevation, header.rows, header.cols, header.cellSize).slopeDeg : null),
    [elevation, header?.rows, header?.cols, header?.cellSize], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!grid || cell === null || !slope || cell >= grid.fuel.length) return <p className={compact ? "hint inspector-idle" : "hint"}>{placeholder}</p>;

  const { cols, fuelTable, villages } = grid.header;
  const code = grid.fuel[cell];
  const entry = fuelTable[code];
  const baseCode = base?.fuel[cell];
  const baseRate = base?.header.fuelTable[code]?.baseRate;
  const rate = entry?.baseRate ?? 0;
  const barrier = grid.barrier[cell] === 1;
  const place = villages.find((v) => v.id === grid.village[cell])?.name;

  const rows: [string, React.ReactNode][] = [
    ["Célula", `linha ${fmt(Math.floor(cell / cols))}, coluna ${fmt(cell % cols)}`],
    [
      "Combustível",
      <>
        <i className="swatch" style={{ background: fuelSwatch(grid, code) }} />
        {code} · {entry?.label ?? "sem designação"}
        {base && baseCode !== code && <small> (era {baseCode})</small>}
      </>,
    ],
    [
      "Velocidade base",
      barrier ? (
        "0 (barreira)"
      ) : (
        <>
          {fmt(rate, 1)} m/min{rate <= 0 && " (não arde)"}
          {base && baseRate !== undefined && baseRate !== rate && <small> (era {fmt(baseRate, 1)})</small>}
        </>
      ),
    ],
    ["Altitude", `${fmt(grid.elevation[cell])} m`],
    ["Declive", `${fmt(slope[cell], 1)}°`],
    ["Barreira", barrier ? (base && base.barrier[cell] !== 1 ? "sim (acrescentada)" : "sim") : base?.barrier[cell] === 1 ? "não (retirada)" : "não"],
    ["Edifícios", fmt(grid.buildings[cell])],
    ["Lugar", place ?? "—"],
    ...extra,
  ];
  if (compact) {
    return (
      <p className="inspector-line">
        {rows.slice(1).map(([k, v]) => (
          <span key={k}>
            <b>{k}:</b> {v}
          </span>
        ))}
      </p>
    );
  }
  return (
    <dl className="inspector">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
