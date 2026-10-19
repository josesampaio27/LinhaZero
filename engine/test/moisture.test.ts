import { describe, expect, it } from "vitest";
import {
  deadFuelMoistureFromFfmc,
  hourlyFfmc,
  deadFuelMoisture,
  equilibriumMoisture,
  fuelMoistureFromWeather,
  LIVE_MOISTURE_BY_MONTH,
  stateOfWeather,
} from "../src/moisture";

describe("equilibrium moisture content (Simard 1968, NFDRS GTR-82 eq. 1a–1c)", () => {
  it("matches the three regressions, worked by hand", () => {
    // 1b: 2.22749 + 0.160107·30 − 0.014784·70 = 5.99582 %
    expect(equilibriumMoisture(70, 30)).toBeCloseTo(0.0599582, 6);
    // 1a: 0.03229 + 0.281073·5 − 0.000578·80·5 = 1.206455 %
    expect(equilibriumMoisture(80, 5)).toBeCloseTo(0.01206455, 7);
    // 1c: 21.0606 + 0.005565·80² − 0.00035·80·60 − 0.483199·80 = 16.34068 %
    expect(equilibriumMoisture(60, 80)).toBeCloseTo(0.1634068, 6);
  });

  it("drier and hotter air gives drier fuel", () => {
    expect(equilibriumMoisture(90, 20)).toBeLessThan(
      equilibriumMoisture(70, 20),
    );
    expect(equilibriumMoisture(70, 20)).toBeLessThan(
      equilibriumMoisture(70, 40),
    );
  });
});

describe("dead fuel moisture (NFDRS 1978 without fuel sticks)", () => {
  it("corrects to the fuel surface by the state of weather, then 1 h = 1.03 × EMC and 10 h = 1.28 × EMC", () => {
    // 25 °C = 77 °F; clear sky: +25 °F and RH × 0.75 → EMC(102 °F, 30 %) = 5.522712 %
    const m = deadFuelMoisture({ tempC: 25, rhPct: 40, cloudPct: 0 });
    expect(m.d1).toBeCloseTo(1.03 * 0.05522712, 6);
    expect(m.d10).toBeCloseTo(1.28 * 0.05522712, 6);
    expect(m.d100).toBeCloseTo(m.d10 + 0.02, 9);
  });

  it("clouds and night keep the fuel moister than full sun", () => {
    const air = { tempC: 25, rhPct: 40 };
    const sun = deadFuelMoisture({ ...air, cloudPct: 0 }).d1;
    expect(deadFuelMoisture({ ...air, cloudPct: 100 }).d1).toBeGreaterThan(sun);
    // Night: no correction, EMC(77 °F, 40 %) = 7.493402 %
    expect(deadFuelMoisture({ ...air, daylight: false }).d1).toBeCloseTo(
      1.03 * 0.07493402,
      6,
    );
  });

  it("state of weather follows the NFDRS cloud classes", () => {
    expect([0, 9, 10, 50, 51, 90, 91, 100].map(stateOfWeather)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
  });
});

describe("live fuel moisture by month", () => {
  it("grass is cured in late summer and green in winter; shrubs are driest in September", () => {
    const aug = fuelMoistureFromWeather({ tempC: 30, rhPct: 25 }, 8);
    expect(aug.liveHerb).toBeLessThanOrEqual(0.3);
    expect(
      fuelMoistureFromWeather({ tempC: 10, rhPct: 80 }, 1).liveHerb,
    ).toBeGreaterThanOrEqual(1.2);
    const woody = LIVE_MOISTURE_BY_MONTH.map((m) => m.liveWoody);
    expect(Math.min(...woody)).toBe(woody[8]);
  });
});

describe("hourly FFMC (Van Wagner 1977)", () => {
  const hot = { tempC: 32, rhPct: 20, windKmh: 15, rainMm: 0 };
  it("dries in hot, dry air and wets in rain", () => {
    expect(hourlyFfmc(85, hot)).toBeGreaterThan(85);
    expect(hourlyFfmc(85, { ...hot, tempC: 18, rhPct: 90, rainMm: 5 })).toBeLessThan(60);
  });

  it("settles at the equilibrium of steady air, whatever the start", () => {
    let a = 60,
      b = 95;
    for (let h = 0; h < 200; h++) {
      a = hourlyFfmc(a, hot);
      b = hourlyFfmc(b, hot);
    }
    expect(a).toBeCloseTo(b, 2);
    // FFMC moisture at equilibrium: Van Wagner's drying EMC at 32 °C and 20% (0.942·20^0.679 − 0.18·10.9·(1 − e^−2.3) ≈ 5.4%).
    expect(deadFuelMoistureFromFfmc(a).d1).toBeCloseTo(0.0543, 3);
  });

  it("maps FFMC to fuel moisture with 10 h and 100 h above 1 h", () => {
    const m = deadFuelMoistureFromFfmc(90);
    expect(m.d1).toBeCloseTo((147.27723 * 11) / 149.5 / 100, 10);
    expect(m.d10).toBeGreaterThan(m.d1);
    expect(m.d100).toBeGreaterThan(m.d10);
    expect(deadFuelMoistureFromFfmc(101).d1).toBe(0.02);
  });
});
