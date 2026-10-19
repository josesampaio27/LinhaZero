import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOISTURE } from "@linha-zero/engine";
import type { WeatherResponse } from "../src/api/client";
import {
  airOf,
  applyOverrides,
  clampField,
  DEFAULT_AIR,
  DEFAULT_CONDITIONS,
  effectiveMoisture,
  fractionToPct,
  kmhToMs,
  liveBase,
  MAX_SPEED_KMH,
  moistureModeOf,
  msToKmh,
  pctToFraction,
  placeOf,
} from "../src/lib/conditions";

// The API's own example: IPMA wind (Braga, 90° at 3.1 m/s), Guimarães air (22.4 °C, 54%), model cloud 35%.
const example: WeatherResponse = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/examples/weather.json"), "utf8"));

describe("live values", () => {
  it("take the chosen wind, the station's air and the model's clouds", () => {
    const base = liveBase(example, DEFAULT_CONDITIONS);
    expect(base.wind).toEqual({ directionDeg: 90, speedMs: 3 });
    expect(base.air).toEqual({ tempC: 22.4, rhPct: 54, cloudPct: 35 });
    expect(base.moistureMode).toBe("tempo");
  });

  it("fall back to the model's air when no station has it", () => {
    expect(airOf({ ...example, air: null })).toEqual({ tempC: 22.3, rhPct: 57, cloudPct: 35 });
  });

  it("keep the current direction on a calm and the current moisture mode without air", () => {
    const calm: WeatherResponse = { ...example, observed: { ...example.observed!, directionDeg: null }, air: null, model: null };
    const previous = { ...DEFAULT_CONDITIONS, wind: { directionDeg: 300, speedMs: 6 }, moistureMode: "seco" as const };
    const base = liveBase(calm, previous);
    expect(base.wind.directionDeg).toBe(300);
    expect(base.air).toBeNull();
    expect(base.moistureMode).toBe("seco");
  });
});

describe("values typed by hand", () => {
  const base = liveBase(example, DEFAULT_CONDITIONS);

  it("stay when new live data arrives; the rest follow it", () => {
    const overrides = { speed: kmhToMs(60), rh: 20 };
    const newer = liveBase({ ...example, observed: { ...example.observed!, directionDeg: 180, speedMs: 2 }, air: { ...example.air!, temperatureC: 30 } }, base);
    const c = applyOverrides(newer, overrides);
    expect(c.wind).toEqual({ directionDeg: 180, speedMs: kmhToMs(60) });
    expect(c.air).toEqual({ tempC: 30, rhPct: 20, cloudPct: 35 });
  });

  it("go back to the source's value when removed", () => {
    expect(applyOverrides(base, {})).toEqual(base);
  });

  it("fill the rest of the air from the default when no source gave it", () => {
    const c = applyOverrides({ ...base, air: null }, { temp: 35 });
    expect(c.air).toEqual({ ...DEFAULT_AIR, tempC: 35 });
  });

  it("are clamped to what each field allows", () => {
    expect(clampField("direction", 370)).toBe(10);
    expect(clampField("direction", -90)).toBe(270);
    expect(clampField("speed", 99)).toBe(20);
    expect(clampField("rh", 0)).toBe(1);
    expect(clampField("cloud", 140)).toBe(100);
  });
});

describe("fuel moisture", () => {
  const base = liveBase(example, DEFAULT_CONDITIONS);
  const place = placeOf(example);

  it("from the air changes when the air is edited", () => {
    const live = effectiveMoisture(base, place);
    const drier = effectiveMoisture(applyOverrides(base, { temp: 35, rh: 15 }), place);
    expect(drier.d1).toBeLessThan(live.d1);
    expect(drier.liveHerb).toBe(live.liveHerb); // live fuel follows the month, not the air
  });

  it("uses typed values in manual mode and the preset otherwise", () => {
    const typed = { ...DEFAULT_MOISTURE, d1: 0.03 };
    expect(effectiveMoisture(applyOverrides(base, { moisture: { mode: "manual", values: typed } }), place)).toEqual(typed);
    expect(effectiveMoisture({ ...base, moistureMode: "normal" }, place)).toEqual(DEFAULT_MOISTURE);
  });

  it("falls back to the default without air", () => {
    expect(effectiveMoisture({ ...base, air: null }, place)).toEqual(DEFAULT_MOISTURE);
  });

  it("of a scenario shows its preset, or its values as manual", () => {
    expect(moistureModeOf(DEFAULT_MOISTURE).moistureMode).toBe("normal");
    expect(moistureModeOf({ ...DEFAULT_MOISTURE, d1: 0.033 }).moistureMode).toBe("manual");
  });
});

describe("units", () => {
  it("convert km/h and percentages both ways", () => {
    expect(msToKmh(kmhToMs(36))).toBe(36);
    expect(kmhToMs(MAX_SPEED_KMH)).toBe(20);
    expect(kmhToMs(150)).toBe(20); // the API takes up to 20 m/s
    expect(fractionToPct(pctToFraction(7.5))).toBe(7.5);
  });
});
