import type { Rect } from "./camera";
import { ISLAND_KEEP_OUT, islandBlocks } from "./island";

/** A 1x1 control on the board: it never slides, a tap runs it. */
export type Ui = "home" | "reset" | "fullscreen" | "reports" | "density" | "border" | "upload" | "fps" | "testbed";

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
  /** On the island: only its own goals use it, never a generated one (src/island.ts). */
  island?: boolean;
};
export type Placed = { id?: string; x: number; y: number; w: number; h: number; ui?: Ui; wall?: boolean; island?: boolean };

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
  ({ id, x: p.x, y: p.y, w: p.w, h: p.h, ui: p.ui ?? null, wall: p.wall ?? false, moved: false, ...(p.island && { island: true }) });

/** Exactly these blocks and nothing else. */
export function fixedLayout(placed: Placed[]): Layout {
  const blocks = placed.map((p, i) => toBlock(p, p.id ?? String(i)));
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return {
    blocksIn: (area) => blocks.filter((b) => intersects(b, area)),
    byId: (id) => byId.get(id),
  };
}

/** The UI blocks in the middle of the random layout: the fullscreen block (where the
 * browser can go full screen); with the debug UI on, an empty row and the debug blocks in
 * a square-ish 3 by 3 below it (home and reset among them). */
export const GAME_UI: Placed[] = [
  { id: "fullscreen", x: 1, y: 0, w: 1, h: 1, ui: "fullscreen" },
];
export const DEBUG_UI: Placed[] = [
  { id: "density", x: -1, y: 2, w: 1, h: 1, ui: "density" },
  { id: "border", x: 0, y: 2, w: 1, h: 1, ui: "border" },
  { id: "upload", x: 1, y: 2, w: 1, h: 1, ui: "upload" },
  { id: "fps", x: -1, y: 3, w: 1, h: 1, ui: "fps" },
  { id: "reports", x: 0, y: 3, w: 1, h: 1, ui: "reports" },
  { id: "home", x: 1, y: 3, w: 1, h: 1, ui: "home" },
  { id: "reset", x: -1, y: 4, w: 1, h: 1, ui: "reset" },
  { id: "testbed", x: 0, y: 4, w: 1, h: 1, ui: "testbed" },
];
export const UI_BLOCKS: Placed[] = [...GAME_UI, ...DEBUG_UI];
/** `island`: the handcrafted squares right of the start (src/island.ts). */
export type UiShown = { debug?: boolean; fullscreen?: boolean; island?: boolean };
/** The UI blocks shown, and the area kept free round them (nothing is generated there): the
 * debug UI's rows and the gap between them, or the fullscreen block's cell, or none. */
export function uiBlocks({ debug = false, fullscreen = true }: UiShown): Placed[] {
  return [...(fullscreen ? GAME_UI : []), ...(debug ? DEBUG_UI : [])];
}
export const uiArea = ({ debug = false, fullscreen = true }: UiShown) => (debug ? { x: -1, y: 0, width: 3, height: 5 } : fullscreen ? { x: 1, y: 0, width: 1, height: 1 } : null);

/** The lattice is cut into chunks of CHUNK x CHUNK cells. Each chunk tries `tries` random
 * blocks and keeps those that fit, so blocks stay inside their chunk and never overlap.
 * More tries, denser board. */
export const CHUNK = 4;
export const TRIES = 12;
/** The range the density slider covers. */
export const MIN_TRIES = 1;
export const MAX_TRIES = 30;

/** Mixed into the seed for the walls' own random stream. */
const WALL_SALT = 0x5bd1e995;

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

/** Blocks everywhere, the same for the same seed, with the UI blocks in the middle. `walls`:
 * the share of cells that are walls (1x1, fixed), placed at random before the blocks from a
 * stream of their own, so with none the blocks are exactly as before and with some they are
 * the same draws minus those that would cover a wall. */
export function randomLayout(seed: number, { tries = TRIES, walls = 0, ...shown }: { tries?: number; walls?: number } & UiShown = {}): Layout {
  // The UI blocks and the island are fixed; the random blocks keep out of their areas.
  const ui = [...uiBlocks(shown), ...(shown.island ? islandBlocks() : [])].map((p) => toBlock(p, p.id!));
  const area = uiArea(shown), island = shown.island ? ISLAND_KEEP_OUT : [];
  const cache = new Map<string, Block[]>();

  function chunk(cx: number, cy: number): Block[] {
    const key = `${cx},${cy}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const next = random(chunkSeed(seed, cx, cy));
    const taken = new Set<string>();
    const blocks: Block[] = [];
    if (walls > 0) {
      const wall = random(chunkSeed(seed ^ WALL_SALT, cx, cy));
      for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) {
        for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
          if (wall() >= walls) continue;
          const candidate = toBlock({ x, y, w: 1, h: 1, wall: true }, `${cx},${cy},w${x - cx * CHUNK + CHUNK * (y - cy * CHUNK)}`);
          if ((area && intersects(candidate, area)) || island.some((r) => intersects(candidate, r))) continue;
          taken.add(`${x},${y}`);
          blocks.push(candidate);
        }
      }
    }
    for (let i = 0; i < tries; i++) {
      const horizontal = next() < 0.5;
      const w = horizontal ? 2 : 1;
      const h = horizontal ? 1 : 2;
      const x = cx * CHUNK + Math.floor(next() * (CHUNK - w + 1));
      const y = cy * CHUNK + Math.floor(next() * (CHUNK - h + 1));
      const cells = horizontal ? [`${x},${y}`, `${x + 1},${y}`] : [`${x},${y}`, `${x},${y + 1}`];
      const candidate = toBlock({ x, y, w, h }, `${cx},${cy},${i}`);
      if (cells.some((c) => taken.has(c)) || (area && intersects(candidate, area)) || island.some((r) => intersects(candidate, r))) continue;
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
