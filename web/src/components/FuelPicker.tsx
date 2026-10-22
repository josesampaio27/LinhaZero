import { useMemo } from "react";
import type { GridData } from "@linha-zero/engine";
import { BARRIER_SWATCH, BUILDING_SWATCH, fuelSwatch } from "../lib/render";

/** The fuel codes the grid uses, most common first, with the share of cells each one covers. */
export function fuelsInGrid(grid: GridData): { code: number; share: number }[] {
  const counts = new Map<number, number>();
  for (const code of grid.fuel) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts]
    .map(([code, n]) => ({ code, share: n / grid.fuel.length }))
    .sort((a, b) => b.share - a.share);
}

/** Swatch buttons to pick a fuel code, in the colours of the map. */
export function FuelPicker({ grid, value, onChange }: { grid: GridData; value: number | null; onChange: (code: number) => void }) {
  const codes = Object.keys(grid.header.fuelTable)
    .map(Number)
    .sort((a, b) => a - b);
  return (
    <div className="fuel-picker" role="radiogroup" aria-label="Combustível">
      {codes.map((code) => (
        <button
          key={code}
          role="radio"
          aria-checked={code === value}
          className={`fuel-option ${code === value ? "selected" : ""}`}
          onClick={() => onChange(code)}
        >
          <i className="swatch" style={{ background: fuelSwatch(grid, code) }} />
          <span>
            {code} · {grid.header.fuelTable[code].label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Colour key of the fuel view: the fuels on this grid, then barriers and buildings. */
export function FuelLegend({ grid }: { grid: GridData }) {
  const fuels = useMemo(() => fuelsInGrid(grid), [grid]);
  const pct = (share: number) => (share >= 0.01 ? `${Math.round(share * 100)}%` : "< 1%");
  return (
    <ul className="fuel-legend">
      {fuels.map(({ code, share }) => (
        <li key={code}>
          <i className="swatch" style={{ background: fuelSwatch(grid, code) }} />
          <span>
            {code} · {grid.header.fuelTable[code]?.label ?? "sem descrição"}
          </span>
          <small>{pct(share)}</small>
        </li>
      ))}
      <li>
        <i className="swatch" style={{ background: BARRIER_SWATCH }} />
        <span>Barreira (estrada, rio, aceiro)</span>
      </li>
      <li>
        <i className="swatch" style={{ background: BUILDING_SWATCH }} />
        <span>Edifícios</span>
      </li>
    </ul>
  );
}
