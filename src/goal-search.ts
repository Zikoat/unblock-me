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
import { contractGoal, WISHES } from "./contract";
import { decisionStages } from "./decisions";
import { measure, NEAR, type Difficulty, type Reach } from "./difficulty";
import type { Goal, GoalOptions } from "./goal";
import { candidatesNear, pushes, simplifyFast, tidy, type Tuning } from "./goal-fast";
import { extraFactor, extraMoves } from "./judge";
import { intersects, type Layout } from "./layout";
import type { Move } from "./rules";
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
  /** How far the finalists' measure looks for the blocks that matter past the near window
   * (src/difficulty.ts, Reach; null: not). The rough measure searches the near window only:
   * it ranks the candidates, and ranks them alike either way (the measure's branching is the
   * near window's), while the finalists' fewest is the one the player sees. */
  reach?: Reach | null;
  /** How many candidates get the exact measure. */
  finalists?: number;
  /** Pick among the finalists by the Judge's fitness (moves plus decisions, the aim and the
   * reach as it weighs them) instead of the rank that chose them. */
  judged?: boolean;
  /** Cells of each push that become candidates: every one, or only every `stride`th and
   * the last. */
  stride?: number;
  tuning?: Tuning;
  /** The fewest moves a goal aims at (goal.ts rampTarget): of the goals nearest it, the best
   * ranked wins. */
  target?: number;
  watch?: Watch;
};

/** For experiments (test/experiments/walls-candidates.ts): sees the search's steps and every
 * candidate, changing nothing. The candidates are the search's own objects, changed later
 * (the finalists' measure and proof): copy what is wanted at once. */
export type Watch = {
  /** A step done: "pushes", "rough" (every candidate measured), "exact" (the finalists'), "picked". */
  step?(name: "pushes" | "rough" | "exact" | "picked"): void;
  /** Every candidate after the rough measure, best ranked first; the first `finalists` go on. */
  ranked?(candidates: readonly Ranked[], finalists: number): void;
  /** The finalists after their exact measure, in the order picked (the first wins), with the
   * fitness each got when judged (null when the rank picks). */
  picked?(finalists: readonly Ranked[], fitness: ReadonlyMap<Ranked, number> | null): void;
};


export type Ranked = Goal & { difficulty: Difficulty; distance: number; train?: number; /** Extra moves of its proof (judge.ts extraMoves). */ extra?: number };

/** Tournament settings by effort level: 0 for a goal the player is waiting for (a few
 * hundred ms), 1 for one made ahead (about a second), 2 and 3 for more time (several
 * seconds): more candidates, more boards to measure the finalists on, and further to look
 * for the blocks that matter (the reach: a solution through blocks the measure leaves
 * standing is missed, and its fewest overstated, so a player beating it wins a medal the
 * game should not give; at effort 0 the overstated ones on the Bench were all the budget's,
 * not the window's, and the reach cost a third more time, so it keeps the near window). A pushed cell costs the boards its rough measure may take, so the
 * ticks bound the whole search. Effort 0 tries 12 red blocks on the same ticks, and picks
 * among 3 finalists as the Judge would (the Tuner's run: quick-set quality median 0.80 to 1.0,
 * worst 5% 0.26 to 0.39, no slower; at effort 2 judging the finalists lowered the worst 5%). */
export const LEVELS_OF_EFFORT: TournamentOptions[] = [
  { rough: 300, exact: 5_000, reach: null, finalists: 3, judged: true, stride: 2, tuning: { prune: true, lookahead: true, goalBudget: 40_000, cellCost: 150, candidates: 12 } },
  { rough: 300, exact: 20_000, reach: { depth: 6, most: 40 }, finalists: 3, tuning: { prune: true, lookahead: true, goalBudget: 100_000, cellCost: 300, candidates: 6 } },
  { rough: 1_000, exact: 50_000, reach: { depth: 8, most: 60 }, finalists: 4, tuning: { prune: true, lookahead: true, goalBudget: 400_000, cellCost: 1_000, candidates: 12 } },
  { rough: 3_000, exact: 100_000, reach: { depth: 12, most: 120 }, finalists: 6, perCell: 8, tuning: { prune: true, lookahead: true, goalBudget: 1_000_000, cellCost: 3_000, candidates: 12 } },
];

