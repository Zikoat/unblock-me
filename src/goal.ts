// Goals: a red block and the cells it has to reach. Made by shuffling the board with one
// intent, pushing a single block as far as it will go along its axis, so every goal is
// reachable by construction.
import type { Point, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import { clearCell, replay, type Move } from "./frozen";
import { intersects, UNIT, type Block, type Layout } from "./layout";
import { blocksIn, isHorizontal, position, slide, type Changes } from "./rules";

export type Goal = {
  /** The red block. */
  id: string;
  /** Where the red block has to get to (its top-left cell). */
  target: Point;
  /** The shuffle's moves from the start to the goal: proof it can be done, and an upper
   * bound on the moves it takes (one move per block per drag). */
  solution: Move[];
  /** Where the red block was when the goal was made. */
  start?: Point;
  /** How hard it is, once measured (src/difficulty.ts). */
  difficulty?: Difficulty;
  /** Choices a move along its solution (src/choices.ts). */
  choices?: number;
  /** The density it was made at, for its stars. */
  tries?: number;
  /** How many moves had been made (the undo history's length) when it was shown, and how
   * many it took once reached. */
  begun?: number;
  used?: number;
};

export type GoalOptions = {
  /** How many cells the shuffle tries to push the red block. More effort, further goals. */
  effort?: number;
  /** Moves the planner may use to clear one cell. 4 keeps a goal under ~2 s and ~170 MB
   * even on the densest boards; 6 can take over 25 s. */
  perCell?: number;
  /** The board to start from, when blocks have already been moved. */
  moved?: ReadonlyMap<string, Point>;
  /** Blocks that may not be the red block (earlier red blocks), nor share a track with:
   * the same row for a horizontal block, the same column for a vertical one. */
  exclude?: ReadonlySet<string>;
  /** Earlier targets (cells): a new target never shares a cell with one. */
  avoid?: readonly Rect[];
};

/** One drag can move a block several cells: merge back-to-back moves of the same block. */
export function merge(moves: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out.at(-1);
    if (last && last.id === m.id) last.to = m.to;
    else out.push({ ...m, from: { ...m.from }, to: { ...m.to } });
  }
  return out.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
}

/** Fewer moves for the same end: a block's move is dropped and folded into its next move
 * whenever the whole sequence still plays legally (e.g. the red block steps once, a blocker
 * clears, the red block steps again: one red move after the blocker does). */
export function simplify(layout: Layout, moves: Move[], start: ReadonlyMap<string, Point> = new Map()): Move[] {
  let out = merge(moves);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      const j = out.findIndex((m, k) => k > i && m.id === out[i]!.id);
      if (j < 0) continue;
      const tried = merge([...out.slice(0, i), ...out.slice(i + 1, j), { ...out[j]!, from: out[i]!.from }, ...out.slice(j + 1)]);
      if (replay(layout, tried, start)) {
        out = tried;
        changed = true;
      }
    }
  }
  return out;
}

/** Push `red` one cell at a time in `dir` (+1 or -1 along its axis), clearing each cell it
 * steps into, up to `effort` cells or until a cell cannot be cleared. Moves are applied to
 * `moved`; `steps` gets, for each cell stepped, where the red block got to and how many of
 * the moves it took. */
function push(layout: Layout, moved: Map<string, Point>, red: Block, dir: number, effort: number, perCell: number, steps: { at: Point; moves: number }[]): Move[] {
  const changes: Changes = { moved };
  const keep = new Set([red.id]);
  const moves: Move[] = [];
  const now = () => blocksIn(layout, { x: red.x - effort - 2, y: red.y - effort - 2, width: 2 * effort + 6, height: 2 * effort + 6 }, changes).find((b) => b.id === red.id)!;
  for (let i = 0; i < effort; i++) {
    const at = now();
    const ahead = isHorizontal(at)
      ? { x: dir > 0 ? at.x + at.w : at.x - 1, y: at.y }
      : { x: at.x, y: dir > 0 ? at.y + at.h : at.y - 1 };
    const plan = clearCell(layout, moved, ahead, keep, { maxMoves: perCell });
    if (!plan) break;
    moves.push(...plan);
    const to = isHorizontal(at) ? { x: at.x + dir, y: at.y } : { x: at.x, y: at.y + dir };
    moved.set(red.id, to);
    moves.push({ id: red.id, from: { x: at.x, y: at.y }, to });
    steps.push({ at: to, moves: moves.length });
  }
  return moves;
}

