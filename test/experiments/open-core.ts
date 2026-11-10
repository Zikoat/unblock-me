// Exact goals in an open room (reports/open-gen.html): a room's blocks searched exactly while the
// world round them may move too, by two bounds that meet.
//
// R is a set of blocks (the room's, red first); every other block on the board is the world's.
//  - Upper bound (`framed`): only R moves, the world's blocks stay where they are and the board's
//    edge is a wall. Every solution found is legal wherever the room is placed, whatever lies
//    round it, so the real fewest is at most this one's and its least extra moves are reachable.
//  - Lower bound (`soft`): R moves exactly; a world block that could ever move (one with a free
//    cell, the board's edge, a cell of R, or another such block at an end of its lane) is "soft":
//    an R block may slide through it at one move more, after which it is gone for good; a world
//    block that can never move is a wall; past the board's edge every cell is free (R blocks may
//    slide out and back). Any real sequence of moves maps onto this one with no more moves: R's
//    moves stay as they are; when an R block sweeps a cell a world block had, that block has
//    moved at least once before (one move, here paid as the toll); every other move of the
//    world's is dropped. A real cell is never free when its soft cell is not, so every R move
//    stays legal.
// When both agree on the fewest and on the least and most extra moves over every shortest
// solution, they are exact in the endless world and on any board round the room: a real shortest
// solution then maps onto a soft one of the same length, so it moves no world block more than
// once (each such block counts 1 move, 0 extra) and its extra moves are R's, which the soft
// search bounds from both sides.
import { cellsAt, clone, type Grid, lockedSet, occupancy, solve, type Solve, span } from "./extra-gen-core";

/** A move: block index (into the board), from, to; with the world blocks it went through. */
export type SMove = [number, number, number, number[]];

export type Soft = {
  status: "ok" | "cap" | "unsolvable" | "shorter";
  fewest: number;
  extraMin: number;
  extraMax: number;
  states: number;
  /** World blocks a shortest solution may go through, on some shortest solution. */
  tolls: number;
  solution: SMove[];
};

/** World blocks that could ever move: a free cell, the edge, a cell of R or another such block
 * next to an end of their lane. */
export function softBlocks(g: Grid, inR: boolean[], occ = occupancy(g)): boolean[] {
  const soft = g.pieces.map((_, i) => inR[i]!);
  for (let changed = true; changed; ) {
    changed = false;
    g.pieces.forEach((p, i) => {
      if (soft[i]) return;
      const at = g.pos[i]!;
      const loose = (k: number) => {
        if (k < 0 || k > span(g, p)) return true;
        const o = occ[p.h ? p.lane * g.W + k : k * g.W + p.lane]!;
        return o === 0 || (o > 0 && soft[o - 1]!);
      };
      if (loose(at - 1) || loose(at + 2)) ((soft[i] = true), (changed = true));
    });
  }
  return soft.map((s, i) => s && !inR[i]);
}

class Table {
  arena: Uint8Array;
  depth: Uint8Array;
  table: Int32Array;
  count = 0;
  constructor(readonly n: number, size = 1 << 14) {
    this.arena = new Uint8Array(size * n);
    this.depth = new Uint8Array(size);
    this.table = new Int32Array(size * 2).fill(-1);
  }
  private hash(buf: Uint8Array, off: number) {
    let h = 2166136261;
    for (let k = 0; k < this.n; k++) h = Math.imul(h ^ buf[off + k]!, 16777619);
    return h >>> 0;
  }
  private same(i: number, buf: Uint8Array) {
    const o = i * this.n;
    for (let k = 0; k < this.n; k++) if (this.arena[o + k] !== buf[k]) return false;
    return true;
  }
  find(buf: Uint8Array): number {
    const mask = this.table.length - 1;
    for (let s = this.hash(buf, 0) & mask; ; s = (s + 1) & mask) {
      const i = this.table[s]!;
      if (i < 0) return -1;
      if (this.same(i, buf)) return i;
    }
  }
  add(buf: Uint8Array, depth: number): [number, boolean] {
    const mask = this.table.length - 1;
    let s = this.hash(buf, 0) & mask;
    for (; ; s = (s + 1) & mask) {
      const i = this.table[s]!;
      if (i < 0) break;
      if (this.same(i, buf)) return [i, false];
    }
    if (this.count === this.depth.length) {
      const size = this.depth.length * 2;
      const a = new Uint8Array(size * this.n); a.set(this.arena); this.arena = a;
      const d = new Uint8Array(size); d.set(this.depth); this.depth = d;
    }
    const i = this.count++;
    this.arena.set(buf, i * this.n);
    this.depth[i] = depth;
    this.table[s] = i;
    if (this.count * 2 > this.table.length) {
      this.table = new Int32Array(this.table.length * 2).fill(-1);
      const m2 = this.table.length - 1;
      for (let j = 0; j < this.count; j++) {
        let t = this.hash(this.arena, j * this.n) & m2;
        while (this.table[t]! >= 0) t = (t + 1) & m2;
        this.table[t] = j;
      }
    }
    return [i, true];
  }
}

