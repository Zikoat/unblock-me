// Jams (blocks that can never move), and replaying moves.
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
