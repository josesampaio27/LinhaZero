// compare_placements: the placements worth trying for one action, which the engine then ranks with one run each
// (docs/decisoes/0081). The model does not guess where a line works best: it reads the ranked results. Pure functions,
// tested in Node.
import type { InterventionKind } from "@linha-zero/engine";
import type { ShapeName } from "./shapes";

/** Where an action goes, as the model gives it to place_intervention. */
export interface PlacementSpec {
  shape: ShapeName;
  place: string;
  toPlace?: string;
  minute?: number;
  lengthM?: number;
  radiusM?: number;
  offsetM?: number;
  offsetDirection?: string;
  anchor?: boolean;
}

/** A place to protect or cut the fire off from, with the minute the fire reaches it without the new action (Infinity: never). */
export interface Target {
  name: string;
  village: boolean;
  arrivalMin: number;
}

/** Enough runs to cover the options, few enough to answer in a couple of seconds on the 30 m grid (~0.1 s each). */
export const MAX_OPTIONS = 16;
/** Points on the fire's path, as a share of the time between the action's start and the fire reaching the target. */
const ALONG = [0.25, 0.5, 0.75];

/**
 * The candidate placements of an action of `kind` that starts at `startMin`, taking the targets in turn so that every
 * target keeps some options under MAX_OPTIONS.
 */
export function placementOptions(kind: InterventionKind, targets: Target[], startMin: number): PlacementSpec[] {
  const perTarget = targets.map((t) => optionsFor(kind, t, startMin));
  const out: PlacementSpec[] = [];
  for (let i = 0; out.length < MAX_OPTIONS && perTarget.some((o) => i < o.length); i++) {
    for (const o of perTarget) if (i < o.length && out.length < MAX_OPTIONS) out.push(o[i]);
  }
  return out;
}

function optionsFor(kind: InterventionKind, t: Target, startMin: number): PlacementSpec[] {
  const out: PlacementSpec[] = [];
  // Spots on the path exist only if the fire gets there, after the action starts.
  const minutes = Number.isFinite(t.arrivalMin) && t.arrivalMin > startMin + 1 ? ALONG.map((f) => Math.round(startMin + f * (t.arrivalMin - startMin))) : [];
  const across = (lengths: number[]) =>
    minutes.flatMap((minute) => lengths.map((lengthM) => ({ shape: "across_path" as const, place: t.name, minute, lengthM })));
  switch (kind) {
    case "containmentLine":
      out.push(...across([1000, 2000]));
      if (t.village) out.push({ shape: "around_place", place: t.name, radiusM: 300 });
      break;
    case "backfire":
      out.push(...across([1000, 2000]));
      break;
    case "aerialDrop":
      out.push(...across([500, 1000]));
      break;
    case "suppression":
      out.push(...minutes.map((minute) => ({ shape: "fire_head" as const, place: t.name, minute, radiusM: 300 })));
      // One band across the path, halfway.
      if (minutes.length) out.push({ shape: "across_path", place: t.name, minute: minutes[1], lengthM: 1000, radiusM: 300 });
      if (t.village) out.push({ shape: "around_place", place: t.name, radiusM: 300 });
      break;
    case "protectZone":
      if (t.village) out.push({ shape: "around_place", place: t.name, radiusM: 200 }, { shape: "around_place", place: t.name, radiusM: 500 });
      break;
  }
  return out;
}

/** The parameters of a placement as place_intervention takes them, so the model can place an option exactly. */
export function specText(spec: PlacementSpec): string {
  const parts = [`shape=${spec.shape}`, `place="${spec.place}"`];
  if (spec.toPlace) parts.push(`to_place="${spec.toPlace}"`);
  if (spec.minute !== undefined) parts.push(`minute=${spec.minute}`);
  if (spec.lengthM !== undefined) parts.push(`length_m=${spec.lengthM}`);
  if (spec.radiusM !== undefined) parts.push(`radius_m=${spec.radiusM}`);
  if (spec.offsetM !== undefined) parts.push(`offset_m=${spec.offsetM}`, `offset_direction=${spec.offsetDirection}`);
  if (spec.anchor !== undefined) parts.push(`anchor=${spec.anchor}`);
  return parts.join(", ");
}
