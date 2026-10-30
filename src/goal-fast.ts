// Goal search on an indexed board (src/board.ts). Same search as makeGoal/clearCell, with
// optional prunings, so each change can be measured on its own.
import type { Point } from "./camera";
import { Board, cellKey, isFixed } from "./board";
import { merge, type Goal, type GoalOptions } from "./goal";
import { intersects, type Block, type Layout } from "./layout";
import { isHorizontal, type Move } from "./rules";

export type Tuning = {
  /** Skip a slide whose path holds a fixed or busy block, or more blockers than moves are
   * left (each needs at least one move); longer slides that way are skipped too. */
  prune?: boolean;
  /** With prune: when the moves left are exactly one per blocker, skip the slide if some
   * blocker cannot get out of the way in one slide (it needs another block moved first). */
  lookahead?: boolean;
  /** Stop trying candidates once one reached full effort (keeps the fewest-moves rule only
   * among those already tried). */
  earlyStop?: boolean;
  /** Told how long each simplify took (for reports). */
  timing?: (ms: number) => void;
  /** Simplify with whole replays, as goal.ts does (for comparison). */
  slowSimplify?: boolean;
  /** Node budget per cell. */
  budget?: number;
  /** Node budget for the whole goal: a deterministic cap on the worst case. Once spent,
   * every push stops at its next blocked cell. */
  goalBudget?: number;
  /** Count work for reports. */
  stats?: { clears: number; fails: number; nodes: number; failNodes: number };
  /** Candidate red blocks tried, nearest first. */
  candidates?: number;
};

/** Empty `cell` without moving blocks in `keep` (see clearCell in frozen.ts); moves are
 * applied to the board on success, and it is left as it was on failure. */
export function clearCellOn(board: Board, cell: Point, keep: ReadonlySet<string>, { maxMoves = 12, reach = 8, budget = 200_000, prune = false, lookahead = false, stats }: { maxMoves?: number; reach?: number; budget?: number; prune?: boolean; lookahead?: boolean; stats?: Tuning["stats"] } = {}): Move[] | null {
  const plan: Move[] = [];
  let nodes = 0;
  const forbidden = new Map<number, number>();
  const add = (k: number) => forbidden.set(k, (forbidden.get(k) ?? 0) + 1);
  const remove = (k: number) => {
    const n = forbidden.get(k)! - 1;
    if (n === 0) forbidden.delete(k);
    else forbidden.set(k, n);
  };
  const busy = new Set(keep);
  const blockers = new Set<string>();
  const path = new Set<number>();

  /** Can `id` slide clear of the forbidden cells and `path` in one move, treating the
   * other blockers as gone (they move too)? */
  function free(id: string): boolean {
    const b = board.block(id);
    const horizontal = b.w > b.h;
    const pos = horizontal ? b.x : b.y;
    const size = horizontal ? b.w : b.h;
    const key = (p: number) => (horizontal ? cellKey(p, b.y) : cellKey(b.x, p));
    const occupant = (p: number) => (horizontal ? board.at(p, b.y) : board.at(b.x, p));
    for (const dir of [1, -1]) {
      for (let d = 1; d <= reach; d++) {
        const swept = dir > 0 ? pos + size - 1 + d : pos - d;
        const o = occupant(swept);
        if (o !== null && !blockers.has(o)) break;
        const p = pos + dir * d;
        let ok = true;
        for (let i = 0; i < size; i++) if (forbidden.has(key(p + i)) || path.has(key(p + i))) ok = false;
        if (ok) return true;
      }
    }
    return false;
  }

  function vacate(id: string, limit: number): boolean {
    const block = board.block(id);
    if (isFixed(block) || busy.has(id) || plan.length >= limit || ++nodes > budget) return false;
    const horizontal = block.w > block.h;
    const pos = horizontal ? block.x : block.y;
    const size = horizontal ? block.w : block.h;
    const lane = (p: number): Point => (horizontal ? { x: p, y: block.y } : { x: block.x, y: p });
    const key = (p: number) => (horizontal ? cellKey(p, block.y) : cellKey(block.x, p));
    const dead = [false, false];
    for (let d = 1; d <= reach; d++) {
      for (let s = 0; s < 2; s++) {
        if (dead[s]) continue;
        const dir = s === 0 ? 1 : -1;
        const p = pos + dir * d;
        let hit = false;
        for (let i = 0; i < size; i++) if (forbidden.has(key(p + i))) hit = true;
        const cell = (i: number) => (dir > 0 ? pos + size + i : pos - 1 - i);
        if (prune) {
          // Blockers along the whole path: if one can never move, nor can a longer slide.
          blockers.clear();
          let stop = false;
          for (let i = 0; i < d; i++) {
            const c = lane(cell(i));
            const o = board.at(c.x, c.y);
            if (o === null) continue;
            if (busy.has(o) || isFixed(board.home(o)!)) stop = true;
            blockers.add(o);
          }
          if (stop || plan.length + 1 + blockers.size > limit) {
            dead[s] = true;
            continue;
          }
          if (lookahead && !hit && plan.length + 1 + blockers.size === limit && blockers.size > 0) {
            path.clear();
            for (let i = 0; i < d; i++) path.add(key(cell(i)));
            let all = true;
            for (const o of blockers) if (!free(o)) all = false;
            if (!all) continue;
          }
        }
        if (hit) continue;
        const mark = board.mark();
        const before = plan.length;
        for (let i = 0; i < d; i++) add(key(cell(i)));
        let clear = true;
        busy.add(id);
        for (let i = 0; i < d; i++) {
          const c = lane(cell(i));
          const other = board.at(c.x, c.y);
          if (other !== null && other !== id && !vacate(other, limit - 1)) {
            clear = false;
            break;
          }
        }
        busy.delete(id);
        for (let i = 0; i < d; i++) remove(key(cell(i)));
        if (clear && plan.length < limit) {
          const to = lane(p);
          board.move(id, to);
          plan.push({ id, from: { x: block.x, y: block.y }, to });
          return true;
        }
        plan.length = before;
        board.undo(mark);
      }
    }
    return false;
  }

  const other = board.at(cell.x, cell.y);
  if (stats) stats.clears++;
  if (other === null) return [];
  const start = board.mark();
  add(cellKey(cell.x, cell.y));
  for (let limit = 1; limit <= maxMoves && nodes <= budget; limit++) {
    plan.length = 0;
    board.undo(start);
    if (vacate(other, limit)) {
      if (stats) stats.nodes += nodes;
      return [...plan];
    }
  }
  board.undo(start);
  if (stats) {
    stats.nodes += nodes;
    stats.fails++;
    stats.failNodes += nodes;
  }
  return null;
}

