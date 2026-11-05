// The island: the first goals, in handcrafted squares in a row right of the start. Each is a
// 6x6 room walled in all round, its red block leaving through a gap in the right wall on its
// own row into its target, a 2x1 bay outside it (as in the original Unblock Me). The
// generated world begins past the last square; nothing is generated in the island's area.
import type { Camera, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { ISLAND_LEVELS } from "./island-levels";
import { UNIT, type Placed } from "./layout";

/** A square's size inside its walls. Squares sit in rows of COLS packed in one block of wall:
 * a square's bay ends in the next square's left wall, and rows share the wall between them.
 * So a square's footprint is 10 x 8 cells (wall, inside, exit and bay, wall), 9 x 7 apart;
 * the last square's has no wall past its bay, which opens to the world. A part-full last row
 * sits at the right, so the last square is always at the island's right edge. Each square's
 * exit is on its red block's row. */
export const SIDE = 6;
const STEP = { x: SIDE + 3, y: SIDE + 1 };
/** Squares per row: all of them, one strip (Math.ceil(Math.sqrt(n)) makes it squarish). */
const COLS = ISLAND_LEVELS.length;
/** The first square's top-left inside cell. */
const ORIGIN = { x: 4, y: -3 };
const LAST = ISLAND_LEVELS.length - 1;
/** Whether square `k` is the last: its bay opens to the world. */
export const isLast = (k: number) => k === LAST;
/** How many of the first squares hide their stars (the score track while playing). */
export const UNRATED = 3;

/** How much of the screen's shorter side a square's inside fills, its view fixed while it
 * is played (the bay is mostly out of view; a drag onto its first cell still finishes). */
const FILL = 0.9;

/** The bar at the top of the screen (CSS px) with the level and moves: a square's inside
 * stays out of it (and the same height free at the bottom, so it stays centred). */
export const HUD_BAR = 44;
/** How big (CSS px) a square's inside shows in `view` (the screen, or the smaller border when
 * that is on): FILL of its shorter side, or less when squarish, to leave the bar free; but on
 * a screen too short for the bar, half its shorter side (never nothing: a zero zoom made the
 * view endless and drawing hung). */
export const islandSide = (view: Rect) => {
  const short = Math.max(1, Math.min(view.width, view.height));
  return Math.max(Math.min(FILL * short, view.height - 2 * HUD_BAR), 0.5 * short);
};

/** The view while square `k` is played: its inside in the middle of `view`, islandSide big. */
export function islandCamera(k: number, view: Rect): Camera {
  const o = squareAt(k), scale = islandSide(view) / (SIDE * UNIT);
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
  return { scale, offsetX: cx - (o.x + SIDE / 2) * UNIT * scale, offsetY: cy - (o.y + SIDE / 2) * UNIT * scale };
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
export const squareAt = (k: number) => {
  const row = Math.floor(k / COLS), last = Math.floor(LAST / COLS);
  const col = (k % COLS) + (row === last ? COLS - (LAST % COLS) - 1 : 0);
  return { x: ORIGIN.x + col * STEP.x, y: ORIGIN.y + row * STEP.y };
};
/** Square `k`'s footprint: it, its walls and its bay (and the wall past it, but the last's). */
const footprint = (k: number): Rect => ({ x: squareAt(k).x - 1, y: squareAt(k).y - 1, width: SIDE + (isLast(k) ? 3 : 4), height: SIDE + 2 });
/** The island's cells: the squares' footprints (nothing random is generated there). */
export const ISLAND_RECTS: Rect[] = ISLAND_LEVELS.map((_, k) => footprint(k));
/** The last square's way out: its bay opens on a clearing in the world, a blocker across the
 * red block's row (vertical, room above and below it) and the real target past it. Reaching
 * the bay only reveals the world (see bayReached). */
const exitRow = (k: number) => ISLAND_LEVELS[k]!.blocks[0]![1];
const BLOCKER = { id: `isle ${LAST} blocker`, x: squareAt(LAST).x + SIDE + 3, y: squareAt(LAST).y + exitRow(LAST) - 1 };
const CLEARING: Rect = { x: BLOCKER.x - 1, y: BLOCKER.y - 1, width: 5, height: 5 };
/** Where nothing random is generated: the island and the clearing past its last bay. */
export const ISLAND_KEEP_OUT: Rect[] = [...ISLAND_RECTS, CLEARING];
/** Square `k`'s red block (at `at`) has a cell in its bay: for the last square, the world
 * shows. */
export const bayReached = (k: number, at: { x: number }) => isLast(k) && at.x >= squareAt(k).x + SIDE - 1;
export const inIsland = (p: { x: number; y: number }) => ISLAND_KEEP_OUT.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height);
/** A square's red block. */
export const redId = (k: number) => `isle ${k} 0`;

/** Everything on the island: wall wherever a footprint isn't a square's inside or its exit
 * and bay, and the levels' blocks (and the last square's blocker past its bay). */
export function islandBlocks(): Placed[] {
  const open = new Set<string>(), walls = new Set<string>();
  ISLAND_LEVELS.forEach((level, k) => {
    const o = squareAt(k), row = level.blocks[0]![1];
    for (let x = 0; x < SIDE; x++) for (let y = 0; y < SIDE; y++) open.add(`${o.x + x},${o.y + y}`);
    for (let x = SIDE; x < SIDE + 2; x++) open.add(`${o.x + x},${o.y + row}`);
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
  placed.push({ ...BLOCKER, w: 1, h: 2, island: true });
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
  // The last square's target is past the clearing: after the bay, the blocker moves up out of
  // the row and the red block goes on (two more moves: the bay is only seen into first).
  const target = isLast(k) ? { x: BLOCKER.x + 2, y: o.y + red[1] } : { x: o.x + SIDE, y: o.y + red[1] };
  if (isLast(k)) {
    solution.push({ id: BLOCKER.id, from: { x: BLOCKER.x, y: BLOCKER.y }, to: { x: BLOCKER.x, y: BLOCKER.y - 1 } });
    solution.push({ id: redId(k), from: pos[0]!, to: target });
  }
  return {
    id: redId(k),
    target,
    start: { x: o.x + red[0], y: o.y + red[1] },
    solution,
    difficulty: known(solution.length),
    unrated: k < UNRATED || undefined,
  };
}

/** The next island goal after `done` (the goals reached so far), or null once all are. */
export function nextIslandGoal(done: Goal[]): Goal | null {
  const k = ISLAND_LEVELS.findIndex((_, i) => !done.some((g) => g.id === redId(i)));
  return k < 0 ? null : islandGoal(k);
}
