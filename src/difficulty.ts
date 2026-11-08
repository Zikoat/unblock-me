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
// window: a solution using blocks further away could in principle be shorter, and a player
// who finds one wins a medal the game should not give.
//
// Why a window at all: the board is endless, and lanes chain every block to every other,
// so the whole board is no state space; and each block that may slide multiplies the
// boards one move away. On the Bench's goals (test/experiments/window-cost.ts, 200k boards),
// a margin of 2 slides 13 blocks at the median, 5 slides 26, 8 slides 41, 16 slides 77, and
// 16 with every chain of lanes 404; the search finishes on 87 of 94 at 2 and 61 at 16 with
// every chain, and takes 1 ms at the median at 2, 330 ms at 16 with every chain. The board
// count stops the search, so a wider window is also a shallower one at the same budget.
//
// So the measure looks twice: first in the near window (NEAR cells round the run), then,
// with no fixed box, sliding only the blocks that matter (blocking): those in red's way,
// those in the way of each of them getting clear, and so on, wherever they are (they are
// near because they block), as many steps and blocks as the effort level allows
// (src/goal-search.ts, LEVELS_OF_EFFORT: the reach). The second search only looks for a
// solution shorter than the first's (A* prunes every board whose moves made plus its lower
// bound cannot beat it, so where the near answer is right it ends soon), up to its own board
// budget. Its answer stands when it finishes or finds a shorter solution; else the near one
// does: never worse than the near window alone. (In play, test/experiments/medals.ts, the
// blocks that matter found a shorter way for more goals than a box 6 cells round, at a
// twentieth of its time.)
import type { Point, Rect } from "./camera";
import { Board, isFixed } from "./board";
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

/** Cells round the red block's run searched first (the near window). (In play,
 * test/experiments/medals.ts: with it alone, the game's fewest was more than the true fewest
 * for 53 of 384 goals reached, most of them long ones where the search stopped at its budget;
 * the blocks that matter, 8 steps and 60 blocks at most, found a shorter way for 28 of them,
 * and for 7 of the 26 medals one no longer than the player's.) */
export const NEAR = 2;
/** How far the search for the blocks that matter goes: steps of "in the way of", and blocks. */
export type Reach = { depth: number; most: number };
export const REACH: Reach = { depth: 8, most: 60 };
/** How many lanes away from the red block and the solution's blocks a block may be and
 * still slide: 1 is the blocks in their lanes. (Measured on the benchmark goals: the same
 * fewest moves as the whole window's closure wherever both were exact, in half the time;
 * a shorter solution through a block two lanes from everything the proof touches would be
 * missed.) */
export const LEVELS = 1;

/** Watches a measure's search (for reports: test/experiments/goal-trace.ts): its window,
 * then each board it expands, greedy phase first, with the moves made to it and its bucket. */
export type Trace = { window?(win: Window, r: number, want: number): void; expand?(greedy: boolean, g: number, f: number, state: Uint8Array): void };

/** `limit`: boards per search; `margin`: the first window's cells round the run (a wider box
 * than NEAR is searched after the near one); `reach`: then the blocks that matter (null: not). */
export type MeasureOptions = { limit?: number; margin?: number; levels?: number; trace?: Trace; reach?: Reach | null };

export function difficulty(layout: Layout, moved: ReadonlyMap<string, Point>, goal: Goal, options: MeasureOptions = {}): Difficulty {
  return measure(new Board(layout, moved), goal, options);
}

/** difficulty() on a board as it is now (which it leaves as it was): the near window, then
 * a wider box if asked, then the blocks that matter (up to `limit` boards each), each
 * looking for a solution shorter than the best so far. The branching is the near window's
 * either way, so goals measured either way rank alike. */
export function measure(board: Board, goal: Goal, { limit = 50_000, margin = NEAR, levels = LEVELS, trace, reach = REACH }: MeasureOptions = {}): Difficulty {
  const near = measureIn(board, goal, Math.min(margin, NEAR), levels, limit, trace);
  let d = near, searched = near.searched;
  const better = (next: Difficulty) => {
    searched += next.searched;
    if (next.moves !== null || (next.solution?.length ?? Infinity) < (d.solution?.length ?? Infinity)) d = next;
  };
  if (margin > NEAR) better(measureIn(board, goal, margin, levels, limit, trace, d.solution));
  if (reach) better(reachIn(board, goal, reach, limit, trace, d.solution));
  if (d === near) return { ...near, searched };
  return { ...d, searched, branching: near.branching, score: (d.moves ?? d.atLeast) * Math.log2(Math.max(near.branching, 1)) };
}

/** The blocks that can matter to the red block getting to its target, wherever they are:
 * those in its way, those in the way of each of them getting clear (either way), and so
 * on, `depth` steps at most and `most` blocks, nearest steps first; and the rectangle
 * holding them, the cells they sweep, the run and the proof. */
