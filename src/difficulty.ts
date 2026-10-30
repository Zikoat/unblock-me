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
/** How many lanes away from the red block a block may be and still slide: 1 is the blocks
 * in its lane and the blocks in theirs. (Measured on the benchmark goals: the same fewest
 * moves as the whole window's closure wherever both were exact, in half the time.) */
export const LEVELS = 1;

export function difficulty(layout: Layout, moved: ReadonlyMap<string, Point>, goal: Goal, { limit = 50_000, margin = MARGIN, levels = LEVELS } = {}): Difficulty {
  const board = new Board(layout, moved);
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
  const buckets: number[][] = [];
  const best: number[] = []; // moves made to each pooled state
  const push = (i: number, g: number) => {
    win.fill(pool.data, pool.offset(i));
    const f = g + win.lower(pool.data, pool.offset(i), r, want);
    if (f === Infinity) return;
    (buckets[f] ??= []).push(i);
  };
  const root = pool.add(win.start, 0, -1, 0);
  best[root] = 0;
  push(root, 0);
  let expanded = 0, choices = 0;
  const child = new Uint8Array(win.sliders.length);
  const done = (g: number | null, atLeast: number, i: number | null): Difficulty => {
    const branching = expanded ? choices / expanded : 1;
    const moves = g ?? atLeast;
    return { moves: g, atLeast, searched: expanded, branching, score: moves * Math.log2(Math.max(branching, 1)), solution: i === null ? undefined : pool.path(win, i) };
  };
  for (let f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    while (bucket?.length) {
      const i = bucket.pop()!;
      const g = best[i]!;
      const at = pool.offset(i);
      if (pool.data[at + r] === want) return done(g, g, i);
      if (f > g + win.lower(pool.data, at, r, want)) continue; // reached cheaper since
      if (pool.count > limit) return done(null, f, null);
      expanded++;
      win.fill(pool.data, at);
      const slides: number[] = [];
      choices += win.moves(pool.data, at, (k, to) => slides.push(k, to));
      for (let m = 0; m < slides.length; m += 2) {
        child.set(pool.data.subarray(at, at + pool.n));
        child[slides[m]!] = slides[m + 1]!;
        let j = pool.find(child, 0);
        if (j === undefined) j = pool.add(child, 0, i, g + 1);
        else if (best[j]! <= g + 1) continue;
        else pool.parent[j] = i;
        best[j] = g + 1;
        push(j, g + 1);
      }
    }
  }
  return { moves: null, atLeast: Infinity, searched: expanded, branching: 0, score: 0 };
}
