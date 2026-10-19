// Fuel dryness presets for the Rothermel model, until fuel moisture comes from the weather (plan, milestone 2).
import { DEFAULT_MOISTURE, type FuelMoisture } from "@linha-zero/engine";

export type DrynessId = "humido" | "normal" | "seco";

export const DRYNESS: { id: DrynessId; label: string; hint: string; moisture: FuelMoisture }[] = [
  {
    id: "humido",
    label: "Húmido",
    hint: "Combustível morto a 10–12%, ervas e arbustos verdes",
    moisture: { d1: 0.1, d10: 0.11, d100: 0.12, liveHerb: 1.2, liveWoody: 1.2 },
  },
  {
    id: "normal",
    label: "Verão",
    hint: "Combustível morto a 6–8%, ervas meio secas",
    moisture: DEFAULT_MOISTURE,
  },
  {
    id: "seco",
    label: "Muito seco",
    hint: "Combustível morto a 4–6%, ervas secas, arbustos a 70%",
    moisture: { d1: 0.04, d10: 0.05, d100: 0.06, liveHerb: 0.3, liveWoody: 0.7 },
  },
];

export const sameMoisture = (a: FuelMoisture, b: FuelMoisture) =>
  a.d1 === b.d1 && a.d10 === b.d10 && a.d100 === b.d100 && a.liveHerb === b.liveHerb && a.liveWoody === b.liveWoody;

/** The preset with exactly these values, or null (e.g. values from the weather or a scenario file). */
export function drynessOf(m: FuelMoisture): DrynessId | null {
  return DRYNESS.find((p) => sameMoisture(p.moisture, m))?.id ?? null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** "morto 1 h 7% · ervas 30% · arbustos 85%" */
export function moistureText(m: FuelMoisture): string {
  return `combustível morto 1 h ${pct(m.d1)}, 10 h ${pct(m.d10)} · ervas ${pct(m.liveHerb)} · arbustos ${pct(m.liveWoody)}`;
}
