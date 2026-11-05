// The island: the first goals, in handcrafted squares in a row right of the start. Each is a
// 6x6 room walled in all round, its red block leaving through a gap in the right wall on its
// own row into its target, a 2x1 bay outside it (as in the original Unblock Me). The
// generated world begins past the last square; nothing is generated in the island's area.
import type { Camera, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { ISLAND_LEVELS } from "./island-levels";
import { UNIT, type Placed } from "./layout";

/** A square's size inside its walls. Squares sit in rows, as near a square as their number
 * allows (the last row maybe part full), packed in one block of wall: a square's bay ends in
 * the next square's left wall, and rows share the wall between them. So a square's footprint
 * is 10 x 8 cells (wall, inside, exit and bay, wall), 9 x 7 apart. Each square's exit is on
 * its red block's row; the last square's bay is open to the world. */
export const SIDE = 6;
const STEP = { x: SIDE + 3, y: SIDE + 1 };
const COLS = Math.ceil(Math.sqrt(ISLAND_LEVELS.length));
/** The first square's top-left inside cell. */
const ORIGIN = { x: 4, y: -3 };
const LAST = ISLAND_LEVELS.length - 1;
/** How many of the first squares hide their stars (the score track while playing). */
export const UNRATED = 3;

/** How much of the screen's shorter side a square's inside fills, its view fixed while it
 * is played (the bay is mostly out of view; a drag onto its first cell still finishes). */
const FILL = 0.9;

/** The bar at the top of the screen (CSS px) with the level and moves: a square's inside
 * stays out of it (and the same height free at the bottom, so it stays centred). */
export const HUD_BAR = 44;
/** How big (CSS px) a square's inside shows: FILL of the screen's shorter side, or less on a
 * squarish screen, to leave the bar free. */
export const islandSide = (width: number, height: number) => Math.min(FILL * Math.min(width, height), height - 2 * HUD_BAR);

/** The view while square `k` is played: its inside centred, islandSide big. */
export function islandCamera(k: number, width: number, height: number): Camera {
  const o = squareAt(k), scale = islandSide(width, height) / (SIDE * UNIT);
  return { scale, offsetX: width / 2 - (o.x + SIDE / 2) * UNIT * scale, offsetY: height / 2 - (o.y + SIDE / 2) * UNIT * scale };
}

/** Square `k`'s cells: the square in its walls, and its bay (with its walls). */
export function islandRects(k: number): Rect[] {
  const o = squareAt(k), row = ISLAND_LEVELS[k]!.blocks[0]![1];
  return [
    { x: o.x - 1, y: o.y - 1, width: SIDE + 2, height: SIDE + 2 },
    { x: o.x + SIDE + 1, y: o.y + row - 1, width: 2, height: 3 },
  ];
}

/** The square whose goal this is, or null for a goal off the island. */
export function squareOf(goal: { id: string } | null): number | null {
  const m = goal?.id.match(/^isle (\d+) 0$/);
  return m ? Number(m[1]) : null;
}

/** Square `k`'s top-left inside cell. */
export const squareAt = (k: number) => ({ x: ORIGIN.x + (k % COLS) * STEP.x, y: ORIGIN.y + Math.floor(k / COLS) * STEP.y });
/** Square `k`'s footprint: it, its walls and its bay. */
const footprint = (k: number): Rect => ({ x: squareAt(k).x - 1, y: squareAt(k).y - 1, width: SIDE + 4, height: SIDE + 2 });
/** The island's cells: the squares' footprints (nothing random is generated there). */
export const ISLAND_RECTS: Rect[] = ISLAND_LEVELS.map((_, k) => footprint(k));
export const inIsland = (p: { x: number; y: number }) => ISLAND_RECTS.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height);
/** Whether square `k` is the last: its bay opens to the world. */
export const isLast = (k: number) => k === LAST;
/** A square's red block. */
export const redId = (k: number) => `isle ${k} 0`;

/** Everything on the island: wall wherever a footprint isn't a square's inside or its exit
 * and bay (the last square's bay open at its end), and the levels' blocks. */
export function islandBlocks(): Placed[] {
  const open = new Set<string>(), walls = new Set<string>();
  ISLAND_LEVELS.forEach((level, k) => {
    const o = squareAt(k), row = level.blocks[0]![1];
    for (let x = 0; x < SIDE; x++) for (let y = 0; y < SIDE; y++) open.add(`${o.x + x},${o.y + y}`);
    for (let x = SIDE; x < SIDE + (isLast(k) ? 3 : 2); x++) open.add(`${o.x + x},${o.y + row}`);
  });
  for (const r of ISLAND_RECTS) for (let x = r.x; x < r.x + r.width; x++) for (let y = r.y; y < r.y + r.height; y++) if (!open.has(`${x},${y}`)) walls.add(`${x},${y}`);
  const placed: Placed[] = [...walls].map((key) => {
    const [x, y] = key.split(",").map(Number) as [number, number];
    return { id: `wall ${key}`, x, y, w: 1, h: 1, wall: true };
  });
  ISLAND_LEVELS.forEach((level, k) => {
    const o = squareAt(k);
    level.blocks.forEach(([x, y, h], i) => placed.push({ id: `isle ${k} ${i}`, x: o.x + x, y: o.y + y, w: h ? 2 : 1, h: h ? 1 : 2, island: true }));
  });
  return placed;
}

/** The island's bounds. */
export const ISLAND_AREA: Rect = (() => {
  const x = Math.min(...ISLAND_RECTS.map((r) => r.x)), y = Math.min(...ISLAND_RECTS.map((r) => r.y));
  return { x, y, width: Math.max(...ISLAND_RECTS.map((r) => r.x + r.width)) - x, height: Math.max(...ISLAND_RECTS.map((r) => r.y + r.height)) - y };
})();

const known = (moves: number): Difficulty => ({ moves, atLeast: moves, searched: 0, branching: 2, score: moves });

/** Square `k`'s goal: its red block into the bay, with the level's shortest solution. */
export function islandGoal(k: number): Goal {
  const level = ISLAND_LEVELS[k]!, o = squareAt(k);
  const pos = level.blocks.map(([x, y]) => ({ x: o.x + x, y: o.y + y }));
  const solution = level.solution.map(([i, to]) => {
    const [, , h] = level.blocks[i]!, from = pos[i]!;
    const next = h ? { x: o.x + to, y: from.y } : { x: from.x, y: o.y + to };
    pos[i] = next;
    return { id: `isle ${k} ${i}`, from, to: next };
  });
  const red = level.blocks[0]!;
  return {
    id: redId(k),
    target: { x: o.x + SIDE, y: o.y + red[1] },
    start: { x: o.x + red[0], y: o.y + red[1] },
    solution,
    difficulty: known(level.fewest),
    unrated: k < UNRATED || undefined,
  };
}

/** The next island goal after `done` (the goals reached so far), or null once all are. */
export function nextIslandGoal(done: Goal[]): Goal | null {
  const k = ISLAND_LEVELS.findIndex((_, i) => !done.some((g) => g.id === redId(i)));
  return k < 0 ? null : islandGoal(k);
}
