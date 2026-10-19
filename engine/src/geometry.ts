import type { CellRef } from "./types";

/** A point in fractional grid coordinates: x = columns from the west edge, y = rows from the north edge. */
export interface GridPoint {
  x: number;
  y: number;
}

/**
 * Rasterizes a polyline into the 4-connected set of cells it crosses (supercover), so that
 * an 8-neighbour fire cannot slip diagonally through it. Cells outside the grid are dropped.
 */
export function rasterizePolyline(points: GridPoint[], rows: number, cols: number): CellRef[] {
  const seen = new Set<number>();
  const out: CellRef[] = [];
  const visit = (c: number, r: number) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const key = r * cols + c;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ row: r, col: c });
  };
  if (points.length === 1) visit(Math.floor(points[0].x), Math.floor(points[0].y));
  for (let i = 1; i < points.length; i++) traverseSegment(points[i - 1], points[i], visit);
  return out;
}

/** Visits every cell crossed by a segment, stepping one axis at a time (Amanatides-Woo traversal). */
function traverseSegment(p0: GridPoint, p1: GridPoint, visit: (c: number, r: number) => void): void {
  let cx = Math.floor(p0.x);
  let cy = Math.floor(p0.y);
  const endX = Math.floor(p1.x);
  const endY = Math.floor(p1.y);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx > 0 ? (cx + 1 - p0.x) / dx : dx < 0 ? (p0.x - cx) / -dx : Infinity;
  let tMaxY = dy > 0 ? (cy + 1 - p0.y) / dy : dy < 0 ? (p0.y - cy) / -dy : Infinity;
  visit(cx, cy);
  let guard = Math.abs(endX - cx) + Math.abs(endY - cy) + 2;
  while ((cx !== endX || cy !== endY) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      cy += stepY;
      tMaxY += tDeltaY;
    }
    visit(cx, cy);
  }
}

/** Rasterizes a polygon into the cells whose centre lies inside it, plus the cells its outline crosses. */
export function rasterizePolygon(ring: GridPoint[], rows: number, cols: number): CellRef[] {
  if (ring.length === 0) return [];
  const closed = [...ring, ring[0]];
  const outline = rasterizePolyline(closed, rows, cols);
  const seen = new Set<number>(outline.map((c) => c.row * cols + c.col));
  const out = [...outline];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const r0 = Math.max(0, Math.floor(minY)), r1 = Math.min(rows - 1, Math.floor(maxY));
  const c0 = Math.max(0, Math.floor(minX)), c1 = Math.min(cols - 1, Math.floor(maxX));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const key = r * cols + c;
      if (!seen.has(key) && pointInRing(c + 0.5, r + 0.5, ring)) {
        seen.add(key);
        out.push({ row: r, col: c });
      }
    }
  }
  return out;
}

/** Even-odd ray casting test. */
function pointInRing(x: number, y: number, ring: GridPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
