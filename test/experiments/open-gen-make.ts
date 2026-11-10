// Rooms with real extra moves whose edge is open (reports/open-gen.html), on open-core.ts's two
// bounds: the room's blocks (R) searched exactly with the world round them frozen (an upper
// bound) and with the world's blocks able to give way at a move each and anything past the board
// (a lower bound); a goal is kept only when they agree, so its fewest and extra moves hold in the
// endless world and on any board round the room, whatever its blocks do. Nothing seals the room:
// its edge blocks and the world's round it may move, as long as that never makes a shorter way.
//
// makeOpenUp: a library room (walled squares searched whole, extra-moves.ts) in the world inside
// a ring of walls, each wall then taken away or swapped for a block that can move, kept only if
// the bounds still agree. (Two other ways were tried and dropped: annealing a room from empty
// against the lower bound, and a ring of blocks round a library room annealed alone; neither
// reached 10 moves with both bounds agreeing in 30 to 150 s, see the report.)
import { bestGoal, cellsAt, clone, type Grid, occupancy, type Piece, randomRoom, rng, span } from "./extra-gen-core";
import { readFileSync } from "node:fs";
import { checkOpen } from "./open-core";
import { randomLayout, TRIES, WALLS } from "../../src/layout";

export type Want = { lo: number; hi: number; extra: number };
export const WANT: Want = { lo: 10, hi: 16, extra: 3 };

export type Made = {
  ok: boolean;
  ms: number;
  /** The window: the room at (margin, margin), the world round it. */
  g: Grid;
  size: number;
  margin: number;
  /** R: the room's blocks (indices into g), red first. */
  R: number[];
  red: number;
  target: number;
  fewest: number;
  extra: number;
  extraMax: number;
  /** States of the two searches, and the evaluations made. */
  states: { up: number; low: number };
  evals: number;
  open: ReturnType<typeof openness>;
  /** The world seed, and walls in the room. */
  world: number;
  walls: number;
  /** Each step kept: its time (ms from the start) and the edge then. */
  trace?: { ms: number; open: ReturnType<typeof openness> }[];
};

/** The window with the room's blocks in it, and R. */
export function compose(world: Grid, room: Grid, m: number) {
  const g = clone(world);
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) if (room.wall[y * room.W + x]) g.wall[(y + m) * g.W + x + m] = 1;
  const R: number[] = [];
  room.pieces.forEach((p, i) => {
    R.push(g.pieces.length);
    g.pieces.push({ h: p.h, lane: p.lane + m });
    g.pos.push(room.pos[i]! + m);
  });
  return { g, R };
}

/** Whether a block at `at` has a legal slide on `occ`. */
export function canMove(g: Grid, p: Piece, at: number, occ: Int16Array, wildEdge = false) {
  const cell = (k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);
  const ok = (k: number) => (k < 0 || k > span(g, p) ? wildEdge : occ[cell(k)] === 0);
  return ok(at - 1) || ok(at + 2);
}

/** The room in a window of the world: `m` cells of the world's blocks (randomLayout at the
 * game's density and walls) all round it, no ring; a world block that would overlap the room is
 * left out. The room's cells at (m, m). */
export function placeInWorld(room: Grid, m: number, seed: number, density = TRIES, walls = WALLS) {
  const W = room.W + 2 * m, H = room.H + 2 * m;
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  const inRoom = (x: number, y: number) => x >= m && y >= m && x < m + room.W && y < m + room.H;
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) if (room.wall[y * room.W + x]) g.wall[(y + m) * W + x + m] = 1;
  room.pieces.forEach((p, i) => (g.pieces.push({ h: p.h, lane: p.lane + m }), g.pos.push(room.pos[i]! + m)));
  const ox = 4000 + (seed % 997) * 24, oy = 4000 + Math.floor(seed / 997) * 24;
  const layout = randomLayout(seed, { tries: density, walls });
  const occ = occupancy(g);
  for (const b of layout.blocksIn({ x: ox, y: oy, width: W, height: H })) {
    if (b.ui) continue;
    const x = b.x - ox, y = b.y - oy;
    if (x < 0 || y < 0 || x + b.w > W || y + b.h > H) continue;
    const cells: number[] = [];
    let clash = false;
    for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) ((clash ||= inRoom(x + i, y + j)), cells.push((y + j) * W + x + i));
    if (clash || cells.some((c) => occ[c] !== 0)) continue;
    if (b.wall) ((g.wall[cells[0]!] = 1), (occ[cells[0]!] = -1));
    else {
      const h = b.w > b.h;
      g.pieces.push({ h, lane: h ? y : x });
      g.pos.push(h ? x : y);
      cells.forEach((c) => (occ[c] = g.pieces.length));
    }
  }
  return g;
}

