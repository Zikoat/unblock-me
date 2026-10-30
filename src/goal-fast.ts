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
  /** Node budget per cell. */
  budget?: number;
  /** Count work for reports. */
  stats?: { clears: number; fails: number; nodes: number; failNodes: number };
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

/** makeGoal (goal.ts) on an indexed board. */
export function makeGoalFast(layout: Layout, near: Point, { effort = 12, perCell = 4, moved: start = new Map(), exclude = new Set(), avoid = [] }: GoalOptions = {}, tuning: Tuning = {}): Goal | null {
  const board = new Board(layout, start);
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
  const candidates = [...seen].map((id) => board.block(id))
    .filter((b) => intersects(b, { x: near.x - 4, y: near.y - 4, width: 8, height: 8 }))
    .filter((b) => !b.ui && !b.wall && !exclude.has(b.id) && !taken.has(track(b)))
    .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y) || (a.id < b.id ? -1 : 1))
    .slice(0, 6);
  let best: (Goal & { distance: number }) | null = null;
  const origin = board.mark();
  for (const red of candidates) {
    if (tuning.earlyStop && best && best.distance >= effort) break;
    for (const dir of [1, -1]) {
      const keep = new Set([red.id]);
      const moves: Move[] = [];
      const steps: { at: Point; moves: number }[] = [];
      for (let i = 0; i < effort; i++) {
        const at = board.block(red.id);
        const ahead = isHorizontal(at)
          ? { x: dir > 0 ? at.x + at.w : at.x - 1, y: at.y }
          : { x: at.x, y: dir > 0 ? at.y + at.h : at.y - 1 };
        const plan = clearCellOn(board, ahead, keep, { maxMoves: perCell, budget: tuning.budget, prune: tuning.prune, lookahead: tuning.lookahead, stats: tuning.stats });
        if (!plan) break;
        moves.push(...plan);
        const to = isHorizontal(at) ? { x: at.x + dir, y: at.y } : { x: at.x, y: at.y + dir };
        board.move(red.id, to);
        moves.push({ id: red.id, from: { x: at.x, y: at.y }, to });
        steps.push({ at: to, moves: moves.length });
      }
      board.undo(origin);
      const step = steps.filter((s) => !avoid.some((a) => intersects({ ...s.at, w: red.w, h: red.h }, a))).at(-1);
      if (!step) continue;
      const end = step.at;
      const solution = simplifyOn(board, moves.slice(0, step.moves));
      const distance = Math.abs(end.x - red.x) + Math.abs(end.y - red.y);
      if (!best || distance > best.distance || (distance === best.distance && solution.length < best.solution.length)) {
        best = { id: red.id, target: end, solution, distance };
      }
    }
  }
  if (!best) return null;
  const { distance: _, ...goal } = best;
  return goal;
}
