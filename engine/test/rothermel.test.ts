import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANDERSON_13 } from "../src/fuel-models";
import {
  ellipseRate,
  headFire,
  lengthToBreadth,
  prepareFuelBed,
  surfaceBase,
  unshelteredWaf,
} from "../src/rothermel";

const here = dirname(fileURLToPath(import.meta.url));

interface BehaveCase {
  model: number;
  windMs: number;
  windFromDeg: number;
  slopeDeg: number;
  aspectDeg: number;
  ros: number;
  intensity: number;
  flame: number;
  dir: number;
  flankRos: number;
  backRos: number;
}

// Behave (the BehavePlus core) at 6/7/8% dead and 60/90% live moisture; see fixtures/make_behave_reference.py.
const cases: BehaveCase[] = JSON.parse(
  readFileSync(join(here, "fixtures/behave-anderson.json"), "utf8"),
);
const moisture = {
  d1: 0.06,
  d10: 0.07,
  d100: 0.08,
  liveHerb: 0.6,
  liveWoody: 0.9,
};

const close = (actual: number, expected: number, rel = 0.01) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    rel * Math.abs(expected) + 1e-6,
  );

describe("Rothermel surface spread against Behave", () => {
  for (const c of cases) {
    const label = `model ${c.model}, midflame ${c.windMs} m/s from ${c.windFromDeg}°, slope ${c.slopeDeg.toFixed(1)}°`;
    it(label, () => {
      const base = surfaceBase(prepareFuelBed(ANDERSON_13[c.model]), moisture);
      const slopeTan = Math.tan((c.slopeDeg * Math.PI) / 180);
      const head = headFire(
        base,
        c.windMs,
        (c.windFromDeg + 180) % 360,
        slopeTan,
        (c.aspectDeg + 180) % 360,
      );
      close(head.ros, c.ros);
      close(head.intensityKwM, c.intensity);
      close(head.flameLengthM, c.flame);
      if (head.ros > 0 && c.windMs + c.slopeDeg > 0) {
        const diff = Math.abs(((head.headDeg - c.dir + 540) % 360) - 180);
        expect(diff).toBeLessThan(0.5);
      }
      close(
        ellipseRate(
          head.ros,
          head.headDeg,
          head.eccentricity,
          head.headDeg + 90,
        ),
        c.flankRos,
      );
      close(
        ellipseRate(
          head.ros,
          head.headDeg,
          head.eccentricity,
          head.headDeg + 180,
        ),
        c.backRos,
      );
    });
  }
});

describe("Rothermel properties", () => {
  const bed = prepareFuelBed(ANDERSON_13[2]);

  it("does not spread at or above the moisture of extinction", () => {
    const wet = surfaceBase(prepareFuelBed(ANDERSON_13[1]), {
      ...moisture,
      d1: 0.12,
      d10: 0.12,
      d100: 0.12,
    });
    expect(wet.r0).toBe(0);
    expect(headFire(wet, 5, 0, 0.3, 0).ros).toBe(0);
  });

  it("drier fuel spreads faster", () => {
    const dry = surfaceBase(bed, { ...moisture, d1: 0.04 });
    const damp = surfaceBase(bed, { ...moisture, d1: 0.1 });
    expect(dry.r0).toBeGreaterThan(damp.r0);
  });

  it("speed grows with wind and with slope", () => {
    const base = surfaceBase(bed, moisture);
    let last = 0;
    for (const w of [0, 1, 2, 4]) {
      const r = headFire(base, w, 0, 0, 0).ros;
      expect(r).toBeGreaterThan(last);
      last = r;
    }
    expect(headFire(base, 0, 0, 0.6, 0).ros).toBeGreaterThan(
      headFire(base, 0, 0, 0.3, 0).ros,
    );
  });

  it("the ellipse is circular without wind or slope and elongates with wind", () => {
    expect(lengthToBreadth(0)).toBe(1);
    expect(lengthToBreadth(4)).toBeGreaterThan(lengthToBreadth(2));
    expect(lengthToBreadth(100)).toBe(8);
    const base = surfaceBase(bed, moisture);
    const calm = headFire(base, 0, 0, 0, 0);
    for (const b of [0, 90, 180, 270])
      close(
        ellipseRate(calm.ros, calm.headDeg, calm.eccentricity, b),
        base.r0,
        1e-9,
      );
  });

  it("unsheltered wind adjustment factor matches BehavePlus values", () => {
    // BehavePlus: 0.36 for 1 ft deep fuel beds, 0.55 for 6 ft (Andrews 2012, table 6).
    expect(unshelteredWaf(1 * 0.3048)).toBeCloseTo(0.36, 2);
    expect(unshelteredWaf(6 * 0.3048)).toBeCloseTo(0.55, 2);
  });
});

interface DynamicCase {
  model: number;
  params: {
    depthFt: number;
    mxDead: number;
    heatBtuLb: number;
    loadTonsAcre: number[];
    savPerFt: number[];
    dynamic: boolean;
  };
  liveHerb: number;
  windMs: number;
  ros: number;
  intensity: number;
}

// Scott and Burgan GR2, GS2 and TU1 (dynamic models) in Behave; see fixtures/make_behave_dynamic.py.
const dynamicCases: DynamicCase[] = JSON.parse(
  readFileSync(join(here, "fixtures/behave-dynamic.json"), "utf8"),
);

describe("herbaceous curing in dynamic fuel models, against Behave", () => {
  for (const c of dynamicCases) {
    it(`model ${c.model}, live herbaceous ${c.liveHerb * 100}%, midflame ${c.windMs} m/s`, () => {
      const p = c.params;
      const t = 0.22417; // tons/acre to kg/m²
      const params = {
        depthM: p.depthFt * 0.3048,
        deadMoistExt: p.mxDead,
        heatKjKg: p.heatBtuLb * 2.326,
        load: p.loadTonsAcre.map((w) => w * t) as unknown as readonly [
          number,
          number,
          number,
          number,
          number,
        ],
        sav: p.savPerFt.map((s) => s / 0.3048) as unknown as readonly [
          number,
          number,
          number,
          number,
          number,
        ],
        dynamic: p.dynamic,
      };
      const m = { ...moisture, liveHerb: c.liveHerb };
      const head = headFire(
        surfaceBase(prepareFuelBed(params, m), m),
        c.windMs,
        0,
        0,
        0,
      );
      // Near extinction (green grass, < 0.1 m/min, < 1 kW/m) small differences in the base rate
      // are amplified (Behave is ~1% higher without wind, ~3% with wind): allow 4%.
      const tol = c.ros < 0.1 ? 0.04 : 0.01;
      close(head.ros, c.ros, tol);
      close(head.intensityKwM, c.intensity, tol);
    });
  }
});
