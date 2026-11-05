// The island: the first goals, in handcrafted squares in a row right of the start. Each is a
// room walled in all round, its red block leaving through a gap in the right wall on its own
// row into its target, a 2x1 bay outside it (as in the original Unblock Me); a square may
// have more goals inside it after that. Squares grow from small to 6x6. The generated world
// begins past the last square; nothing is generated in the island's area.
import type { Camera, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { ISLAND_LEVELS } from "./island-levels";
import { UNIT, type Placed } from "./layout";

/** Square `k`'s size inside its walls. Squares sit in one strip, each in the middle of the
 * biggest's height, walled no higher than itself (the world fills round a smaller one): a
 * square's bay ends in the next square's left wall. So a square's footprint is its size and
 * 2 high, and 4 wide (wall, inside, exit and bay, wall), 3 more apart; the last square's
 * ends at its right wall, its bay out in the world. Each square's exit is on its red block's
 * row. */
export const sideOf = (k: number) => ISLAND_LEVELS[k]!.side ?? 6;
const MAX_SIDE = Math.max(...ISLAND_LEVELS.map((_, k) => sideOf(k)));
/** The first square's left inside column, and the biggest square's top inside row. */
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
 * view endless and drawing hung). The same for every size of square: a small one's blocks
 * show bigger. */
export const islandSide = (view: Rect) => {
  const short = Math.max(1, Math.min(view.width, view.height));
  return Math.max(Math.min(FILL * short, view.height - 2 * HUD_BAR), 0.5 * short);
};

/** Square `k`'s middle (lattice units). */
export const squareMiddle = (k: number) => ({ x: squareAt(k).x + sideOf(k) / 2, y: squareAt(k).y + sideOf(k) / 2 });

/** The view while square `k` is played: its inside in the middle of `view`, islandSide big. */
export function islandCamera(k: number, view: Rect): Camera {
  const m = squareMiddle(k), scale = islandSide(view) / (sideOf(k) * UNIT);
  const cx = view.x + view.width / 2, cy = view.y + view.height / 2;
  return { scale, offsetX: cx - m.x * UNIT * scale, offsetY: cy - m.y * UNIT * scale };
}

/** Square `k`'s cells: the square in its walls, and its bay (with its walls). */
export function islandRects(k: number): Rect[] {
  const o = squareAt(k), side = sideOf(k), row = exitRow(k);
  return [
    { x: o.x - 1, y: o.y - 1, width: side + 2, height: side + 2 },
    { x: o.x + side + 1, y: o.y + row - 1, width: 2, height: 3 },
  ];
}

/** The square whose goal this is (any of its goals), or null for a goal off the island. */
export function squareOf(goal: { id: string } | null): number | null {
  const m = goal?.id.match(/^isle (\d+) \d+$/);
  return m ? Number(m[1]) : null;
}

/** Square `k`'s top-left inside cell. */
export const squareAt = (k: number) => {
  let x = ORIGIN.x;
  for (let j = 0; j < k; j++) x += sideOf(j) + 3;
  return { x, y: ORIGIN.y + Math.floor((MAX_SIDE - sideOf(k)) / 2) };
};
/** Square `k`'s footprint: it, its walls and its bay (and the wall past it); the last's
 * ends at its right wall, its bay out in the clearing. */
const footprint = (k: number): Rect => ({ x: squareAt(k).x - 1, y: squareAt(k).y - 1, width: sideOf(k) + (isLast(k) ? 2 : 4), height: sideOf(k) + 2 });
/** The island's cells: the squares' footprints (nothing random is generated there). */
export const ISLAND_RECTS: Rect[] = ISLAND_LEVELS.map((_, k) => footprint(k));
/** The last square's way out: its bay (no walls round it) in a clearing in the world, a
 * blocker across the red block's row (vertical, room above and below it) and the real target
 * past it. Reaching the bay only reveals the world (see bayReached). */
const exitRow = (k: number) => ISLAND_LEVELS[k]!.blocks[0]![1];
const BLOCKER = { id: `isle ${LAST} blocker`, x: squareAt(LAST).x + sideOf(LAST) + 3, y: squareAt(LAST).y + exitRow(LAST) - 1 };
const CLEARING: Rect = { x: squareAt(LAST).x + sideOf(LAST) + 1, y: BLOCKER.y - 1, width: BLOCKER.x + 4 - (squareAt(LAST).x + sideOf(LAST) + 1), height: 5 };
/** The last square's exit is shut by a wall while it has goals inside (they come first): it
 * goes (moved far off) as the goal before its red block's is reached. */
