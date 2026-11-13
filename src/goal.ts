// Goals: a red block and the cells it has to reach, with a solution that proves it can be
// done (made in src/goal-search.ts).
import type { Point, Rect } from "./camera";
import type { Difficulty } from "./difficulty";
import type { Terms } from "./judge";
import { medalWon } from "./stars";
import { UNIT, type Block, type Stamp } from "./layout";
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
  /** The Judge's terms and fitness (src/judge.ts), for a goal from the maker. */
  judged?: Terms;
  /** The density it was made at, for its stars. */
  tries?: number;
  /** How many moves had been made (the undo history's length) when it was shown, and how
   * many it took once reached. */
  begun?: number;
  used?: number;
  /** How many had been made when it was reached. */
  ended?: number;
  /** Whether a move was undone while it was the goal (no medal then). */
  undone?: boolean;
  /** An early island goal: no stars while it is played, and its finish is the full one
   * however many moves it took (src/island.ts). */
  unrated?: boolean;
  /** A room's goal (src/rooms.ts): which room (its library id, turned), where from, its numbers
   * as stamped (f fewest, e and E the least and most extra moves; measured again when the world
   * filled its reserved cells, `fill`), and the room's own; k: its stamp. */
  room?: { id: string; from?: string; f: number; e: number; E: number; roomF: number; roomE: number; roomEMax: number; fill: string; k: number; pace?: { fewest: number; extra: number; spike: boolean; easy: boolean }; ms?: number; states?: number };
  /** The stamp that puts the room in the world, until the goal is shown (then it is the
   * world's: src/main.ts). */
  stamp?: Stamp;
  /** A travel goal (src/travel.ts): leads towards room k's stamp (its library id `room`), `left`
   * cells from its red block once reached. */
  travel?: { k: number; room: string; left: number };
  /** With the first travel goal: the room's goal it leads to, to come once the player is within
   * a screen of it (src/main.ts trek); its stamp comes with the travel goal. */
  then?: Goal;
  /** An island square's goal with more to come in it: reached, it sparkles and the next one
   * follows, no finish nor stars. */
  step?: boolean;
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

/** The fewest moves a world goal aims at, by how many came before it (`n`, from 0 after the
 * island): from RAMP_FROM, rising evenly over RAMP goals to what the search gives at the
 * median without one, then none (reports/world-ramp.html: without it the world's goals
 * took about 10 fewest moves at the median from the very first, spikes over 20; a cap
 * instead, 8 rising to 20, trimmed the spikes but hardly moved the median). */
export const RAMP = 30, RAMP_FROM = 4, RAMP_TO = 10;
export function rampTarget(n: number): number | undefined {
  return n >= RAMP ? undefined : Math.round(RAMP_FROM + ((RAMP_TO - RAMP_FROM) * n) / RAMP);
}

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

/** The moves a reached goal's stars and finish show: those used, or for an unrated goal the
 * fewest (the full finish, whatever it took). */
export function shownUsed(goal: Goal): number | undefined {
  return goal.used === undefined || !goal.unrated ? goal.used : (bestKnown(goal) ?? goal.used);
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
