// Fixed goal-search benchmark cases: several densities, plus long sessions (hundreds of
// moved blocks made by random legal moves). Deterministic for the same name.
import type { Point, Rect } from "../../src/camera";
import { replay, type Move } from "../../src/frozen";
import { randomLayout, type Block, type Layout } from "../../src/layout";
import { blocksIn, slide } from "../../src/rules";

export type Case = {
  name: string;
  layout: Layout;
  near: Point;
  moved: Map<string, Point>;
  exclude: Set<string>;
  avoid: Rect[];
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random legal moves in a size x size area around `centre` until `count` blocks have moved. */
function session(layout: Layout, seed: number, count: number, centre: Point, size: number): Map<string, Point> {
  const next = rng(seed);
  const moved = new Map<string, Point>();
  const moves: Move[] = [];
  for (let n = 0; moved.size < count && n < count * 50; n++) {
    const x = centre.x - size / 2 + Math.floor(next() * size);
    const y = centre.y - size / 2 + Math.floor(next() * size);
    const b: Block | undefined = blocksIn(layout, { x, y, width: 1, height: 1 }, { moved })[0];
    if (!b || b.wall || b.ui) continue;
    const s = slide(layout, b, { moved });
    const h = b.w > b.h;
    const pos = h ? b.x : b.y;
    const lo = Math.max(s.lo, pos - 6), hi = Math.min(s.hi, pos + 6);
    if (hi <= lo) continue;
    let p = lo + Math.floor(next() * (hi - lo));
    if (p >= pos) p++;
    if (p > hi) continue;
    const to = h ? { x: p, y: b.y } : { x: b.x, y: p };
    moves.push({ id: b.id, from: { x: b.x, y: b.y }, to });
    moved.set(b.id, to);
  }
  if (!replay(layout, moves)) throw new Error("session not legal");
  return moved;
}

const plain = (name: string, seed: number, tries: number, near: Point): (() => Case) => () => ({
  name, layout: randomLayout(seed, { tries }), near, moved: new Map(), exclude: new Set(), avoid: [],
});

export const CASES: Record<string, () => Case> = {};
for (const tries of [7, 15, 25]) {
  for (const [seed, near] of [[5, { x: 0, y: 2 }], [11, { x: 37, y: -21 }], [23, { x: -80, y: 64 }]] as const) {
    CASES[`d${tries}-s${seed}`] = plain(`d${tries}-s${seed}`, seed, tries, near);
  }
}
for (const tries of [7, 15]) {
  const name = `long${tries}`;
  CASES[name] = () => {
    const layout = randomLayout(3, { tries });
    const moved = session(layout, 99, 400, { x: 10, y: 10 }, 70);
    return { name, layout, near: { x: 12, y: 8 }, moved, exclude: new Set(), avoid: [] };
  };
}
// Exclude/avoid in play: the nearest blocks are excluded, a band of targets avoided.
CASES["d15-excl"] = () => {
  const layout = randomLayout(5, { tries: 15 });
  const near = { x: 20, y: 20 };
  const exclude = new Set(blocksIn(layout, { x: 19, y: 19, width: 3, height: 3 }, { moved: new Map() }).map((b) => b.id));
  return { name: "d15-excl", layout, near, moved: new Map(), exclude, avoid: [{ x: 14, y: 14, width: 3, height: 12 }, { x: 24, y: 14, width: 3, height: 12 }] };
};
