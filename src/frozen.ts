// Jams (blocks that can never move), clearing a cell with legal slides, and replaying moves.
import type { Rect } from "./camera";
import type { Block, Layout, Placed } from "./layout";
import { blocksIn, NO_CHANGES, position, slide, type Changes, type Move } from "./rules";

export type { Move };

/** Walls and UI blocks never move, so they stop a block for good. */
const fixed = (b: Block) => b.wall || b.ui !== null;

type Stuck = { block: Block; stoppers: [Block, Block] };

/** The sliding blocks in `area` that cannot move either way, with the two blocks touching
 * their ends. */
function stuckBlocks(layout: Layout, area: Rect, changes: Changes): Map<string, Stuck> {
  const stuck = new Map<string, Stuck>();
  for (const b of blocksIn(layout, area, changes)) {
    if (fixed(b)) continue;
    const s = slide(layout, b, changes);
    if (s.before && s.after && s.lo === position(b) && s.hi === position(b)) {
      stuck.set(b.id, { block: b, stoppers: [s.before, s.after] });
    }
  }
  return stuck;
}

/**
 * The blocks in `area` that can never move, however the other blocks are moved: each is
 * stuck, and both blocks touching its ends are walls, UI blocks or frozen themselves.
 * Starts from every stuck block and drops, until nothing changes, those with a stopper
 * that might move. Blocks outside `area` count as movable.
 */
export function frozen(layout: Layout, area: Rect, changes: Changes = NO_CHANGES): Set<string> {
  const stuck = stuckBlocks(layout, area, changes);
  const set = new Set(stuck.keys());
  for (let changed = true; changed; ) {
    changed = false;
    for (const id of set) {
      if (stuck.get(id)!.stoppers.some((s) => !fixed(s) && !set.has(s.id))) {
        set.delete(id);
        changed = true;
      }
    }
  }
  return set;
}

type Cell = { x: number; y: number };
type Moved = Map<string, Cell>;

/**
 * Empty `cell` with legal slides, starting from the board `moved` describes, without
 * moving any block in `keep`. Works back from the cell: the block in it has to slide out of
 * the way, which may need others out of its way first, and a block moved out of the way must
 * not end up in a cell that is needed. Tries short plans first (at most `maxMoves`) and each
 * block's nearest positions first. On success the moves are applied to `moved` and
 * returned; on failure `moved` is left as it was and the result is null.
 */
export function clearCell(
  layout: Layout,
  moved: Moved,
  cell: Cell,
  keep: ReadonlySet<string>,
  { maxMoves = 12, reach = 8, budget = 200_000 } = {},
): Move[] | null {
  const changes: Changes = { moved };
  const original = new Map(moved);
  const plan: Move[] = [];
  let nodes = 0;
  const key = (x: number, y: number) => `${x},${y}`;
  const occupant = (x: number, y: number) => blocksIn(layout, { x, y, width: 1, height: 1 }, changes)[0] ?? null;
  const cellsOf = (b: { x: number; y: number; w: number; h: number }) => {
    const out: string[] = [];
    for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) out.push(key(x, y));
    return out;
  };
  const restore = (to: Moved) => {
    moved.clear();
    for (const [id, p] of to) moved.set(id, p);
  };

  /** Slide `block` so it covers none of `forbidden`, clearing its path first. */
  function vacate(block: Block, forbidden: Set<string>, busy: Set<string>, limit: number): boolean {
    if (fixed(block) || busy.has(block.id) || plan.length >= limit || ++nodes > budget) return false;
    const horizontal = block.w > block.h;
    const pos = position(block);
    const size = horizontal ? block.w : block.h;
    const at = (p: number) => (horizontal ? { ...block, x: p } : { ...block, y: p });
    const lane = (p: number) => (horizontal ? { x: p, y: block.y } : { x: block.x, y: p });
    for (let d = 1; d <= reach; d++) {
      for (const dir of [1, -1]) {
        const p = pos + dir * d;
        if (cellsOf(at(p)).some((c) => forbidden.has(c))) continue;
        // The cells the block sweeps into on its way, nearest first.
        const path: Cell[] = [];
        for (let i = 0; i < d; i++) path.push(lane(dir > 0 ? pos + size + i : pos - 1 - i));
        const before = { plan: plan.length, moved: new Map(moved) };
        const inner = new Set([...forbidden, ...path.map((c) => key(c.x, c.y))]);
        let clear = true;
        busy.add(block.id);
        for (const c of path) {
          const other = occupant(c.x, c.y);
          if (other && other.id !== block.id && !vacate(other, inner, busy, limit - 1)) {
            clear = false;
            break;
          }
        }
        busy.delete(block.id);
        if (clear && plan.length < limit) {
          moved.set(block.id, lane(p));
          plan.push({ id: block.id, from: { x: block.x, y: block.y }, to: lane(p) });
          return true;
        }
        plan.length = before.plan;
        restore(before.moved);
      }
    }
    return false;
  }

  const other = occupant(cell.x, cell.y);
  if (!other) return [];
  for (let limit = 1; limit <= maxMoves && nodes <= budget; limit++) {
    plan.length = 0;
    restore(original);
    if (vacate(other, new Set([key(cell.x, cell.y)]), new Set(keep), limit)) return [...plan];
  }
  restore(original);
  return null;
}

/** Play `moves` with the game's rules: each must be a legal slide when it is made. Returns
 * the changes, or null at the first illegal move. */
export function replay(layout: Layout, moves: Move[], start: ReadonlyMap<string, Cell> = new Map()): Changes | null {
  const moved = new Map(start);
  const changes: Changes = { moved };
  for (const m of moves) {
    const block = blocksIn(layout, { x: m.from.x, y: m.from.y, width: 1, height: 1 }, changes).find((b) => b.id === m.id);
    if (!block || fixed(block)) return null;
    const { lo, hi } = slide(layout, block, changes);
    const to = block.w > block.h ? m.to.x : m.to.y;
    if ((block.w > block.h ? m.to.y !== block.y : m.to.x !== block.x) || to < lo || to > hi) return null;
    moved.set(m.id, m.to);
  }
  return changes;
}
