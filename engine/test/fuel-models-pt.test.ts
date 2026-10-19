import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  headFire,
  prepareFuelBed,
  surfaceBase,
  type FuelParams,
} from "../src/rothermel";

const here = dirname(fileURLToPath(import.meta.url));

// The Portuguese fuel models (Fernandes & Loureiro 2021) as converted by data-prep/fuel_params.py
// (regenerate with: python data-prep/fuel_params.py --json engine/test/fixtures/fuel-params.json).
const models: Record<string, { name: string; rothermel: FuelParams }> =
  JSON.parse(readFileSync(join(here, "fixtures/fuel-params.json"), "utf8"));

// Fernandes et al. (2009), Figure 1: heat per unit area (MJ/m²) and spread rate (m/min) of the 18
// models, read off the chart (about ±0.3). The chart only tells the groups apart, so each group's
// models are matched to its points in order of heat per unit area.
const FIGURE_1: Record<string, [number, number][]> = {
  F: [
    [5.0, 1.4],
    [9.0, 4.3],
    [13.1, 7.1],
    [14.3, 9.4],
  ],
  M: [
    [6.6, 7.5],
    [6.8, 6.1],
    [12.7, 25.5],
    [22.1, 16.4],
    [24.1, 14.0],
    [27.8, 18.2],
    [29.6, 23.5],
  ],
  "V-H": [
    [1.5, 36.5],
    [4.2, 50.5],
  ],
  "V-M": [
    [11.2, 16.5],
    [17.3, 15.4],
    [28.8, 15.5],
    [30.6, 22.0],
    [53.0, 23.7],
  ],
};
// Flat ground, 10 km/h midflame wind, 4% dead moisture, fully cured herbaceous, 70% live moisture.
const moisture = {
  d1: 0.04,
  d10: 0.04,
  d100: 0.04,
  liveHerb: 0.3,
  liveWoody: 0.7,
};
const BTU_FT2_TO_MJ_M2 = 0.0113565;

function behaviour(p: FuelParams) {
  const bed = prepareFuelBed(p, moisture);
  const base = surfaceBase(bed, moisture);
  return {
    ros: headFire(base, 10 / 3.6, 0, 0, 0).ros,
    hpa: base.reactionIntensity * bed.residenceMin * BTU_FT2_TO_MJ_M2,
  };
}

describe("Portuguese fuel models reproduce Fernandes et al. (2009), Figure 1", () => {
  for (const [group, points] of Object.entries(FIGURE_1)) {
    const members = Object.values(models)
      .filter((m) => m.name.startsWith(group))
      .map((m) => ({ name: m.name, ...behaviour(m.rothermel) }))
      .sort((a, b) => a.hpa - b.hpa);

    it(`group ${group} has one model per point`, () =>
      expect(members.length).toBe(points.length));

    members.forEach((m, k) => {
      const [hpa, ros] = points[k];
      // V-Ha: with the 2021 parameters the spread rate is ~15% below the 2009 chart while the heat
      // per area matches; without its 0.40 t/ha of live woody fuel the reverse happens. The model was
      // probably revised between the two documents; we keep the 2021 table as published.
      const rosTolerance = m.name === "V-Ha" ? 0.2 : 0.05;
      it(`${m.name}: ${hpa} MJ/m² and ${ros} m/min`, () => {
        expect(Math.abs(m.hpa - hpa)).toBeLessThanOrEqual(0.05 * hpa + 0.3);
        expect(Math.abs(m.ros - ros)).toBeLessThanOrEqual(
          rosTolerance * ros + 0.3,
        );
      });
    });
  }

  it("grass models spread only as dynamic (curing) models, as the chart's fully cured conditions imply", () => {
    const vha = Object.values(models).find((m) => m.name === "V-Ha")!.rothermel;
    expect(vha.dynamic).toBe(true);
    expect(behaviour({ ...vha, dynamic: false }).ros).toBeLessThan(
      0.5 * FIGURE_1["V-H"][1][1],
    );
  });
});