/**
 * Make a goal on `layout` near `near` (lattice units): try the sliding blocks closest to it,
 * push each both ways along its axis, and keep the one that got furthest (fewest moves on a
 * tie). Null when no block nearby can be pushed even one cell.
 */
export function makeGoal(layout: Layout, near: Point, { effort = 12, perCell = 4, moved: start = new Map(), exclude = new Set(), avoid = [] }: GoalOptions = {}): Goal | null {
  const track = (b: Block) => `${isHorizontal(b) ? "row" : "column"} ${isHorizontal(b) ? b.y : b.x}`;
  const taken = new Set([...exclude].flatMap((id) => {
    const b = layout.byId(id);
    return b ? [track(b)] : [];
  }));
  const candidates = blocksIn(layout, { x: near.x - 4, y: near.y - 4, width: 8, height: 8 }, { moved: start })
    .filter((b) => !b.ui && !b.wall && !exclude.has(b.id) && !taken.has(track(b)))
    .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y) || (a.id < b.id ? -1 : 1))
    .slice(0, 6);
  let best: (Goal & { distance: number }) | null = null;
  for (const red of candidates) {
    for (const dir of [1, -1]) {
      // (Pushing it the other way first and starting there was tried: that push clears the
      // lane behind it, so the way back is always one drag.)
      const steps: { at: Point; moves: number }[] = [];
      const moves = push(layout, new Map(start), red, dir, effort, perCell, steps);
      // The furthest it got without its target sharing a cell with an earlier one.
      const step = steps.filter((s) => !avoid.some((a) => intersects({ ...s.at, w: red.w, h: red.h }, a))).at(-1);
      if (!step) continue;
      const end = step.at;
      const solution = simplify(layout, moves.slice(0, step.moves), start);
      const distance = Math.abs(end.x - red.x) + Math.abs(end.y - red.y);
      if (!best || distance > best.distance || (distance === best.distance && solution.length < best.solution.length)) {
        best = { id: red.id, target: end, solution, distance };
      }
    }
  }
  if (!best) return null;
  const { distance: _, ...goal } = best;
  return goal;
}

/** The fewest moves the game knows for a goal: exact when its measure finished, else the
 * shortest solution it has (the search stopped early, so a shorter one may exist). */
export function bestKnown(goal: Goal): number | null {
  return goal.difficulty ? goal.difficulty.moves ?? goal.solution.length : null;
}

/** A medal: the player solved it in fewer moves than the game knew, better than all stars. */
export function medal(goal: Goal): boolean {
  const best = bestKnown(goal);
  return best !== null && goal.used !== undefined && goal.used < best;
}

/** Is the red block on its target? */
export function solved(goal: Goal, blocks: Block[]): boolean {
  const red = blocks.find((b) => b.id === goal.id);
  return !!red && red.x === goal.target.x && red.y === goal.target.y;
}

/** The middle of the screen in lattice units, where a new goal is made. */
export const viewCentre = (camera: { scale: number; offsetX: number; offsetY: number }, width: number, height: number): Point => ({
  x: Math.floor((width / 2 - camera.offsetX) / camera.scale / UNIT),
  y: Math.floor((height / 2 - camera.offsetY) / camera.scale / UNIT),
});

/** Can the red block slide at all from where it is now? (For tests and experiments.) */
export function canMove(layout: Layout, block: Block, changes: Changes): boolean {
  const s = slide(layout, block, changes);
  return s.hi > s.lo && position(block) >= s.lo;
}
