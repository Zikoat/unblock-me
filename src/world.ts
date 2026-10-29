import type { Point, Rect } from "./camera";

/** A block on the lattice, in lattice units: 2x1 slides horizontally, 1x2 vertically. */
export type Block = { id: string; x: number; y: number; w: number; h: number; moved: boolean; tapped: boolean };

/** World units per lattice cell. */
export const UNIT = 60;
/** The lattice is cut into chunks of CHUNK x CHUNK cells; each chunk holds at most one
 * block, inside the chunk, so generated blocks never overlap. */
export const CHUNK = 3;
const FILL = 0.7; // share of chunks that get a block
const SEED = 0x5eed;
/** How far (in cells) a drag looks for blocks in the way. */
const REACH = 200;

/** mulberry32, seeded per chunk so a chunk's block is the same every time it is seen. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neighbouring chunks must get unrelated seeds, so the coordinates go through murmur3's
 * finalizer; mulberry32 alone keeps nearby seeds correlated. */
function chunkSeed(cx: number, cy: number): number {
  let h = Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cy, 0x165667b1) ^ SEED;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/** The block a chunk generates, ignoring any move; null for an empty chunk. */
export function generated(cx: number, cy: number): Block | null {
  const next = random(chunkSeed(cx, cy));
  if (next() >= FILL) return null;
  const horizontal = next() < 0.5;
  const w = horizontal ? 2 : 1;
  const h = horizontal ? 1 : 2;
  return {
    id: `${cx},${cy}`,
    x: cx * CHUNK + Math.floor(next() * (CHUNK - w + 1)),
    y: cy * CHUNK + Math.floor(next() * (CHUNK - h + 1)),
    w,
    h,
    moved: false,
    tapped: false,
  };
}

function home(id: string): Block {
  const [cx, cy] = id.split(",").map(Number) as [number, number];
  return generated(cx, cy)!;
}

const intersects = (b: Block, r: Rect) => b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y;

/**
 * Every block at least partly inside `area` (lattice units), nothing else: only the chunks
 * under the area are generated, plus the moved blocks, which live wherever they were
 * dropped. Moved blocks come last so they draw on top.
 */
export function blocksIn(area: Rect, moved: ReadonlyMap<string, Point>, tapped: ReadonlySet<string> = new Set()): Block[] {
  const found: Block[] = [];
  for (let cx = Math.floor(area.x / CHUNK); cx <= Math.floor((area.x + area.width) / CHUNK); cx++) {
    for (let cy = Math.floor(area.y / CHUNK); cy <= Math.floor((area.y + area.height) / CHUNK); cy++) {
      const block = generated(cx, cy);
      if (block && !moved.has(block.id) && intersects(block, area)) found.push({ ...block, tapped: tapped.has(block.id) });
    }
  }
  for (const [id, at] of moved) {
    const block = { ...home(id), ...at, moved: true, tapped: tapped.has(id) };
    if (intersects(block, area)) found.push(block);
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

/** The lowest and highest position the block can slide to along its long axis before it
 * hits another block (or the search reach). */
export function slideRange(block: Block, moved: ReadonlyMap<string, Point>): { lo: number; hi: number } {
  const horizontal = block.w > block.h;
  const lane = horizontal
    ? { x: block.x - REACH, y: block.y, width: 2 * REACH + block.w, height: block.h }
    : { x: block.x, y: block.y - REACH, width: block.w, height: 2 * REACH + block.h };
  const pos = horizontal ? block.x : block.y;
  const size = horizontal ? block.w : block.h;
  let lo = pos - REACH;
  let hi = pos + REACH;
  for (const other of blocksIn(lane, moved)) {
    if (other.id === block.id) continue;
    const start = horizontal ? other.x : other.y;
    const end = start + (horizontal ? other.w : other.h);
    if (end <= pos) lo = Math.max(lo, end);
    else if (start >= pos + size) hi = Math.min(hi, start - size);
  }
  return { lo, hi };
}