/**
 * Edge openness as the player sees it, on a board `g` with the room at the rectangle (rx, ry,
 * rw, rh): the blocks on the room's boundary (a cell on its outer row or column) and those in
 * the ring just outside it (a cell 1 step outside, diagonals too), how many of each have a legal
 * move at the start, and the walls on those cells; and the same share over every block on the
 * board for comparison.
 */
export function openness(g: Grid, rx: number, ry: number, rw: number, rh: number) {
  const occ = occupancy(g);
  const zone = (c: number) => {
    const x = c % g.W, y = Math.floor(c / g.W);
    const inside = x >= rx && y >= ry && x < rx + rw && y < ry + rh;
    if (inside) return x === rx || y === ry || x === rx + rw - 1 || y === ry + rh - 1 ? "boundary" : "inner";
    return x >= rx - 1 && y >= ry - 1 && x <= rx + rw && y <= ry + rh ? "ring" : "far";
  };
  const r = { boundary: { blocks: 0, movable: 0, walls: 0 }, ring: { blocks: 0, movable: 0, walls: 0 }, all: { blocks: 0, movable: 0 } };
  for (let c = 0; c < occ.length; c++) if (g.wall[c]) { const z = zone(c); if (z === "boundary" || z === "ring") r[z].walls++; }
  g.pieces.forEach((p, i) => {
    const mv = canMove(g, p, g.pos[i]!, occ, false);
    r.all.blocks++;
    if (mv) r.all.movable++;
    const zs = new Set(cellsAt(g, p, g.pos[i]!).map(zone));
    for (const z of ["boundary", "ring"] as const) if (zs.has(z)) ((r[z].blocks++), mv && r[z].movable++);
  });
  return r;
}


/** A room of extra-moves.ts's library (walled squares searched whole, every goal's fewest and
 * extra moves exact on the square). */
