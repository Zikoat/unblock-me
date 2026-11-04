// The island: the first goals, in handcrafted squares in a row right of the start. Each is a
// 6x6 room walled in all round, its red block on row 2 leaving through a gap in the right wall
// into its target, a 2x1 bay outside it (as in the original Unblock Me). The generated world
// begins past the last square; nothing is generated in the island's area.
import type { Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { ISLAND_LEVELS } from "./island-levels";
import type { Placed } from "./layout";

/** A square's size inside its walls, the row its exit is on, and the distance from one
 * square to the next (10 cells of square and bay, a gap of 2). */
export const SIDE = 6;
const EXIT_ROW = 2;
const STRIDE = 12;
/** The first square's top-left inside cell. */
const ORIGIN = { x: 4, y: -3 };
/** How many of the first squares hide their stars (the score track while playing). */
export const UNRATED = 3;

/** Square `k`'s top-left inside cell. */
export const squareAt = (k: number) => ({ x: ORIGIN.x + k * STRIDE, y: ORIGIN.y });
/** A square's red block. */
export const redId = (k: number) => `isle ${k} 0`;

/** Everything on the island: walls round each square and its bay, and the level's blocks. */
export function islandBlocks(): Placed[] {
  return ISLAND_LEVELS.flatMap((level, k) => {
    const o = squareAt(k);
    const walls: Placed[] = [];
    const wall = (x: number, y: number) => walls.push({ id: `wall ${o.x + x},${o.y + y}`, x: o.x + x, y: o.y + y, w: 1, h: 1, wall: true });
    for (let i = -1; i <= SIDE; i++) {
      wall(i, -1);
      wall(i, SIDE);
      if (i >= 0 && i < SIDE) wall(-1, i);
      if (i >= 0 && i < SIDE && i !== EXIT_ROW) wall(SIDE, i);
    }
    // The bay: walls above, below and at the end of the exit's two cells.
    for (const x of [SIDE + 1, SIDE + 2]) (wall(x, EXIT_ROW - 1), wall(x, EXIT_ROW + 1));
    wall(SIDE + 2, EXIT_ROW);
    const blocks = level.blocks.map(([x, y, h], i): Placed => ({ id: `isle ${k} ${i}`, x: o.x + x, y: o.y + y, w: h ? 2 : 1, h: h ? 1 : 2, island: true }));
    return [...walls, ...blocks];
  });
}

/** The island's cells, and a free cell round it (kept clear of generated blocks). */
export const ISLAND_AREA: Rect = (() => {
  const first = squareAt(0), last = squareAt(ISLAND_LEVELS.length - 1);
  return { x: first.x - 2, y: first.y - 2, width: last.x + SIDE + 4 - (first.x - 2), height: SIDE + 4 };
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
    target: { x: o.x + SIDE, y: o.y + EXIT_ROW },
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