/** A hard goal near `near` at an effort level (LEVELS_OF_EFFORT). */
export function makeGoalHard(layout: Layout, near: Point, options: GoalOptions & { target?: number; watch?: Watch } = {}, level = 1): Ranked | null {
  return makeGoalTournament(layout, near, { ...LEVELS_OF_EFFORT[Math.max(0, Math.min(level, LEVELS_OF_EFFORT.length - 1))], ...options });
}

/** How a goal's difficulty is weighed against its distance: difficulty / distance^alpha.
 * 0 ranks by difficulty alone (nearly always the furthest cell: each nearer cell's proof
 * is a prefix of the further one's); 1 by difficulty per cell. */
/** And each block on the red block's own track between it and the target (see onTrack)
 * multiplies the balance by `train`: they have to be pushed ahead of it, some past the
 * target, which is tedious rather than hard (reports/blocks-on-track.html). */
export const tradeoff = { alpha: 0.6, train: 0.5 }; // (reports/play-analysis.html)
/** And by the Judge's factor for the extra moves of its proof, as far as its measure vouches
 * for them (judge.ts extraFactor, extraOf). */
export const balance = (g: { difficulty: Difficulty; distance: number; train?: number; extra?: number; solution: unknown[] }) => (g.difficulty.score / Math.pow(g.distance, tradeoff.alpha)) * Math.pow(tradeoff.train, g.train ?? 0) * extraFactor(g.extra ?? 0, g.difficulty.moves ?? g.solution.length, WISHES.extra!);

/** A proof tidied (goal-fast.ts tidy) when it moves a block more than once: a move it does
 * not need would count as an extra move. (One that moves each block once is left as it is:
 * tidying every candidate cost a tenth of the maker's time.) */
function tidied(board: Board, red: string, target: Point, proof: Move[]): Move[] {
  return extraMoves(proof.map((m) => m.id)) > 0 ? tidy(board, red, target, proof) : proof;
}

/** The extra moves of a goal's `proof` (judge.ts extraMoves), as far as its measure `d` vouches
 * for them: when it did not prove the proof shortest, the proof may move blocks again that a
 * shorter one would not, so no more than the fewest it is known to need (at least) less the
 * blocks the proof moves. (Without this, long proofs with a low bound won the rank.) */
export function extraOf(d: Difficulty, proof: { id: string }[]): number {
  const extra = extraMoves(proof.map((m) => m.id));
  if (d.moves !== null && d.moves >= proof.length) return extra;
  return Math.min(extra, Math.max(0, (d.moves ?? d.atLeast) - (proof.length - extra)));
}

/** Blocks on red block `id`'s own track (lying the same way, in its lane) between where it
 * is and the far end of `target`: they can only be pushed ahead of it. */
export function onTrack(board: Board, id: string, target: Point): number {
  const red = board.block(id), horizontal = red.w > red.h;
  const from = horizontal ? red.x : red.y, to = horizontal ? target.x : target.y, size = horizontal ? red.w : red.h;
  const seen = new Set<string>();
  for (let p = Math.min(from, to); p < Math.max(from, to) + size; p++) {
    const o = horizontal ? board.at(p, red.y) : board.at(red.x, p);
    if (o === null || o === id || seen.has(o)) continue;
    const b = board.block(o);
    if (horizontal ? b.w > b.h && b.y === red.y : b.h > b.w && b.x === red.x) seen.add(o);
  }
  return seen.size;
}

