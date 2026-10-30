// Goal search for difficulty: the target is chosen for the moves it takes, not the
// distance. Two searches on the window state space (src/window.ts), both deterministic,
// both scaling with the states they may visit:
//
// - makeGoalDeep: breadth first from the board as it is, over the red block's window; the
//   first board where the red block stands somewhere new is the fewest moves to get it
//   there, so the deepest such position is the hardest target in the window, with a
//   shortest solution as proof. Exact, but breadth first goes wide before it goes deep: on
//   a dense board the states run out at a depth of a few moves.
//
// - makeGoalTournament: the push search (goal-fast.ts) makes candidates that go deep
//   (every cell of every push is a target with a proof); the difficulty measure ranks them,
//   roughly first and then exactly for the best few. The measured solution, when the
//   measure finds one, replaces the push's: it is the shortest within the window.
import { Board } from "./board";
import type { Point } from "./camera";
import { measure, type Difficulty } from "./difficulty";
import type { Goal, GoalOptions } from "./goal";
import { candidatesNear, pushes, simplifyFast, type Tuning } from "./goal-fast";
import { intersects, type Layout } from "./layout";
import { Pool, runWindow, Window } from "./window";

export type DeepOptions = GoalOptions & {
  /** Boards the breadth-first search may visit per candidate block. */
  states?: number;
  /** The window: cells beyond the red block's ends on its axis, and on each side. */
  along?: number;
  across?: number;
  /** Lanes away from the red block a block may be and still slide (2: the blocks in its
   * lane and the blocks in theirs). */
  levels?: number;
  /** Candidate red blocks tried, nearest first. */
  candidates?: number;
};

export type Found = Goal & { /** Moves of the solution: exact within the window. */ depth: number; states: number; branching: number };

/** The hardest target of one block: the red position furthest (in moves) from the board as
 * it is, by breadth-first search over the block's window, with the path to it. */
export function deepest(board: Board, id: string, { states = 20_000, along = 8, across = 4, levels = 2, avoid = [] as DeepOptions["avoid"] } = {}): Found | null {
  const red = board.block(id);
  const horizontal = red.w > red.h;
  const pos = horizontal ? red.x : red.y;
  const win = new Window(board, runWindow(red, { from: pos, to: pos }, along, across)).closure(board, [id], levels);
  const r = win.index(id);
  if (r < 0) return null;
  const allowed = (p: number): boolean => {
    const at = horizontal ? { x: win.x0 + p, y: red.y } : { x: red.x, y: win.y0 + p };
    return !avoid!.some((a) => intersects({ ...at, w: red.w, h: red.h }, a));
  };
  const pool = new Pool(win.sliders.length, Math.min(states, 1 << 16));
  pool.add(win.start, 0, -1, 0);
  const reached = new Map<number, number>([[win.start[r]!, 0]]); // red position -> state
  let best: { p: number; i: number } | null = null;
  let expanded = 0, choices = 0;
  const child = new Uint8Array(win.sliders.length);
  // Breadth first: states are pooled in the order found, so the queue is the pool itself.
  for (let i = 0; i < pool.count && pool.count < states; i++) {
    const at = pool.offset(i);
    const depth = pool.depth[i]!;
    expanded++;
    win.fill(pool.data, at);
    const slides: number[] = [];
    choices += win.moves(pool.data, at, (k, to) => slides.push(k, to));
    for (let m = 0; m < slides.length; m += 2) {
      child.set(pool.data.subarray(at, at + pool.n));
      child[slides[m]!] = slides[m + 1]!;
      const j = pool.add(child, 0, i, depth + 1);
      if (j < 0) continue;
      const p = child[r]!;
      if (!reached.has(p)) {
        reached.set(p, j);
        // Deeper is better; at the same depth, further.
        if (allowed(p) && (!best || Math.abs(p - win.start[r]!) > Math.abs(best.p - win.start[r]!))) best = { p, i: j };
      }
    }
  }
  if (!best) return null;
  const target = horizontal ? { x: win.x0 + best.p, y: red.y } : { x: red.x, y: win.y0 + best.p };
  return { id, target, solution: pool.path(win, best.i), depth: pool.depth[best.i]!, states: pool.count, branching: expanded ? choices / expanded : 0 };
}

/** The deepest target among the candidate blocks nearest `near`. */
export function makeGoalDeep(layout: Layout, near: Point, options: DeepOptions = {}): Found | null {
  const { moved = new Map(), exclude = new Set(), candidates = 6 } = options;
  const board = new Board(layout, moved);
  let best: Found | null = null;
  for (const red of candidatesNear(board, layout, near, exclude, candidates)) {
    const found = deepest(board, red.id, options);
    if (!found) continue;
    if (!best || found.depth > best.depth || (found.depth === best.depth && found.branching > best.branching)) best = found;
  }
  if (best && !board.replays(best.solution)) throw new Error("goal search: solution does not replay");
  return best;
}

