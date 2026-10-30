import type { Rect } from "./camera";

/** A 1x1 control on the board: it never slides, a tap runs it. */
export type Ui = "density" | "border" | "reset" | "fullscreen" | "reports";

/** A block on the lattice, in lattice units: 2x1 slides horizontally, 1x2 vertically.
 * UI blocks and walls never slide. */
export type Block = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ui: Ui | null;
  /** An immovable block that only blocks. */
  wall: boolean;
  moved: boolean;
  tapped: boolean;
};
export type Placed = { id?: string; x: number; y: number; w: number; h: number; ui?: Ui; wall?: boolean };

/** Where the blocks start. The app uses a random layout; tests place blocks exactly. */
export interface Layout {
  /** The blocks (at their start positions) that touch `area`, in lattice units. */
  blocksIn(area: Rect): Block[];
  /** A block by id, at its start position. */
  byId(id: string): Block | undefined;
}

/** World units per lattice cell. */
export const UNIT = 60;

export const intersects = (b: { x: number; y: number; w: number; h: number }, r: Rect) =>
  b.x < r.x + r.width && b.x + b.w > r.x && b.y < r.y + r.height && b.y + b.h > r.y;

const toBlock = (p: Placed, id: string): Block =>
  ({ id, x: p.x, y: p.y, w: p.w, h: p.h, ui: p.ui ?? null, wall: p.wall ?? false, moved: false, tapped: false });

/** Exactly these blocks and nothing else. */
export function fixedLayout(placed: Placed[]): Layout {
  const blocks = placed.map((p, i) => toBlock(p, p.id ?? String(i)));
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return {
    blocksIn: (area) => blocks.filter((b) => intersects(b, area)),
    byId: (id) => byId.get(id),
  };
}

/** The UI blocks in the middle of the random layout, left to right. */
export const UI_BLOCKS: Placed[] = [
  { id: "density", x: -2, y: 0, w: 1, h: 1, ui: "density" },
  { id: "border", x: -1, y: 0, w: 1, h: 1, ui: "border" },
  { id: "reset", x: 0, y: 0, w: 1, h: 1, ui: "reset" },
  { id: "fullscreen", x: 1, y: 0, w: 1, h: 1, ui: "fullscreen" },
  { id: "reports", x: 2, y: 0, w: 1, h: 1, ui: "reports" },
];
const UI_AREA = { x: -2, y: 0, width: UI_BLOCKS.length, height: 1 };

/** The lattice is cut into chunks of CHUNK x CHUNK cells. Each chunk tries `tries` random
 * blocks and keeps those that fit, so blocks stay inside their chunk and never overlap.
 * More tries, denser board. */
export const CHUNK = 4;
export const TRIES = 7;
/** The range the density slider covers. */
export const MIN_TRIES = 1;
export const MAX_TRIES = 30;

/** mulberry32. */
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
function chunkSeed(seed: number, cx: number, cy: number): number {
  let h = Math.imul(cx, 0x27d4eb2d) ^ Math.imul(cy, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/** Blocks everywhere, the same for the same seed, with the UI blocks in the middle. */
export function randomLayout(seed: number, { tries = TRIES }: { tries?: number } = {}): Layout {
  const ui = UI_BLOCKS.map((p) => toBlock(p, p.id!));
  const cache = new Map<string, Block[]>();

  function chunk(cx: number, cy: number): Block[] {
    const key = `${cx},${cy}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const next = random(chunkSeed(seed, cx, cy));
    const taken = new Set<string>();
    const blocks: Block[] = [];
    for (let i = 0; i < tries; i++) {
      const horizontal = next() < 0.5;
      const w = horizontal ? 2 : 1;
      const h = horizontal ? 1 : 2;
      const x = cx * CHUNK + Math.floor(next() * (CHUNK - w + 1));
      const y = cy * CHUNK + Math.floor(next() * (CHUNK - h + 1));
      const cells = horizontal ? [`${x},${y}`, `${x + 1},${y}`] : [`${x},${y}`, `${x},${y + 1}`];
      const candidate = toBlock({ x, y, w, h }, `${cx},${cy},${i}`);
      if (cells.some((c) => taken.has(c)) || intersects(candidate, UI_AREA)) continue;
      cells.forEach((c) => taken.add(c));
      blocks.push(candidate);
    }
    if (cache.size > 5000) cache.clear();
    cache.set(key, blocks);
    return blocks;
  }

  return {
    blocksIn(area) {
      const found = ui.filter((b) => intersects(b, area));
      for (let cx = Math.floor(area.x / CHUNK); cx <= Math.floor((area.x + area.width) / CHUNK); cx++) {
        for (let cy = Math.floor(area.y / CHUNK); cy <= Math.floor((area.y + area.height) / CHUNK); cy++) {
          for (const b of chunk(cx, cy)) if (intersects(b, area)) found.push(b);
        }
      }
      return found;
    },
    byId(id) {
      const control = ui.find((b) => b.id === id);
      if (control) return control;
      const [cx, cy] = id.split(",").map(Number) as [number, number];
      return chunk(cx, cy).find((b) => b.id === id);
    },
  };
}
