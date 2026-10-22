// UI-only helpers for interventions, and the scenario file the UI writes. Reading scenario files and converting them
// live in the engine (engine/src/scenario.ts), shared with the Node scripts and tests.
import type { InterventionKind, SavedScenario, ScenarioInputs } from "@linha-zero/engine";

export { isLineKind } from "@linha-zero/engine";

export const KIND_LABEL: Record<InterventionKind, string> = {
  containmentLine: "Linha de contenção",
  suppression: "Ataque",
  protectZone: "Proteger zona",
  aerialDrop: "Descarga aérea",
  backfire: "Contrafogo",
};

let counter = 0;
export const newId = () => `iv-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** What "Guardar ficheiro" writes, and what goes with each server run so the history can open it as drawn. */
export function savedScenarioOf(grid: string, title: string | null, i: ScenarioInputs, weather: SavedScenario["weather"]): SavedScenario {
  return {
    version: 3,
    title: title ?? undefined,
    grid,
    ignition: i.ignition,
    wind: i.wind,
    durationMin: i.durationMin,
    ensemble: i.ensemble,
    decisions: i.decisions,
    variants: i.variants,
    ...(i.spreadModel === "rothermel" && { spreadModel: i.spreadModel, moisture: i.moisture }),
    ...(i.weatherSteps?.length && { weatherSteps: i.weatherSteps }),
    ...(i.burnedArea && { burnedArea: i.burnedArea }),
    // Where the wind came from, only while nobody changed it by hand.
    weather,
  };
}
