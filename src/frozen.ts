// Jams: blocks that are stuck, what they wait on, and structures that can never move.
import type { Rect } from "./camera";
import type { Block, Layout, Placed } from "./layout";
import { blocksIn, NO_CHANGES, position, slide, type Changes } from "./rules";

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

/**
 * How deep each block in `area` is jammed: 0 if it can move now; for a stuck block, one
 * more than the shallower of the two blocks touching its ends, since it may come free once
 * one of them moves away. Infinity for frozen blocks. Blocks outside `area` count as 0.
 * Also returns, for each stuck block, the stopper to free first (the shallower one).
 */
export function lockDepths(layout: Layout, area: Rect, changes: Changes = NO_CHANGES) {
  const stuck = stuckBlocks(layout, area, changes);
  const depth = new Map<string, number>();
  for (const b of blocksIn(layout, area, changes)) if (!fixed(b)) depth.set(b.id, stuck.has(b.id) ? Infinity : 0);
  const of = (b: Block) => (fixed(b) ? Infinity : (depth.get(b.id) ?? 0));
  const next = new Map<string, Block>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, { stoppers }] of stuck) {
      const first = of(stoppers[0]) <= of(stoppers[1]) ? stoppers[0] : stoppers[1];
      const d = 1 + of(first);
      if (d < depth.get(id)!) {
        depth.set(id, d);
        next.set(id, first);
        changed = true;
      }
    }
  }
  return { depth, next };
}

/**
 * The smallest frozen structure that fits in a width x height grid: sliding blocks (2x1 or
 * 1x2) and 1x1 walls placed so that every sliding block touches something at both ends.
 * Smallest means fewest walls, then fewest cells. `minSliders` asks for at least that many
 * sliding blocks; with `chained`, every sliding block must be stopped by at least one other
 * sliding block, so the jam is held by blocks as well as walls. Returns null if none fits.
 */
export function smallestFrozen(
  width: number,
  height: number,
  { minSliders = 1, chained = false, maxWalls = 8 }: { minSliders?: number; chained?: boolean; maxWalls?: number } = {},
): Placed[] | null {
  // Each cell: 0 empty, 1 wall, 2 part of a sliding block. owner[] says which block.
  const cells = new Array<number>(width * height).fill(-1);
  const owner = new Array<number>(width * height).fill(-1);
  const blocks: Placed[] = [];
  let best: Placed[] | null = null;
  let bestScore = [Infinity, Infinity];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : cells[y * width + x]!);
  const ownerAt = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : owner[y * width + x]!);

  function done(walls: number, filled: number): void {
    const sliders = blocks.filter((b) => !b.wall);
    if (sliders.length < minSliders) return;
    for (const [i, b] of blocks.entries()) {
      if (b.wall) continue;
      const ends = b.w > b.h ? [[b.x - 1, b.y], [b.x + 2, b.y]] : [[b.x, b.y - 1], [b.x, b.y + 2]];
      if (ends.some(([x, y]) => at(x!, y!) <= 0)) return;
      if (chained && !ends.some(([x, y]) => { const o = ownerAt(x!, y!); return o >= 0 && o !== i && !blocks[o]!.wall; })) return;
    }
    const score = [walls, filled];
    if (score[0]! < bestScore[0]! || (score[0] === bestScore[0] && score[1]! < bestScore[1]!)) {
      bestScore = score;
      best = blocks.map((b) => ({ ...b }));
    }
  }

  function fill(i: number, walls: number, filled: number): void {
    if (walls > maxWalls || walls > bestScore[0]! || (walls === bestScore[0] && filled >= bestScore[1]!)) return;
    if (i === cells.length) return done(walls, filled);
    if (cells[i] !== -1) return fill(i + 1, walls, filled);
    const x = i % width;
    const y = Math.floor(i / width);
    // A sliding block's start end needs its neighbour decided as taken already.
    cells[i] = 0;
    fill(i + 1, walls, filled);
    cells[i] = 1;
    owner[i] = blocks.push({ x, y, w: 1, h: 1, wall: true }) - 1;
    fill(i + 1, walls + 1, filled + 1);
    blocks.pop();
    owner[i] = -1;
    if (x + 1 < width && cells[i + 1] === -1 && at(x - 1, y) > 0) {
      cells[i] = cells[i + 1] = 2;
      owner[i] = owner[i + 1] = blocks.push({ x, y, w: 2, h: 1 }) - 1;
      fill(i + 1, walls, filled + 2);
      blocks.pop();
      owner[i] = owner[i + 1] = -1;
      cells[i + 1] = -1;
    }
    if (y + 1 < height && at(x, y - 1) > 0) {
      cells[i] = cells[i + width] = 2;
      owner[i] = owner[i + width] = blocks.push({ x, y, w: 1, h: 2 }) - 1;
      fill(i + 1, walls, filled + 2);
      blocks.pop();
      owner[i] = owner[i + width] = -1;
      cells[i + width] = -1;
    }
    cells[i] = -1;
  }

  fill(0, 0, 0);
  return best;
}
