// How hard a goal is: the fewest moves M that solve it (one move = one block sliding any
// distance), found by A* over the boards reachable in a window round the goal, and the
// average number of moves to choose from on the boards it looked at (branching b). The
// difficulty is log2(b^M): the size of the tree of move sequences as long as the shortest
// solution; each point doubles it.
//
// The window is the red block's run (where it is to where it must get) plus a margin, the
// same whatever solution the goal came with, so a goal is not harder for having a longer
// proof. Only the blocks that can matter slide: those a chain of lanes connects to the red
// block (src/window.ts, closure); a free block nearby that could wander anywhere is not a
// choice. Blocks outside the window stand still, so M is the fewest moves within the
// window: a solution using blocks further away could in principle be shorter.
import type { Point } from "./camera";
import { Board } from "./board";
import type { Goal } from "./goal";
import type { Layout } from "./layout";
import type { Move } from "./rules";
import { Pool, runWindow, Window } from "./window";

export type Difficulty = {
  /** Fewest moves that solve it, or null when the search stopped first. */
  moves: number | null;
  /** When it stopped first: no solution is shorter than this. */
  atLeast: number;
  /** Boards the search expanded. */
  searched: number;
  /** Moves to choose from on an average board on the way. */
  branching: number;
  /** The difficulty: log2 of branching^moves, the size of the tree of move sequences as
   * long as the shortest solution. Each point doubles it. */
  score: number;
  /** A shortest solution, when found; else the shortest the search came across, if any
   * (no solution is shorter than `atLeast`, and this one is an upper bound). */
  solution?: Move[];
};

/** Cells round the red block's run that are searched. */
export const MARGIN = 2;
/** How many lanes away from the red block and the solution's blocks a block may be and
 * still slide: 1 is the blocks in their lanes. (Measured on the benchmark goals: the same
 * fewest moves as the whole window's closure wherever both were exact, in half the time;
 * a shorter solution through a block two lanes from everything the proof touches would be
 * missed.) */
export const LEVELS = 1;

export type MeasureOptions = { limit?: number; margin?: number; levels?: number };

export function difficulty(layout: Layout, moved: ReadonlyMap<string, Point>, goal: Goal, options: MeasureOptions = {}): Difficulty {
  return measure(new Board(layout, moved), goal, options);
}

/** difficulty() on a board as it is now (which it leaves as it was). */
export function measure(board: Board, goal: Goal, { limit = 50_000, margin = MARGIN, levels = LEVELS }: MeasureOptions = {}): Difficulty {
  const red = board.block(goal.id);
  const horizontal = red.w > red.h;
  const rect = runWindow(red, { from: horizontal ? red.x : red.y, to: horizontal ? goal.target.x : goal.target.y }, margin, margin);
  // The goal's own solution has to fit, or the window could say "unsolvable" (and the
  // fewest moves within it can never exceed the solution's).
  let x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.width, y1 = rect.y + rect.height;
  for (const m of goal.solution) {
    const b = board.home(m.id);
    if (!b) continue;
    for (const p of [m.from, m.to]) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + b.w);
      y1 = Math.max(y1, p.y + b.h);
    }
  }
  const win = new Window(board, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).closure(board, [goal.id, ...goal.solution.map((m) => m.id)], levels);
  const r = win.index(goal.id);
  const want = (horizontal ? goal.target.x : goal.target.y) - (horizontal ? win.x0 : win.y0);
  return shortest(win, r, want, limit);
}

/** The fewest moves that get slider `r` to `want`: A* (astar below, weight 1) up to
 * `limit` boards, after a greedy phase (weight GREEDY) on a share of them that finds some
 * solution fast. The greedy solution is the answer when it is as short as A*'s lower
 * bound, and the best known solution when A* stops at the cap. */
export function shortest(win: Window, r: number, want: number, limit: number): Difficulty {
  const quick = tuning.greedyShare > 0 ? astar(win, r, want, Math.ceil(limit * tuning.greedyShare), tuning.greedy) : null;
  const upper = quick?.g ?? Infinity;
  const exact = astar(win, r, want, limit, 1, upper);
  const expanded = exact.expanded + (quick?.expanded ?? 0);
  const branching = expanded ? (exact.choices + (quick?.choices ?? 0)) / expanded : 1;
  const result = (g: number | null, atLeast: number, solution: Move[] | undefined): Difficulty => ({ moves: g, atLeast, searched: expanded, branching, score: (g ?? atLeast) * Math.log2(Math.max(branching, 1)), solution });
  if (exact.g !== null) return result(exact.g, exact.g, exact.solution);
  if (upper < Infinity && upper <= exact.f) return result(upper, upper, quick!.solution);
  if (exact.f === Infinity) return { moves: null, atLeast: Infinity, searched: expanded, branching: 0, score: 0 };
  return result(null, exact.f, quick?.solution);
}

/** Share of the cap the greedy phase gets, and its weight on the lower bound (f = g +
 * weight * h): tuned on test/experiments/cap-tune.ts. */
export const tuning = { greedyShare: 0.25, greedy: 4 };

type Search = { g: number | null; f: number; solution?: Move[]; expanded: number; choices: number };

/** Weighted A* from the window's start to slider `r` at `want`: boards in order of moves
 * made plus `w` times the lower bound on moves left (Window.lower), so with w = 1 the
 * first solved board taken out ends a shortest solution, and with w > 1 some solution
 * sooner. Stops at `limit` boards (a count, so the same whatever the machine); `f` is then
 * the bucket in hand, a lower bound on any solution when w = 1. Boards that cannot beat
 * `upper` moves are not searched. */