/** simplify (goal.ts) with an indexed board for the replays. */
export function simplifyOn(board: Board, moves: Move[]): Move[] {
  let out = merge(moves);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      const j = out.findIndex((m, k) => k > i && m.id === out[i]!.id);
      if (j < 0) continue;
      const tried = merge([...out.slice(0, i), ...out.slice(i + 1, j), { ...out[j]!, from: out[i]!.from }, ...out.slice(j + 1)]);
      if (board.replays(tried)) {
        out = tried;
        changed = true;
      }
    }
  }
  return out;
}

/** simplifyOn, replaying only from where a sequence changes (the board keeps the state
 * after the unchanged prefix), and going on after a fold instead of starting over; passes
 * repeat until one folds nothing. Not provably the same result as simplifyOn, but the same
 * on every board tried. */
export function simplifyFast(board: Board, moves: Move[]): Move[] {
  let out = merge(moves);
  const origin = board.mark();
  for (let folded = true; folded; ) {
    folded = false;
    board.undo(origin);
    for (let i = 0; i < out.length; i++) {
      // The board holds out[0..i-1].
      const j = out.findIndex((m, k) => k > i && m.id === out[i]!.id);
      if (j >= 0) {
        const tried = merge([...out.slice(0, i), ...out.slice(i + 1, j), { ...out[j]!, from: out[i]!.from }, ...out.slice(j + 1)]);
        // Merging can only change the sequence from i-1 on.
        const from = Math.max(0, i - 1);
        board.undo(origin + from);
        if (board.replays(tried.slice(from))) {
          out = tried;
          folded = true;
          i = from - 1;
          continue;
        }
        for (let k = from; k < i; k++) board.move(out[k]!.id, out[k]!.to);
      }
      board.move(out[i]!.id, out[i]!.to);
    }
  }
  board.undo(origin);
  return out;
}

/** The sliding blocks nearest `near` that may be the red block: in the 8x8 area round it,
 * not excluded nor on an excluded block's track, nearest first, at most `count`. */
