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
  /** A shortest solution, when found. */
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

/** A* from the window's start to slider `r` at `want`: boards in order of moves made plus
 * the lower bound on moves left (Window.lower), so the first solved board taken out ends a
 * shortest solution. Stops at `limit` boards with a lower bound. */
export function shortest(win: Window, r: number, want: number, limit: number): Difficulty {
  const pool = new Pool(win.sliders.length);
  // Buckets by f, of (state, moves made when pushed) pairs; an entry whose moves are no
  // longer the state's best is stale.
  const buckets: number[][] = [];
  const best: number[] = []; // moves made to each pooled state
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
    const at = Math.max(g + h, f);
    if (at === Infinity) return;
    (buckets[at] ??= []).push(i, g);
  };
  const root = pool.add(win.start, 0, -1, 0);
  best[root] = 0;
  win.fill(win.start, 0);
  push(root, 0, win.lowerCheap(win.start, 0, r, want));
  let expanded = 0, choices = 0;
  const child = new Uint8Array(win.sliders.length);
  const done = (g: number | null, atLeast: number, i: number | null): Difficulty => {
    const branching = expanded ? choices / expanded : 1;
    const moves = g ?? atLeast;
    return { moves: g, atLeast, searched: expanded, branching, score: moves * Math.log2(Math.max(branching, 1)), solution: i === null ? undefined : pool.path(win, i) };
  };
  for (f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    while (bucket?.length) {
      const g = bucket.pop()!;
      const i = bucket.pop()!;
      if (best[i] !== g) continue; // reached cheaper since
      const at = pool.offset(i);
      if (pool.data[at + r] === want) return done(g, g, i);
      if (pool.count > limit) return done(null, f, null);
      win.fill(pool.data, at);
      if (i >= refinedAt.length) {
        const bigger = new Uint8Array(Math.max(1024, refinedAt.length * 2, i + 1));
        bigger.set(refinedAt);
        refinedAt = bigger;
      }
      if (!refinedAt[i]) {
        refinedAt[i] = 1;
        const full = g + win.lower(pool.data, at, r, want);
        if (full > f) {
          if (full < Infinity) (buckets[full] ??= []).push(i, g);
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
        if (j === undefined) j = pool.add(child, 0, i, g + 1);
        else if (best[j]! <= g + 1) continue;
        else pool.parent[j] = i;
        best[j] = g + 1;
        const from = pool.data[at + k]!;
        win.patch(k, from, to);
        push(j, g + 1, win.lowerCheap(child, 0, r, want));
        win.patch(k, to, from);
        if (j < refinedAt.length) refinedAt[j] = 0;
      }
    }
  }
  return { moves: null, atLeast: Infinity, searched: expanded, branching: 0, score: 0 };
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

/** The stars earned: all of them in the fewest moves, fewer the more moves it took. */
export function starsEarned(worth: number, fewest: number, used: number): number {
  return Math.round(worth * Math.min(1, fewest / Math.max(used, 1)));
}