export function blocking(board: Board, goal: Goal, depth: number, most: number): { ids: Set<string>; rect: Rect } {
  const red = board.block(goal.id), horizontal = red.w > red.h;
  let x0 = Math.min(red.x, goal.target.x), y0 = Math.min(red.y, goal.target.y), x1 = Math.max(red.x, goal.target.x) + red.w, y1 = Math.max(red.y, goal.target.y) + red.h;
  const grow = (x: number, y: number) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x + 1)), (y1 = Math.max(y1, y + 1)));
  const key = (x: number, y: number) => `${x},${y}`;
  const path: string[] = [];
  for (let p = horizontal ? x0 : y0; p < (horizontal ? x1 : y1); p++) path.push(horizontal ? key(p, red.y) : key(red.x, p));
  const ids = new Set<string>([goal.id]);
  const queue: { id: string; region: Set<string>; level: number }[] = [];
  const meet = (o: string | null, region: Set<string>, level: number) => {
    if (!o || ids.has(o) || ids.size >= most || level > depth || isFixed(board.block(o))) return;
    ids.add(o);
    queue.push({ id: o, region, level });
  };
  const pathSet = new Set(path);
  for (const c of path) {
    const [x, y] = c.split(",").map(Number) as [number, number];
    const o = board.at(x, y);
    if (o !== goal.id) meet(o, pathSet, 1);
  }
  for (let n = 0; n < queue.length; n++) {
    const { id, region, level } = queue[n]!;
    const b = board.block(id), hz = b.w > b.h, size = hz ? b.w : b.h;
    for (let k = 0; k < size; k++) grow(hz ? b.x + k : b.x, hz ? b.y : b.y + k);
    for (const dir of [1, -1]) {
      const swept = new Set<string>(), found: string[] = [];
      for (let d = 1; d <= 2 * size + region.size; d++) {
        const lead = dir > 0 ? (hz ? b.x : b.y) + size - 1 + d : (hz ? b.x : b.y) - d;
        const [cx, cy] = hz ? [lead, b.y] : [b.x, lead];
        const o = board.at(cx, cy);
        if (o && isFixed(board.block(o))) break;
        swept.add(key(cx, cy));
        grow(cx, cy);
        if (o && o !== id && !found.includes(o)) found.push(o);
        let clear = true;
        for (let k = 0; k < size && clear; k++) {
          const p = (hz ? b.x : b.y) + dir * d + k;
          if (region.has(hz ? key(p, b.y) : key(b.x, p))) clear = false;
        }
        if (clear) break;
      }
      for (const o of found) meet(o, swept, level + 1);
    }
  }
  for (const m of goal.solution) {
    const b = board.home(m.id);
    if (!b) continue;
    ids.add(m.id);
    for (const p of [m.from, m.to]) (grow(p.x, p.y), grow(p.x + b.w - 1, p.y + b.h - 1));
  }
  return { ids, rect: { x: x0 - 1, y: y0 - 1, width: x1 - x0 + 2, height: y1 - y0 + 2 } };
}

/** The fewest moves with only the blocks that matter sliding (blocking), with a known
 * solution to beat if given. */
function reachIn(board: Board, goal: Goal, { depth, most }: Reach, limit: number, trace?: Trace, known?: Move[]): Difficulty {
  const { ids, rect } = blocking(board, goal, depth, most);
  const win = new Window(board, rect, ids);
  const red = board.block(goal.id), horizontal = red.w > red.h;
  const r = win.index(goal.id);
  const want = (horizontal ? goal.target.x : goal.target.y) - (horizontal ? win.x0 : win.y0);
  trace?.window?.(win, r, want);
  return shortest(win, r, want, limit, trace, known);
}

/** The fewest moves within one window, `margin` cells round the run (and the proof), with
 * a known solution to beat if given. */
function measureIn(board: Board, goal: Goal, margin: number, levels: number, limit: number, trace?: Trace, known?: Move[]): Difficulty {
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
  trace?.window?.(win, r, want);
  return shortest(win, r, want, limit, trace, known);
}

/** The fewest moves that get slider `r` to `want`: A* (astar below, weight 1) up to
 * `limit` boards, after a greedy phase (weight GREEDY) on a share of them that finds some
 * solution fast, or with a `known` solution (from a narrower window) in its place. That
 * solution is the answer when it is as short as A*'s lower bound, and the best known
 * solution when A* stops at the cap. */
export function shortest(win: Window, r: number, want: number, limit: number, trace?: Trace, known?: Move[]): Difficulty {
  const quick = known ? { g: known.length, solution: known, expanded: 0, choices: 0 } : tuning.greedyShare > 0 ? astar(win, r, want, Math.ceil(limit * tuning.greedyShare), tuning.greedy, Infinity, trace) : null;
  const upper = quick?.g ?? Infinity;
  const exact = astar(win, r, want, limit, 1, upper, trace);
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
function astar(win: Window, r: number, want: number, limit: number, w: number, upper = Infinity, trace?: Trace): Search {
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
      trace?.expand?.(w !== 1, g, f, pool.data.subarray(at, at + pool.n));
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