/**
 * The soft lower bound: the fewest moves for R[0] to reach lane position `target`, R's blocks
 * moving exactly and the world's soft blocks gone at one move each the first time an R block
 * goes through them (see the top). Only states that could still finish within `bound` are kept
 * (red's move and one for each other block on the cells red must pass), so the result is exact
 * when the fewest is at most `bound` ("unsolvable" past it).
 */
export function solveSoft(g: Grid, R: number[], target: number, { bound = 20, cap = 1_500_000, atLeast = 0 } = {}): Soft {
  const inR = g.pieces.map(() => false);
  R.forEach((i) => (inR[i] = true));
  const occ = occupancy(g);
  const soft = softBlocks(g, inR, occ);
  // Walls and the world's blocks that can never move are fixed (-1); the soft ones are marked.
  const base = new Int16Array(g.W * g.H); // -1 fixed, 0 free, -(2 + t) soft block t
  for (let c = 0; c < base.length; c++) base[c] = occ[c] === -1 ? -1 : 0;
  g.pieces.forEach((p, i) => { if (!inR[i] && !soft[i]) cellsAt(g, p, g.pos[i]!).forEach((c) => (base[c] = -1)); });
  // The blocks of R that matter: red, and those whose reach along their lane (as far as a fixed
  // cell; soft blocks and R's own are no stop) shares a cell with the reach of one that does;
  // the others never touch them and stay where they are (fixed). Soft blocks no reach of
  // these meets are fixed too: nothing goes through them.
  const reachCells = (i: number) => {
    const p = g.pieces[i]!, at = g.pos[i]!, cs: number[] = [];
    const cell = (k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);
    cs.push(cell(at), cell(at + 1));
    for (let k = at - 1; k >= 0 && base[cell(k)] !== -1; k--) cs.push(cell(k));
    for (let k = at + 2; k <= span(g, p) && base[cell(k)] !== -1; k++) cs.push(cell(k));
    return cs;
  };
  const reach = new Map(R.map((i) => [i, reachCells(i)] as const));
  const byCell = new Map<number, number[]>();
  for (const [i, cs] of reach) for (const c of cs) (byCell.get(c) ?? byCell.set(c, []).get(c)!).push(i);
  const matter = new Set([R[0]!]), queue = [R[0]!];
  while (queue.length) for (const c of reach.get(queue.pop()!)!) for (const j of byCell.get(c)!) if (!matter.has(j)) (matter.add(j), queue.push(j));
  for (const i of R) if (!matter.has(i)) cellsAt(g, g.pieces[i]!, g.pos[i]!).forEach((c) => (base[c] = -1));
  R = R.filter((i) => matter.has(i));
  const touched = new Uint8Array(g.W * g.H);
  for (const i of R) for (const c of reach.get(i)!) touched[c] = 1;
  const T: number[] = [];
  g.pieces.forEach((p, i) => {
    if (inR[i] || !soft[i]) return;
    const cs = cellsAt(g, p, g.pos[i]!);
    if (!cs.some((c) => touched[c])) return cs.forEach((c) => (base[c] = -1));
    cs.forEach((c) => (base[c] = -(2 + T.length)));
    T.push(i);
  });
  const n = R.length, off = 2, tb = Math.ceil(T.length / 8), size = n + tb;
  const ps = R.map((i) => g.pieces[i]!), spans = ps.map((p) => span(g, p));
  const inLane = (k: number, j: number) => j >= 0 && j <= spans[k]!;
  const cellOf = (k: number, j: number) => (ps[k]!.h ? ps[k]!.lane * g.W + j : j * g.W + ps[k]!.lane);
  const st = new Table(size);
  const cur = new Uint8Array(size);
  R.forEach((i, k) => (cur[k] = g.pos[i]! + off));
  const tgt = target + off;
  const fail = (status: Soft["status"], states: number): Soft => ({ status, fewest: -1, extraMin: -1, extraMax: -1, states, tolls: 0, solution: [] });
  if (cur[0] === tgt) return { status: "ok", fewest: 0, extraMin: 0, extraMax: 0, states: 1, tolls: 0, solution: [] };
  const grid = new Int16Array(g.W * g.H);
  const load = (i: number) => {
    grid.set(base);
    const o = i * size;
    for (let b = 0; b < size; b++) cur[b] = st.arena[o + b]!;
    for (let t = 0; t < T.length; t++) if (cur[n + (t >> 3)]! & (1 << (t & 7))) for (const c of cellsAt(g, g.pieces[T[t]!]!, g.pos[T[t]!]!)) grid[c] = 0;
    for (let k = 0; k < n; k++) {
      const at = cur[k]! - off;
      if (inLane(k, at)) grid[cellOf(k, at)] = k + 1;
      if (inLane(k, at + 1)) grid[cellOf(k, at + 1)] = k + 1;
    }
  };
  // A lower bound on the moves left: red's, and one for each block on red's way (an R block
  // moves, a soft one is paid for); a wall in the way: never.
  const seen = new Int32Array(n + T.length + 2);
  let stamp = 0;
  const lower = (k: number, to: number, gone: number[]) => {
    const r = (k === 0 ? to : cur[0]!) - off, t = target;
    if (r === t) return 0;
    const lo = t > r ? r + 2 : t, hi = t > r ? t + 1 : r - 1;
    const kAt = to - off;
    stamp++;
    let count = 1;
    for (let j = lo; j <= hi; j++) {
      if (!inLane(0, j)) continue;
      const c = cellOf(0, j);
      let o = grid[c]!;
      if (k !== 0) {
        if (o === k + 1) o = 0;
        if ((inLane(k, kAt) && cellOf(k, kAt) === c) || (inLane(k, kAt + 1) && cellOf(k, kAt + 1) === c)) o = k + 1;
      }
      if (o < -1 && gone.includes(-o - 2)) o = 0;
      if (o === -1) return 99;
      const id = o > 0 ? o : o < -1 ? n + 1 + (-o - 2) : 0;
      if (id > 1 && seen[id] !== stamp) ((seen[id] = stamp), count++);
    }
    return count;
  };
  /** Every slide from the loaded state: f(k, to, the soft blocks it goes through). */
  const slides = (f: (k: number, to: number, gone: number[]) => void) => {
    for (let k = 0; k < n; k++) {
      const at = cur[k]! - off;
      for (const dir of [-1, 1]) {
        const gone: number[] = [];
        for (let j = at + dir; dir < 0 ? j >= -2 : j <= spans[k]! + 1; j += dir) {
          const lead = dir < 0 ? j : j + 1;
          if (inLane(k, lead)) {
            const o = grid[cellOf(k, lead)]!;
            if (o === -1 || o > 0) break;
            if (o < -1 && !gone.includes(-o - 2)) gone.push(-o - 2);
          }
          f(k, j + off, gone);
        }
      }
    }
  };
  const next = new Uint8Array(size);
  const make = (k: number, to: number, gone: number[]) => {
    next.set(cur);
    next[k] = to;
    for (const t of gone) next[n + (t >> 3)]! |= 1 << (t & 7);
  };
  st.add(cur, 0);
  const buckets: number[][] = Array.from({ length: bound + 2 }, () => []);
  buckets[0]!.push(0);
  let fewest = -1, early = -1;
  for (let c = 0; c <= bound && fewest < 0; c++) {
    for (const s of buckets[c]!) {
      if (st.depth[s] !== c) continue;
      if (st.arena[s * size] === tgt) { fewest = c; break; }
      load(s);
      slides((k, to, gone) => {
        const d = c + 1 + gone.length;
        if (d + lower(k, to, gone) > bound) return;
        make(k, to, gone);
        if (k === 0 && to === tgt && d < atLeast) early = d;
        const [i, fresh] = st.add(next, d);
        if (fresh || d < st.depth[i]!) ((st.depth[i] = d), buckets[d]!.push(i));
      });
      if (early >= 0) return { ...fail("shorter", st.count), fewest: early };
      if (st.count > cap) return fail("cap", st.count);
    }
  }
  if (fewest < 0) return fail("unsolvable", st.count);
  if (fewest < atLeast) return { ...fail("shorter", st.count), fewest };
  // Tight edges (s -> t with depth[s] + cost = depth[t] <= fewest), then those on a shortest
  // solution (back from the goals), then the blocks of R moved, forward over them.
  const goals: number[] = [];
  for (let i = 0; i < st.count; i++) if (st.depth[i] === fewest && st.arena[i * size] === tgt) goals.push(i);
  const into: [number, number, number][][] = Array.from({ length: st.count }, () => []);
  const probe = new Uint8Array(size);
  for (let s = 0; s < st.count; s++) {
    const ds = st.depth[s]!;
    if (ds >= fewest || st.arena[s * size] === tgt) continue;
    load(s);
    slides((k, to, gone) => {
      const d = ds + 1 + gone.length;
      if (d > fewest) return;
      make(k, to, gone);
      probe.set(next);
      const t = st.find(probe);
      if (t >= 0 && st.depth[t] === d) into[t]!.push([s, k, gone.length]);
    });
  }
  const on = new Uint8Array(st.count);
  const stack = [...goals];
  goals.forEach((i) => (on[i] = 1));
  while (stack.length) for (const [s] of into[stack.pop()!]!) if (!on[s]) ((on[s] = 1), stack.push(s));
  const order = [...on.keys()].filter((i) => on[i]).sort((a, b) => st.depth[a]! - st.depth[b]!);
  const masks = new Map<number, Set<number>>([[0, new Set([0])]]);
  let tolls = 0;
  let budget = 3_000_000;
  for (const t of order) {
    if (t === 0) continue;
    const set = new Set<number>();
    for (const [s, k, g2] of into[t]!) {
      if (!on[s]) continue;
      if (g2) tolls++;
      for (const m of masks.get(s) ?? []) set.add((m | (1 << k)) >>> 0);
      budget -= set.size;
    }
    masks.set(t, set);
    if (budget < 0) break;
  }
  let extraMin = Infinity, extraMax = -Infinity;
  const pop = (x: number) => { let c = 0; for (; x; x &= x - 1) c++; return c; };
  for (const t of goals) {
    let gone = 0;
    for (let b = n; b < size; b++) gone += pop(st.arena[t * size + b]!);
    for (const m of masks.get(t) ?? []) {
      const e = fewest - gone - pop(m);
      extraMin = Math.min(extraMin, e);
      extraMax = Math.max(extraMax, e);
    }
  }
  // One shortest solution, back from the first goal along tight edges.
  const solution: SMove[] = [];
  for (let t = goals[0]!; t !== 0; ) {
    const [s, k] = into[t]!.find(([s]) => on[s])!;
    const from = st.arena[s * size + k]! - off, to = st.arena[t * size + k]! - off;
    const went: number[] = [];
    for (let x = 0; x < T.length; x++) {
      const bit = (a: number) => st.arena[a * size + n + (x >> 3)]! & (1 << (x & 7));
      if (bit(t) && !bit(s)) went.push(T[x]!);
    }
    solution.unshift([R[k]!, from, to, went]);
    t = s;
  }
  if (budget < 0) return { status: "cap", fewest, extraMin: -1, extraMax: -1, states: st.count, tolls, solution };
  return { status: "ok", fewest, extraMin, extraMax, states: st.count, tolls, solution };
}

