/** Contour interval (m) for an elevation span: about 30 lines over the whole grid at most. */
export function contourStep(span: number): number {
  return [5, 10, 20, 25, 50, 100].find((s) => span / s <= 30) ?? 200;
}

/** One contour segment in grid coordinates (cell centres at c + 0.5, r + 0.5) at a level in metres. */
export interface ContourSegment {
  level: number;
  a: [number, number];
  b: [number, number];
}

/** Contour lines by marching squares over the cell centres. Saddles pair the crossings in edge order. */
export function contourSegments(z: Float32Array, rows: number, cols: number, step: number): ContourSegment[] {
  const out: ContourSegment[] = [];
  const pts: [number, number][] = [];
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      // Corners clockwise from the top-left, and the edges between them: top, right, bottom, left.
      const v = [z[r * cols + c], z[r * cols + c + 1], z[(r + 1) * cols + c + 1], z[(r + 1) * cols + c]];
      const xy: [number, number][] = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
      const lo = Math.min(...v), hi = Math.max(...v);
      for (let level = Math.ceil(lo / step) * step; level < hi; level += step) {
        pts.length = 0;
        for (let e = 0; e < 4; e++) {
          const v0 = v[e], v1 = v[(e + 1) % 4];
          if (v0 < level === v1 < level) continue;
          const t = (level - v0) / (v1 - v0);
          const [x0, y0] = xy[e], [x1, y1] = xy[(e + 1) % 4];
          pts.push([x0 + (x1 - x0) * t + 0.5, y0 + (y1 - y0) * t + 0.5]);
        }
        for (let k = 0; k + 1 < pts.length; k += 2) out.push({ level, a: pts[k], b: pts[k + 1] });
      }
    }
  }
  return out;
}
