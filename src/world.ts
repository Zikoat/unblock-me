import type { Point, Rect } from "./camera";

export type Square = { id: string; x: number; y: number; size: number; moved: boolean };

export const SQUARE_SIZE = 90;
/** The world is cut into cells; each cell holds at most one square, placed inside it so
 * squares from different cells never overlap. */
export const CELL = 200;
const FILL = 0.55; // share of cells that get a square
const SEED = 0x5eed;

/** mulberry32, seeded per cell so a cell's square is the same every time it is seen. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neighbouring cells must get unrelated seeds, so the coordinates go through murmur3's
 * finalizer; mulberry32 alone keeps nearby seeds correlated. */
function cellSeed(cx: number, cy: number): number {
  let h = Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cy, 0x165667b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/** The square a cell generates, ignoring any move; null for an empty cell. */
export function generated(cx: number, cy: number): Square | null {
  const next = random(cellSeed(cx, cy));
  if (next() >= FILL) return null;
  const room = CELL - SQUARE_SIZE;
  return {
    id: `${cx},${cy}`,
    x: cx * CELL + next() * room,
    y: cy * CELL + next() * room,
    size: SQUARE_SIZE,
    moved: false,
  };
}

const intersects = (s: Square, r: Rect) =>
  s.x < r.x + r.width && s.x + s.size > r.x && s.y < r.y + r.height && s.y + s.size > r.y;

/**
 * Every square at least partly inside `area`, nothing else: only the cells under the
 * area are generated, plus the moved squares, which live wherever they were dropped.
 * Moved squares come last so they draw on top.
 */
export function squaresIn(area: Rect, moved: ReadonlyMap<string, Point>): Square[] {
  const found: Square[] = [];
  // A square can stick out of its cell's top-left corner by up to a square size.
  const x0 = Math.floor((area.x - SQUARE_SIZE) / CELL);
  const y0 = Math.floor((area.y - SQUARE_SIZE) / CELL);
  const x1 = Math.floor((area.x + area.width) / CELL);
  const y1 = Math.floor((area.y + area.height) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const square = generated(cx, cy);
      if (square && !moved.has(square.id) && intersects(square, area)) found.push(square);
    }
  }
  for (const [id, at] of moved) {
    const square = { id, ...at, size: SQUARE_SIZE, moved: true };
    if (intersects(square, area)) found.push(square);
  }
  return found;
}

/** The topmost square under a world point. */
export function squareAt(squares: Square[], world: Point): Square | null {
  for (let i = squares.length - 1; i >= 0; i--) {
    const s = squares[i]!;
    if (world.x >= s.x && world.x <= s.x + s.size && world.y >= s.y && world.y <= s.y + s.size) return s;
  }
  return null;
}
