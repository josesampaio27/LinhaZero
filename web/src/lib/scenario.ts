// UI-only helpers for interventions. Scenario files and their conversion live in the engine
// (engine/src/scenario.ts), shared with the Node scripts and tests.
import type { InterventionKind } from "@linha-zero/engine";

export const KIND_LABEL: Record<InterventionKind, string> = {
  containmentLine: "Linha de contenção",
  suppression: "Ataque",
  protectZone: "Proteger zona",
};

export const isLineKind = (k: InterventionKind) => k === "containmentLine";

let counter = 0;
export const newId = () => `iv-${Date.now().toString(36)}-${(counter++).toString(36)}`;