export type TournamentOptions = GoalOptions & {
  /** States for the rough measure of every candidate, and for the exact measure of the
   * finalists. */
  rough?: number;
  exact?: number;
  /** How many candidates get the exact measure. */
  finalists?: number;
  /** Cells of each push that become candidates: every one, or only every `stride`th and
   * the last. */
  stride?: number;
  tuning?: Tuning;
};

export type Ranked = Goal & { difficulty: Difficulty; distance: number };

/** Tournament settings by effort level: 0 for a goal the player is waiting for (a few
 * hundred ms), 1 for one made ahead (about a second), 2 and 3 for more time (several
 * seconds): more candidates, and more boards to measure the finalists on. A pushed cell
 * costs the boards its rough measure may take, so the ticks bound the whole search. */
export const LEVELS_OF_EFFORT: TournamentOptions[] = [
  { rough: 300, exact: 5_000, finalists: 2, stride: 2, tuning: { prune: true, lookahead: true, goalBudget: 40_000, cellCost: 150, candidates: 6 } },
  { rough: 300, exact: 20_000, finalists: 3, tuning: { prune: true, lookahead: true, goalBudget: 100_000, cellCost: 300, candidates: 6 } },
  { rough: 1_000, exact: 50_000, finalists: 4, tuning: { prune: true, lookahead: true, goalBudget: 400_000, cellCost: 1_000, candidates: 12 } },
  { rough: 3_000, exact: 100_000, finalists: 6, perCell: 8, tuning: { prune: true, lookahead: true, goalBudget: 1_000_000, cellCost: 3_000, candidates: 12 } },
];

/** A hard goal near `near` at an effort level (LEVELS_OF_EFFORT). */
export function makeGoalHard(layout: Layout, near: Point, options: GoalOptions = {}, level = 1): Ranked | null {
  return makeGoalTournament(layout, near, { ...LEVELS_OF_EFFORT[Math.max(0, Math.min(level, LEVELS_OF_EFFORT.length - 1))], ...options });
}

/** How a goal's difficulty is weighed against its distance: difficulty / distance^alpha.
 * 0 ranks by difficulty alone (nearly always the furthest cell: each nearer cell's proof
 * is a prefix of the further one's); 1 by difficulty per cell. */
export const tradeoff = { alpha: 0.6 }; // (reports/play-analysis.html)
export const balance = (g: { difficulty: Difficulty; distance: number }) => g.difficulty.score / Math.pow(g.distance, tradeoff.alpha);

/** The push search's targets, ranked by the difficulty measure. */
export function makeGoalTournament(layout: Layout, near: Point, options: TournamentOptions = {}): Ranked | null {
  const { moved = new Map(), avoid = [], rough = 3_000, exact = 50_000, finalists = 4, stride = 1, tuning = { prune: true, lookahead: true, goalBudget: 50_000 } } = options;
  const board = new Board(layout, moved);
  const all = pushes(board, layout, near, { ...options, perCell: options.perCell ?? 6 }, tuning);
  // Every cell of every push is a candidate, measured roughly.
  const candidates: Ranked[] = [];
  for (const p of all) {
    const red = board.block(p.id);
    for (let k = p.steps.length - 1; k >= 0; k--) {
      if ((k + 1) % stride !== 0 && k !== p.steps.length - 1) continue;
      const step = p.steps[k]!;
      if (avoid.some((a) => intersects({ ...step.at, w: red.w, h: red.h }, a))) continue;
      const solution = simplifyFast(board, p.raw.slice(0, step.moves));
      const goal = { id: p.id, target: step.at, solution };
      const d = measure(board, goal, { limit: rough });
      candidates.push({ ...goal, difficulty: d, distance: k + 1 });
    }
  }
  // Rank by difficulty for the distance (a lower bound counts as the moves): a near goal
  // that is nearly as hard beats a far one. Then the proof's length (shorter is likelier to
  // be the real fewest).
  const rank = (a: Ranked, b: Ranked) => balance(b) - balance(a) || a.solution.length - b.solution.length || a.distance - b.distance;
  candidates.sort(rank);
  const top = candidates.slice(0, finalists);
  for (const c of top) {
    c.difficulty = measure(board, c, { limit: exact });
    if (c.difficulty.solution) c.solution = c.difficulty.solution;
  }
  top.sort(rank);
  const best = top[0] ?? null;
  if (best && !board.replays(best.solution)) throw new Error("goal search: solution does not replay");
  return best;
}
