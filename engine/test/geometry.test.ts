import { describe, expect, it } from "vitest";
import { rasterizePolygon, rasterizePolyline } from "../src/geometry";

describe("rasterization", () => {
  it("diagonal line is 4-connected", () => {
    const cells = rasterizePolyline([{ x: 0.5, y: 0.5 }, { x: 9.5, y: 9.2 }], 20, 20);
    const set = new Set(cells.map((c) => `${c.row},${c.col}`));
    for (const c of cells) {
      if (c.row === 9 && c.col === 9) continue;
      const hasNext = set.has(`${c.row + 1},${c.col}`) || set.has(`${c.row},${c.col + 1}`);
      expect(hasNext).toBe(true);
    }
  });

  it("polygon covers its interior", () => {
    const cells = rasterizePolygon(
      [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: 2, y: 8 }],
      20,
      20,
    );
    expect(cells.some((c) => c.row === 5 && c.col === 5)).toBe(true);
    expect(cells.some((c) => c.row === 12 && c.col === 12)).toBe(false);
  });
});