/** The push search's targets, ranked by the difficulty measure. */
export function makeGoalTournament(layout: Layout, near: Point, options: TournamentOptions = {}): Ranked | null {
  const { moved = new Map(), avoid = [], rough = 3_000, exact = 50_000, reach = null, finalists = 4, judged = false, stride = 1, tuning = { prune: true, lookahead: true, goalBudget: 50_000 }, target, watch } = options;
  const board = new Board(layout, moved);
  const all = pushes(board, layout, near, { ...options, perCell: options.perCell ?? 6 }, tuning);
  watch?.step?.("pushes");
  // Every cell of every push is a candidate, measured roughly; each notes the blocks on its
  // red block's track on the way, for the balance's penalty.
  const candidates: Ranked[] = [];
  for (const p of all) {
    const red = board.block(p.id);
    for (let k = p.steps.length - 1; k >= 0; k--) {
      if ((k + 1) % stride !== 0 && k !== p.steps.length - 1) continue;
      const step = p.steps[k]!;
      if (avoid.some((a) => intersects({ ...step.at, w: red.w, h: red.h }, a))) continue;
      const solution = tidied(board, p.id, step.at, simplifyFast(board, p.raw.slice(0, step.moves)));
      const goal = { id: p.id, target: step.at, solution };
      const d = measure(board, goal, { limit: rough, margin: NEAR, reach: null });
      const proof = d.solution && d.solution.length < solution.length ? d.solution : solution;
      candidates.push({ ...goal, difficulty: d, distance: k + 1, train: onTrack(board, p.id, step.at), extra: extraOf(d, proof) });
    }
  }
  // Rank by difficulty for the distance (a lower bound counts as the moves): a near goal
  // that is nearly as hard beats a far one; times the Judge's factor for the extra moves (as
  // far as the measure vouches for them: extraOf). Then the proof's length (shorter is
  // likelier to be the real fewest).
  // With a target, the nearest it first (as far as is known: the fewest, or else at least).
  const off = (c: Ranked) => (target === undefined ? 0 : Math.abs((c.difficulty.moves ?? c.difficulty.atLeast) - target));
  const rank = (a: Ranked, b: Ranked) => off(a) - off(b) || balance(b) - balance(a) || a.solution.length - b.solution.length || a.distance - b.distance;
  candidates.sort(rank);
  watch?.step?.("rough");
  watch?.ranked?.(candidates, finalists);
  const top = candidates.slice(0, finalists);
  for (const c of top) {
    c.difficulty = measure(board, c, { limit: exact, reach });
    if (c.difficulty.solution && c.difficulty.solution.length < c.solution.length) c.solution = tidied(board, c.id, c.target, c.difficulty.solution);
    c.extra = extraOf(c.difficulty, c.solution);
  }
  watch?.step?.("exact");
  let fitness: Map<Ranked, number> | null = null;
  if (judged) {
    // The finalists as the Judge weighs them (contract.ts WISHES): moves plus decisions, the
    // extra moves, the aim's halving per move off rather than first, and the reach from `near`.
    const w = WISHES, fit = new Map<Ranked, number>();
    for (const c of top) {
      const moves = c.difficulty.moves ?? c.solution.length;
      const decisions = decisionStages(board, contractGoal(c)).reduce((a, b) => a + b, 0);
      const off = target === undefined ? 0 : Math.abs(moves - target);
      const red = board.block(c.id);
      const reach = Math.max(0, red.x - near.x, near.x - (red.x + red.w - 1)) + Math.max(0, red.y - near.y, near.y - (red.y + red.h - 1));
      fit.set(c, ((moves + w.decision * decisions) / Math.pow(c.distance, w.distance)) * Math.pow(w.track, c.train ?? 0) * extraFactor(c.extra ?? 0, moves, w.extra!) * Math.pow(w.aim, off) * Math.pow(w.reach, Math.max(0, reach - w.reachFree)));
    }
    top.sort((a, b) => fit.get(b)! - fit.get(a)! || rank(a, b));
    fitness = fit;
  } else top.sort(rank);
  watch?.step?.("picked");
  watch?.picked?.(top, fitness);
  const best = top[0] ?? null;
  if (best && !board.replays(best.solution)) throw new Error("goal search: solution does not replay");
  return best;
}
