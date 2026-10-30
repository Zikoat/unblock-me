// The push search on an indexed board (src/board.ts): push a block one cell at a time,
// clearing each next cell with a bounded backwards search, with optional prunings. Its
// work is counted in ticks (search nodes, plus a cost per cell pushed), not cells or time.
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
  /** Node budget per cell. */
  budget?: number;
  /** Ticks for all the pushes: the cap on their work, the same whatever the machine. Each
   * push gets an equal share of what the pushes before it left. */
  goalBudget?: number;
  /** Ticks a pushed cell costs on top of its search nodes (what it costs the caller, e.g.
   * measuring it as a candidate), so a push into open space stops too. */
  cellCost?: number;
  /** Count work for experiments. */
  stats?: { clears: number; fails: number; nodes: number; failNodes: number };
  /** Candidate red blocks tried, nearest first. */
  candidates?: number;
};

/** Empty `cell` with legal slides without moving blocks in `keep`, working back from the
 * cell (the block in it slides away, which may need others out of its way first); moves are
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

/** Fewer moves for the same end: a block's move is dropped and folded into its next move
 * whenever the whole sequence still plays legally (e.g. the red block steps once, a blocker
 * clears, the red block steps again: one red move after the blocker does). Replays only
 * from where a sequence changes, and goes on after a fold; passes repeat until one folds
 * nothing. */
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

/** Every candidate pushed both ways, each until a cell cannot be cleared or its share of
 * the ticks is spent: the raw shuffles, with where the red block was after each cell. The
 * board is left as it was. */
export function pushes(board: Board, layout: Layout, near: Point, { perCell = 4, exclude = new Set() }: GoalOptions = {}, tuning: Tuning = {}): Push[] {
  const candidates = candidatesNear(board, layout, near, exclude, tuning.candidates);
  const out: Push[] = [];
  const origin = board.mark();
  const spent = tuning.stats ?? { clears: 0, fails: 0, nodes: 0, failNodes: 0 };
  const { goalBudget = 50_000, cellCost = 1 } = tuning;
  let left = candidates.length * 2;
  for (const red of candidates) {
    for (const dir of [1, -1]) {
      const until = spent.nodes + (goalBudget - spent.nodes) / left--;
      const keep = new Set([red.id]);
      const moves: Move[] = [];
      const steps: { at: Point; moves: number }[] = [];
      while (spent.nodes + cellCost <= until) {
        spent.nodes += cellCost;
        const at = board.block(red.id);
        const ahead = isHorizontal(at)
          ? { x: dir > 0 ? at.x + at.w : at.x - 1, y: at.y }
          : { x: at.x, y: dir > 0 ? at.y + at.h : at.y - 1 };
        const plan = clearCellOn(board, ahead, keep, { maxMoves: perCell, budget: Math.min(tuning.budget ?? 200_000, Math.max(0, until - spent.nodes)), prune: tuning.prune, lookahead: tuning.lookahead, stats: spent });
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
