import type { Point, Rect } from "./camera";
import { intersects, type Block, type Layout } from "./layout";

/** The changes made by playing: moved blocks, id -> lattice position. */
export type Changes = { moved: ReadonlyMap<string, Point> };
export const NO_CHANGES: Changes = { moved: new Map() };

/** One block slid from one lattice position to another. */
export type Move = { id: string; from: Point; to: Point };

/** How far (in cells) a drag looks for blocks in the way. */
export const REACH = 200;

/**
 * Every block at least partly inside `area` (lattice units), where it is now: the layout's
 * blocks that were not moved, plus the moved blocks, which live wherever they were
 * dropped. Moved blocks come last so they draw on top.
 */
export function blocksIn(layout: Layout, area: Rect, changes: Changes): Block[] {
  const found: Block[] = [];
  for (const b of layout.blocksIn(area)) {
    if (!changes.moved.has(b.id)) found.push(b);
  }
  for (const [id, at] of changes.moved) {
    const home = layout.byId(id);
    if (!home) continue;
    const b = { ...home, ...at, moved: true };
    if (intersects(b, area)) found.push(b);
  }
  return found;
}

/** The topmost block under a point in lattice units. */
export function blockAt(blocks: Block[], at: Point): Block | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (at.x >= b.x && at.x < b.x + b.w && at.y >= b.y && at.y < b.y + b.h) return b;
  }
  return null;
}

export const isHorizontal = (b: Block) => b.w > b.h;
/** A block's position along the axis it slides on. */
export const position = (b: Block) => (isHorizontal(b) ? b.x : b.y);

export type Slide = {
  /** The lowest and highest position the block can slide to. */
  lo: number;
  hi: number;
  /** The nearest block in the lane on each side, which stops the slide; null when nothing
   * is within reach. */
  before: Block | null;
  after: Block | null;
};

/** How far a block can slide along its long axis, and what stops it. */
export function slide(layout: Layout, block: Block, changes: Changes): Slide {
  const horizontal = isHorizontal(block);
  const lane = horizontal
    ? { x: block.x - REACH, y: block.y, width: 2 * REACH + block.w, height: block.h }
    : { x: block.x, y: block.y - REACH, width: block.w, height: 2 * REACH + block.h };
  const pos = position(block);
  const size = horizontal ? block.w : block.h;
  const result: Slide = { lo: pos - REACH, hi: pos + REACH, before: null, after: null };
  for (const other of blocksIn(layout, lane, changes)) {
    if (other.id === block.id) continue;
    const start = horizontal ? other.x : other.y;
    const end = start + (horizontal ? other.w : other.h);
    if (end <= pos && end > result.lo) {
      result.lo = end;
      result.before = other;
    } else if (start >= pos + size && start - size < result.hi) {
      result.hi = start - size;
      result.after = other;
    }
  }
  return result;
}

/** The lowest and highest position the block can slide to. */
export function slideRange(layout: Layout, block: Block, changes: Changes): { lo: number; hi: number } {
  const { lo, hi } = slide(layout, block, changes);
  return { lo, hi };
}