export function candidatesNear(board: Board, layout: Layout, near: Point, exclude: ReadonlySet<string>, count = 6): Block[] {
  const track = (b: Block) => `${isHorizontal(b) ? "row" : "column"} ${isHorizontal(b) ? b.y : b.x}`;
  const taken = new Set([...exclude].flatMap((id) => {
    const b = layout.byId(id);
    return b ? [track(b)] : [];
  }));
  // The blocks in the 8x8 area round `near`, where they are now.
  const seen = new Set<string>();
  for (let x = near.x - 4; x < near.x + 4; x++) for (let y = near.y - 4; y < near.y + 4; y++) {
    const id = board.at(x, y);
    if (id !== null) seen.add(id);
  }
  return [...seen].map((id) => board.block(id))
    .filter((b) => intersects(b, { x: near.x - 4, y: near.y - 4, width: 8, height: 8 }))
    .filter((b) => !b.ui && !b.wall && !exclude.has(b.id) && !taken.has(track(b)))
    .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y) || (a.id < b.id ? -1 : 1))
    .slice(0, count);
}

export type Push = { id: string; dir: number; /** Where the red block got to after each cell, and the moves so far. */ steps: { at: Point; moves: number }[]; raw: Move[] };

/** Every candidate pushed both ways: the raw shuffles, with where the red block was after
 * each cell. The board is left as it was. */
export function pushes(board: Board, layout: Layout, near: Point, { effort = 12, perCell = 4, exclude = new Set() }: GoalOptions = {}, tuning: Tuning = {}): Push[] {
  const candidates = candidatesNear(board, layout, near, exclude, tuning.candidates);
  const out: Push[] = [];
  const origin = board.mark();
  const spent = tuning.stats ?? { clears: 0, fails: 0, nodes: 0, failNodes: 0 };
  const goalBudget = tuning.goalBudget ?? Infinity;
  for (const red of candidates) {
    for (const dir of [1, -1]) {
      const keep = new Set([red.id]);
      const moves: Move[] = [];
      const steps: { at: Point; moves: number }[] = [];
      for (let i = 0; i < effort; i++) {
        const at = board.block(red.id);
        const ahead = isHorizontal(at)
          ? { x: dir > 0 ? at.x + at.w : at.x - 1, y: at.y }
          : { x: at.x, y: dir > 0 ? at.y + at.h : at.y - 1 };
        const plan = clearCellOn(board, ahead, keep, { maxMoves: perCell, budget: Math.min(tuning.budget ?? 200_000, Math.max(0, goalBudget - spent.nodes)), prune: tuning.prune, lookahead: tuning.lookahead, stats: spent });
        if (!plan) break;
        moves.push(...plan);
        const to = isHorizontal(at) ? { x: at.x + dir, y: at.y } : { x: at.x, y: at.y + dir };
        board.move(red.id, to);
        moves.push({ id: red.id, from: { x: at.x, y: at.y }, to });
        steps.push({ at: to, moves: moves.length });
      }
      board.undo(origin);
      out.push({ id: red.id, dir, steps, raw: moves });
    }
  }
  return out;
}

/** makeGoal (goal.ts) on an indexed board. */
export function makeGoalFast(layout: Layout, near: Point, options: GoalOptions = {}, tuning: Tuning = {}): Goal | null {
  const { moved: start = new Map(), avoid = [] } = options;
  const board = new Board(layout, start);
  const all = pushes(board, layout, near, options, tuning);
  const picked: { id: string; target: Point; raw: Move[]; distance: number }[] = [];
  let furthest: { distance: number } | null = null;
  for (const p of all) {
    if (tuning.earlyStop && furthest && furthest.distance >= (options.effort ?? 12)) break;
    const red = board.block(p.id);
    const step = p.steps.filter((s) => !avoid.some((a) => intersects({ ...s.at, w: red.w, h: red.h }, a))).at(-1);
    if (!step) continue;
    const end = step.at;
    const distance = Math.abs(end.x - red.x) + Math.abs(end.y - red.y);
    picked.push({ id: p.id, target: end, raw: p.raw.slice(0, step.moves), distance });
    if (!furthest || distance > furthest.distance) furthest = { distance };
  }
  // Only the furthest pushes compete on moves, so only they need simplifying: the first
  // with the fewest moves wins, as in makeGoal.
  let best: Goal | null = null;
  for (const p of picked) {
    if (p.distance !== furthest?.distance) continue;
    const t0 = performance.now();
    const solution = tuning.slowSimplify ? simplifyOn(board, p.raw) : simplifyFast(board, p.raw);
    tuning.timing?.(performance.now() - t0);
    if (!best || solution.length < best.solution.length) best = { id: p.id, target: p.target, solution };
  }
  return best;
}