function astar(win: Window, r: number, want: number, limit: number, w: number, upper = Infinity): Search {
  const pool = new Pool(win.sliders.length);
  // Buckets by f, of (state, moves made when pushed) pairs packed as state * 256 + moves;
  // an entry whose moves are no longer the state's best is stale.
  const buckets: number[][] = [];
  let best = new Int32Array(1024); // moves made to each pooled state
  // A state goes in with the cheap bound (the grid shows the state being expanded; a
  // child is patched onto it), and gets the full bound when it comes out: if that puts
  // it in a later bucket, it goes back in there. Correct, since buckets are taken in
  // order and both bounds are true; and the full bound is only worked out for the few
  // states that come out, not every state that goes in.
  // The bounds are not consistent (a move can drop the full bound by more than one), so a
  // child can bound lower than its parent did; it still cannot be solved in fewer moves
  // than the bucket in hand, so it goes in there at the earliest (pathmax).
  let refinedAt = new Uint8Array(1024); // 1 once a state has had its full bound
  let f = 0;
  const push = (i: number, g: number, h: number) => {
    const at = Math.max(g + w * h, f);
    if (at === Infinity || g + h >= upper) return;
    (buckets[at] ??= []).push(i * 256 + g);
  };
  const root = pool.add(win.start, 0, -1, 0);
  best[root] = 0;
  win.fill(win.start, 0);
  push(root, 0, win.lowerCheap(win.start, 0, r, want));
  let expanded = 0, choices = 0;
  const child = new Uint8Array(win.sliders.length);
  for (f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    while (bucket?.length) {
      const e = bucket.pop()!;
      const g = e % 256, i = (e - g) / 256;
      if (best[i] !== g) continue; // reached cheaper since
      const at = pool.offset(i);
      if (pool.data[at + r] === want) return { g, f, solution: pool.path(win, i), expanded, choices };
      if (pool.count > limit || expanded > limit) return { g: null, f: w === 1 ? f : 0, expanded, choices };
      win.fill(pool.data, at);
      if (!refinedAt[i]) {
        refinedAt[i] = 1;
        const h = win.lower(pool.data, at, r, want);
        if (g + h >= upper) continue;
        const full = g + w * h;
        if (full > f) {
          if (full < Infinity) (buckets[full] ??= []).push(i * 256 + g);
          continue;
        }
      }
      expanded++;
      const slides: number[] = [];
      choices += win.moves(pool.data, at, (k, to) => slides.push(k, to));
      for (let m = 0; m < slides.length; m += 2) {
        const k = slides[m]!, to = slides[m + 1]!;
        child.set(pool.data.subarray(at, at + pool.n));
        child[k] = to;
        let j = pool.find(child, 0);
        if (j === undefined) {
          j = pool.add(child, 0, i, g + 1);
          if (j >= best.length) {
            const size = Math.max(1024, best.length * 2, j + 1);
            const b = new Int32Array(size);
            b.set(best);
            best = b;
            const ra = new Uint8Array(size);
            ra.set(refinedAt);
            refinedAt = ra;
          }
        } else if (best[j]! <= g + 1) continue;
        else {
          // Reached in fewer moves: with w = 1 it is searched again from here (the bounds
          // are not consistent, so this happens, rarely); a weighted search only takes
          // the shorter way in, or it would search the same boards over and over.
          pool.parent[j] = i;
          best[j] = g + 1;
          if (w !== 1) continue;
        }
        best[j] = g + 1;
        refinedAt[j] = 0;
        const from = pool.data[at + k]!;
        win.patch(k, from, to);
        push(j, g + 1, win.lowerCheap(child, 0, r, want));
        win.patch(k, to, from);
      }
    }
  }
  // Nothing left to search: no solution within the window (shorter than `upper`).
  return { g: null, f: upper, expanded, choices };
}

/** The usual difficulty at each density (tries): the 5th and 95th percentile over 20 boards
 * each of goals made ahead (makeGoalHard level 2), from test/experiments/difficulty-range.ts.
 * Re-measure when the measure or the goal search changes. */
const RANGE: [tries: number, low: number, high: number][] = [
  [1, 2.3, 21.8],
  [4, 10.5, 52.4],
  [7, 17.7, 65.0],
  [10, 30.8, 99.7],
  [15, 26.1, 110.9],
  [20, 24.8, 109.4],
  [25, 22.7, 108.4],
  [30, 21.0, 114.6],
];

/** How many stars (0..10) a goal is worth: its difficulty within the usual range for its
 * density, the 5th percentile at 0 and the 95th at 10. */
export function starsFor(score: number, tries: number): number {
  const i = Math.max(0, RANGE.findIndex(([t]) => t >= tries) - 1);
  const [t0, lo0, hi0] = RANGE[i]!;
  const [t1, lo1, hi1] = RANGE[Math.min(i + 1, RANGE.length - 1)]!;
  const k = t1 === t0 ? 0 : Math.min(1, Math.max(0, (tries - t0) / (t1 - t0)));
  const lo = lo0 + (lo1 - lo0) * k, hi = hi0 + (hi1 - hi0) * k;
  return Math.min(10, Math.max(0, Math.round((10 * (score - lo)) / (hi - lo))));
}

/** The stars earned: all of them in the fewest moves, fewer the more moves it took, but
 * never more than one star lost per extra move (the kinder of "one star per extra move" and
 * "worth x fewest / used"). */
export function starsEarned(worth: number, fewest: number, used: number): number {
  const extra = Math.max(0, used - fewest);
  return Math.max(worth - extra, Math.round(worth * Math.min(1, fewest / Math.max(used, 1))), 0);
}
