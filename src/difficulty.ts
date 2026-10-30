// How hard a goal is. A breadth-first search over every board reachable from where the goal
// starts, one slide (of any length) at a time, finds the fewest moves that solve it, and
// counts the boards it had to look at first. That count grows with both the length of the
// solution and how many choices there are along the way (branching), so its log is the
// difficulty: each point is a doubling of the search a solver, or a player, faces.
//
// The search runs in a window around the goal: the red block's run and every block the
// goal's own solution moves, plus a margin. Only the blocks that matter slide: those the
// solution moves, and the blocks in their lanes (in their way). The rest stand still, so a
// free block nearby that could wander anywhere doesn't count as a choice; with it, the
// search blew up (468k boards at four moves on a default board).
import type { Point, Rect } from "./camera";
import { Board, isFixed } from "./board";
import type { Goal } from "./goal";
import type { Layout } from "./layout";

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
};

const MARGIN = 1;

export function difficulty(layout: Layout, moved: ReadonlyMap<string, Point>, goal: Goal, { limit = 50_000 } = {}): Difficulty {
  const board = new Board(layout, moved);
  const red = board.block(goal.id);
  // The window.
  const boxes: Rect[] = [
    { x: red.x, y: red.y, width: red.w, height: red.h },
    { x: goal.target.x, y: goal.target.y, width: red.w, height: red.h },
  ];
  for (const m of goal.solution) {
    const b = board.home(m.id);
    if (!b) continue;
    for (const p of [m.from, m.to]) boxes.push({ x: p.x, y: p.y, width: b.w, height: b.h });
  }
  const x0 = Math.min(...boxes.map((b) => b.x)) - MARGIN;
  const y0 = Math.min(...boxes.map((b) => b.y)) - MARGIN;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + MARGIN;
  const y1 = Math.max(...boxes.map((b) => b.y + b.height)) + MARGIN;
  const W = x1 - x0, H = y1 - y0;

  // Static cells (anything that does not move in the window) and the sliding blocks.
  const wall = new Uint8Array(W * H);
  type Slider = { id: string; horizontal: boolean; line: number; size: number };
  const sliders: Slider[] = [];
  const seen = new Set<string>();
  const start: number[] = [];
  // The blocks that matter: the solution's, and whatever is in their lanes.
  const moving = new Set([goal.id, ...goal.solution.map((m) => m.id)]);
  const matters = new Set(moving);
  for (const id of moving) {
    const b = board.block(id);
    const horizontal = b.w > b.h;
    for (let p = horizontal ? x0 : y0; p < (horizontal ? x1 : y1); p++) {
      for (let k = 0; k < (horizontal ? b.h : b.w); k++) {
        const o = horizontal ? board.at(p, b.y + k) : board.at(b.x + k, p);
        if (o) matters.add(o);
      }
    }
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const id = board.at(x, y);
      if (!id) continue;
      const b = board.block(id);
      const inside = b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1;
      if (isFixed(b) || !inside || !matters.has(id)) {
        wall[(y - y0) * W + (x - x0)] = 1;
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const horizontal = b.w > b.h;
      sliders.push({ id, horizontal, line: horizontal ? b.y - y0 : b.x - x0, size: horizontal ? b.w : b.h });
      start.push(horizontal ? b.x - x0 : b.y - y0);
    }
  }
  const r = sliders.findIndex((s) => s.id === goal.id);
  const want = sliders[r]!.horizontal ? goal.target.x - x0 : goal.target.y - y0;

  const grid = new Uint8Array(W * H);
  const cell = (s: Slider, p: number, i: number) => (s.horizontal ? s.line * W + p + i : (p + i) * W + s.line);
  const fill = (state: number[]) => {
    grid.set(wall);
    sliders.forEach((s, i) => {
      for (let k = 0; k < s.size; k++) grid[cell(s, state[i]!, k)] = 1;
    });
  };
  const length = (s: Slider) => (s.horizontal ? W : H);

  // Breadth first, one level of boards at a time.
  // A board's key: one character per sliding block's position.
  const keyOf = (state: number[]) => String.fromCharCode(...state);
  const runner = sliders[r]!;
  // A lower bound on the moves left: the red block's own move, plus one for each other
  // block in the cells between it and its target (each has to move at least once).
  const lower = (state: number[]) => {
    const pos = state[r]!;
    if (pos === want) return 0;
    fill(state);
    const from = Math.min(pos, want), to = Math.max(pos, want) + runner.size;
    const inWay = new Set<number>();
    for (let p = from; p < to; p++) {
      const c = cell(runner, p, 0);
      if (grid[c] && !(p >= pos && p < pos + runner.size)) inWay.add(c);
    }
    // Cells, not blocks: a 2-long block can cover two of them, so count blocks by owner.
    let blocks = 0;
    const owners = new Set<number>();
    for (const c of inWay) {
      const owner = sliders.findIndex((s, i) => i !== r && Array.from({ length: s.size }, (_, k) => cell(s, state[i]!, k)).includes(c));
      if (owner < 0) return Infinity; // a still block in the way: never from here
      if (!owners.has(owner)) {
        owners.add(owner);
        blocks++;
      }
    }
    return 1 + blocks;
  };
  // A*: boards in order of moves made + lower bound; the first solved board taken out is a
  // shortest solution. Along the way, how many moves each board had (its branching).
  const best = new Map<string, number>([[keyOf(start), 0]]);
  const buckets: number[][][] = [];
  const push = (state: number[], g: number) => {
    const f = g + lower(state);
    if (f === Infinity) return;
    (buckets[f] ??= []).push(state);
  };
  push(start, 0);
  let expanded = 0, choices = 0;
  for (let f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    while (bucket?.length) {
      const state = bucket.pop()!;
      const g = best.get(keyOf(state))!;
      if (state[r] === want) {
        const branching = expanded ? choices / expanded : 1;
        return { moves: g, atLeast: g, searched: expanded, branching, score: g * Math.log2(Math.max(branching, 1)) };
      }
      if (best.size > limit) return { moves: null, atLeast: f, searched: expanded, branching: choices / expanded, score: f * Math.log2(Math.max(choices / expanded, 1)) };
      expanded++;
      fill(state);
      const moves: number[][] = [];
      for (let i = 0; i < sliders.length; i++) {
        const s = sliders[i]!;
        const pos = state[i]!;
        for (const dir of [1, -1]) {
          for (let p = pos + dir; p >= 0 && p + s.size <= length(s); p += dir) {
            if (grid[cell(s, dir > 0 ? p + s.size - 1 : p, 0)]) break;
            const after = state.slice();
            after[i] = p;
            moves.push(after);
          }
        }
      }
      choices += moves.length;
      for (const after of moves) {
        const key = keyOf(after);
        if ((best.get(key) ?? Infinity) <= g + 1) continue;
        best.set(key, g + 1);
        push(after, g + 1);
      }
    }
  }
  return { moves: null, atLeast: Infinity, searched: expanded, branching: 0, score: 0 };
}

/** The usual difficulty at each density (tries): the 5th and 95th percentile over 30 boards
 * each, from test/experiments/difficulty-range.ts. Re-measure when the measure changes. */
const RANGE: [tries: number, low: number, high: number][] = [
  [1, 3.7, 9.0],
  [4, 3.8, 15.5],
  [7, 12.8, 31.4],
  [10, 18.1, 43.3],
  [15, 18.1, 46.4],
  [20, 30.2, 64.2],
  [25, 33.2, 63.9],
  [30, 39.8, 67.9],
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
