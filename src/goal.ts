// Goals: a red block and the cells it has to reach, with a solution that proves it can be
// done (made in src/goal-search.ts).
import type { Point, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import { medalWon } from "./stars";
import { UNIT, type Block } from "./layout";
import type { Move } from "./rules";

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
  /** Whether a move was undone while it was the goal (no medal then). */
  undone?: boolean;
};

export type GoalOptions = {
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

/** The fewest moves the game knows for a goal: exact when its measure finished, else the
 * shortest solution it has (the search stopped early, so a shorter one may exist). */
export function bestKnown(goal: Goal): number | null {
  return goal.difficulty ? goal.difficulty.moves ?? goal.solution.length : null;
}

/** A medal: the player solved it in fewer moves than the game knew, without an undo. */
export function medal(goal: Goal): boolean {
  const best = bestKnown(goal);
  return best !== null && goal.used !== undefined && medalWon(best, goal.used, goal.undone);
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