/** The upper bound: R alone moving, every other block a wall, the board's edge a wall. */
export function solveFramed(g: Grid, R: number[], target: number, opts: { cap?: number; maxDepth?: number; bound?: number } = {}): Solve {
  const x: Grid = { W: g.W, H: g.H, wall: g.wall.slice(), pieces: [], pos: [] };
  g.pieces.forEach((p, i) => { if (!R.includes(i)) for (const c of cellsAt(g, p, g.pos[i]!)) x.wall[c] = 1; });
  for (const i of R) (x.pieces.push(g.pieces[i]!), x.pos.push(g.pos[i]!));
  const s = solve(x, 0, target, { edge: "wall", ...opts });
  s.solution = s.solution.map(([k, a, b]) => [R[k]!, a, b]);
  return s;
}

/** Both bounds on R's goal; exact when they agree. `bound`: look no further than this many
 * moves (exact for any goal that short). */
export function checkOpen(g: Grid, R: number[], target: number, cap = 1_500_000, bound = Infinity) {
  const up = solveFramed(g, R, target, { cap, bound, maxDepth: Math.min(60, bound + 1) });
  const low = up.status === "ok" ? solveSoft(g, R, target, { bound: up.fewest, cap, atLeast: up.fewest }) : null;
  const exact = !!low && low.status === "ok" && low.fewest === up.fewest && low.extraMin === up.extraMin && low.extraMax === up.extraMax;
  return { up, low, exact };
}

export { clone, lockedSet };