export const GATE = ISLAND_LEVELS[LAST]!.goals ? { id: `isle ${LAST} gate`, x: squareAt(LAST).x + sideOf(LAST), y: squareAt(LAST).y + exitRow(LAST) } : null;
export const GATE_GONE = { x: -1e6, y: -1e6 };
/** Reaching `goal` opens the gate: the next is the last square's red block, out. */
export const opensGate = (goal: { id: string }) => {
  const goals = GATE ? islandGoals(LAST) : [];
  return goals.length > 1 && goal.id === goals.at(-2)!.id;
};
/** Where nothing random is generated: the island and the clearing past its last bay. */
export const ISLAND_KEEP_OUT: Rect[] = [...ISLAND_RECTS, CLEARING];
/** Square `k`'s red block (`goal`'s, at `at`) has a cell in its bay: for the last square, the
 * world shows. */
export const bayReached = (k: number, goal: { id: string }, at: { x: number }) => isLast(k) && goal.id === redId(k) && at.x >= squareAt(k).x + sideOf(k) - 1;
export const inIsland = (p: { x: number; y: number }) => ISLAND_KEEP_OUT.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height);
/** A square's red block: its last goal's. */
export const redId = (k: number) => `isle ${k} 0`;

/** Everything on the island: wall wherever a footprint isn't a square's inside or its exit
 * and bay, and the levels' blocks (and the last square's blocker past its bay). */
export function islandBlocks(): Placed[] {
  const open = new Set<string>(), walls = new Set<string>();
  ISLAND_LEVELS.forEach((_, k) => {
    const o = squareAt(k), side = sideOf(k), row = exitRow(k);
    for (let x = 0; x < side; x++) for (let y = 0; y < side; y++) open.add(`${o.x + x},${o.y + y}`);
    for (let x = side; x < side + 2; x++) open.add(`${o.x + x},${o.y + row}`);
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
  if (GATE) placed.push({ ...GATE, w: 1, h: 1, wall: true });
  return placed;
}

/** The island's bounds. */
export const ISLAND_AREA: Rect = (() => {
  const x = Math.min(...ISLAND_RECTS.map((r) => r.x)), y = Math.min(...ISLAND_RECTS.map((r) => r.y));
  return { x, y, width: Math.max(...ISLAND_RECTS.map((r) => r.x + r.width)) - x, height: Math.max(...ISLAND_RECTS.map((r) => r.y + r.height)) - y };
})();

const known = (moves: number): Difficulty => ({ moves, atLeast: moves, searched: 0, branching: 2, score: moves });

/** Square `k`'s goals, in turn: its red block into the bay, then any inside it (a block onto
 * a cell); in the last square those inside first, then its red block out (see GATE). Each
 * has the level's shortest solution from where the one before left the blocks. All but the
 * last are `step`s; the last is scored for the whole square (its fewest moves are the
 * level's, for all its goals, and the moves counted are all its goals'). */
export function islandGoals(k: number): Goal[] {
  const level = ISLAND_LEVELS[k]!, o = squareAt(k), side = sideOf(k);
  const pos = level.blocks.map(([x, y]) => ({ x: o.x + x, y: o.y + y }));
  const play = (steps: [number, number][]) =>
    steps.map(([i, to]) => {
      const [, , h] = level.blocks[i]!, from = pos[i]!;
      const next = h ? { x: o.x + to, y: from.y } : { x: from.x, y: o.y + to };
      pos[i] = next;
      return { id: `isle ${k} ${i}`, from, to: next };
    });
  const inside = () =>
    (level.goals ?? []).map(({ block, at, solution: steps }): Goal => {
      const start = { ...pos[block]! };
      return { id: `isle ${k} ${block}`, target: { x: o.x + at[0], y: o.y + at[1] }, start, solution: play(steps) };
    });
  const before = isLast(k) ? inside() : [];
  const red = level.blocks[0]!, start = { ...pos[0]! }, solution = play(level.solution);
  // The last square's target is past the clearing: after the bay, the blocker moves up out of
  // the row and the red block goes on (two more moves: the bay is only seen into first).
  const target = isLast(k) ? { x: BLOCKER.x + 2, y: o.y + red[1] } : { x: o.x + side, y: o.y + red[1] };
  if (isLast(k)) {
    solution.push({ id: BLOCKER.id, from: { x: BLOCKER.x, y: BLOCKER.y }, to: { x: BLOCKER.x, y: BLOCKER.y - 1 } });
    solution.push({ id: redId(k), from: pos[0]!, to: target });
  }
  const goals: Goal[] = [...before, { id: redId(k), target, start, solution }, ...(isLast(k) ? [] : inside())];
  // (The last square's two moves past its bay, as its solution has them.)
  const total = level.fewest + (isLast(k) ? 2 : 0);
  return goals.map((g, i) =>
    i < goals.length - 1
      ? { ...g, difficulty: known(g.solution.length), unrated: true, step: true }
      : { ...g, difficulty: known(total), unrated: k < UNRATED || undefined },
  );
}

/** The next island goal after `done` (the goals reached so far), or null once all are. */
export function nextIslandGoal(done: Goal[]): Goal | null {
  for (let k = 0; k <= LAST; k++) for (const g of islandGoals(k)) if (!done.some((d) => d.id === g.id)) return g;
  return null;
}