export type Lib = { size: string; walls: number[]; pieces: Piece[]; pos: number[]; red: number; target: number; fewest: number; extra: { least: number; most: number } };
export function library(): Lib[] {
  return ["6x6", "7x7", "7x7-dense"].flatMap((f) => readFileSync(`data/extra/${f}.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Lib));
}

/**
 * Open: a library room in the world with a ring of walls round it (exact: the walls seal it),
 * then each ring wall in turn, in a random order, taken away or swapped for a block that can move,
 * whichever leaves more of the ring's and the world's blocks round it free to move, each kept
 * only if the two bounds still agree at the library's fewest with at least `want.extra` extra
 * moves; a wall that won't go is tried as a block along the ring (over it and a ring neighbour
 * still a wall), and else stays. The ring's blocks are the room's (R); the world round it is
 * the world's (soft).
 */
export function makeOpenUp(lib: Lib, seed: number, budget: number, want: Want = WANT, { margin = 3, cap = 400_000, side = "high" as "high" | "low" } = {}): Made {
  const t0 = performance.now(), deadline = t0 + budget;
  const next = rng(seed * 31337 + 7);
  const [C] = lib.size.split("x").map(Number) as [number];
  const S = C + 2, m = margin;
  const room: Grid = { W: S, H: S, wall: new Uint8Array(S * S), pieces: [], pos: [] };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (x === 0 || y === 0 || x === S - 1 || y === S - 1) room.wall[y * S + x] = 1;
  for (const c of lib.walls) room.wall[(Math.floor(c / C) + 1) * S + (c % C) + 1] = 1;
  const order = [lib.red, ...lib.pieces.keys()].filter((i, k) => k === 0 || i !== lib.red);
  for (const i of order) (room.pieces.push({ h: lib.pieces[i]!.h, lane: lib.pieces[i]!.lane + 1 }), room.pos.push(lib.pos[i]! + 1));
  const target = lib.target + 1;
  const w = placeInWorld(room, m, seed); // the world's blocks keep off the whole room, ring included
  const world: Grid = { ...w, pieces: w.pieces.slice(room.pieces.length), pos: w.pos.slice(room.pieces.length), wall: w.wall.slice() };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) world.wall[(y + m) * world.W + x + m] = 0;
  const share = (z: { blocks: number; movable: number }) => (z.blocks ? z.movable / z.blocks : 0);
  const look = (x: Grid) => {
    const { g, R } = compose(world, x, m);
    const o = openness(g, m, m, S, S);
    return { g, R, o, open: share(o.boundary) + share(o.ring) - 0.05 * (o.boundary.walls + o.ring.walls) };
  };
  let evals = 0, states = { up: 0, low: 0 };
  const okFor = (x: Grid) => {
    const { g, R } = compose(world, x, m);
    const c = checkOpen(g, R, target + m, cap, lib.fewest);
    evals++;
    if (!c.exact || c.low!.fewest !== lib.fewest) return null;
    const s = c.low!;
    if (side === "high" ? s.extraMin < want.extra : s.extraMax !== 0) return null;
    states = { up: c.up.states, low: s.states };
    return s;
  };
  const s0 = okFor(room);
  if (!s0) throw new Error("the walled room is not exact");
  let cur = room, best = s0;
  const trace: NonNullable<Made["trace"]> = [{ ms: Math.round(performance.now() - t0), open: look(room).o }];
  const ringCells = [...cur.wall.keys()].filter((c) => { const x = c % S, y = Math.floor(c / S); return cur.wall[c] && (x === 0 || y === 0 || x === S - 1 || y === S - 1); });
  const shuffle = <T,>(xs: T[]) => xs.map((c) => [c, next()] as const).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  const withBlock = (base: Grid, c: number, d: number, wallD: boolean) => {
    const x = clone(base);
    x.wall[c] = 0;
    if (wallD) x.wall[d] = 0;
    const a = Math.min(c, d), h = Math.abs(d - c) === 1;
    x.pieces.push(h ? { h: true, lane: Math.floor(a / S) } : { h: false, lane: a % S });
    x.pos.push(h ? a % S : Math.floor(a / S));
    return x;
  };
  for (let pass = 0; pass < 2; pass++) for (const c of shuffle(ringCells)) {
    if (performance.now() > deadline) break;
    if (!cur.wall[c]) continue;
    const cx = c % S, cy = Math.floor(c / S);
    const tries: Grid[] = [];
    const plain = clone(cur);
    plain.wall[c] = 0;
    tries.push(plain);
    // A block over it and an inner neighbour that is free, or along the ring over a neighbour wall.
    const outside = occupancy(compose(world, cur, m).g);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= S || y >= S) {
        // Sticking out into the world, over a free cell of it.
        if (outside[(y + m) * world.W + x + m] !== 0) continue;
        const z = clone(cur);
        z.wall[c] = 0;
        const h = dy === 0;
        z.pieces.push(h ? { h: true, lane: cy } : { h: false, lane: cx });
        z.pos.push(h ? Math.min(cx, x) : Math.min(cy, y));
        tries.push(z);
        continue;
      }
      const d = y * S + x;
      if (outside[(y + m) * world.W + x + m] === 0) tries.push(withBlock(cur, c, d, false));
      else if (cur.wall[d] && ringCells.includes(d) && pass === 1) tries.push(withBlock(cur, c, d, true));
    }
    const ranked = tries.map((x) => ({ x, open: look(x).open + 0.01 * next() })).sort((a, b) => b.open - a.open);
    for (const { x } of ranked) {
      if (performance.now() > deadline) break;
      const s = okFor(x);
      if (s) { cur = x; best = s; trace.push({ ms: Math.round(performance.now() - t0), open: look(x).o }); break; }
    }
  }
  const { g, R, o } = look(cur);
  return {
    ok: true, ms: performance.now() - t0, g, size: S, margin: m, R, red: R[0]!, target: target + m,
    fewest: best.fewest, extra: best.extraMin, extraMax: best.extraMax, states, evals, open: o, world: seed, walls: cur.wall.reduce((a, b) => a + b, 0), trace,
  };
}

/** A fresh room with no walls inside whose best goal needs exactly `aim` moves with no extra
 * moves on any shortest solution (or one with at least `extra`), as a library entry: random
 * size x size rooms searched whole (extra-gen-make.ts's A). */
export function freshRoom(size: number, side: "high" | "low", aim: number, seed: number, budget: number, extra = WANT.extra): Lib | null {
  const deadline = performance.now() + budget, next = rng(seed * 7919 + 29);
  const want = side === "low" ? { lo: aim, hi: aim, extra: 0 } : { lo: aim, hi: aim, extra };
  while (performance.now() < deadline) {
    const g = randomRoom(size, size, size === 6 ? 10 + Math.floor(next() * 5) : 13 + Math.floor(next() * 5), 0, next);
    const b = bestGoal(g, want.lo, want.hi, side, 150_000, aim, deadline);
    if (!b || b.fewest !== aim || (side === "low" ? b.extraMax !== 0 : b.extra < extra)) continue;
    return { size: `${size}x${size}`, walls: [], pieces: g.pieces, pos: g.pos, red: b.red, target: b.target, fewest: b.fewest, extra: { least: b.extra, most: b.extraMax } };
  }
  return null;
}
