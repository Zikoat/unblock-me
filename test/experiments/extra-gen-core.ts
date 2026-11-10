// Generating boards with real extra moves (reports/extra-gen.html): an exact solver for a
// bounded grid of 2x1 blocks and walls, and the two generators it serves, rooms opened up (A)
// and constructive placement by local search (B). Used by extra-gen.ts (the runs) and
// extra-gen-trials.ts (the trial boards).
//
// The solver is exact on its grid. Blocks that can never move (walls, and blocks locked
// against walls and each other along their lanes) are walls to it, and blocks whose reachable
// lane never meets a block that matters (red, and transitively those whose lanes meet) are left
// out: neither changes any solution. With `edge: "open"` the grid's edge is not a wall: a lane
// that reaches it runs on into the endless world, and if a block that matters has one the board
// is "unsealed" and not solved; a sealed board's fewest and extra moves hold in the endless
// world, whatever lies past the window.
import { randomLayout, TRIES, WALLS } from "../../src/layout";

/** A block, 2 cells long: horizontal (its row is `lane`) or vertical (its column). */
export type Piece = { h: boolean; lane: number };
/** A board: W x H cells, walls, blocks with their positions along their lanes. */
export type Grid = { W: number; H: number; wall: Uint8Array; pieces: Piece[]; pos: number[] };
export type Edge = "wall" | "open";

export const clone = (g: Grid): Grid => ({ W: g.W, H: g.H, wall: g.wall.slice(), pieces: g.pieces.map((p) => ({ ...p })), pos: [...g.pos] });
export const cellsAt = (g: Grid, p: Piece, at: number): [number, number] => (p.h ? [p.lane * g.W + at, p.lane * g.W + at + 1] : [at * g.W + p.lane, (at + 1) * g.W + p.lane]);
export const span = (g: Grid, p: Piece) => (p.h ? g.W : g.H) - 1;
/** The cell index of lane position k (a block at k covers k and k+1). */
const laneCell = (g: Grid, p: Piece, k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);

/** Each cell: 0 empty, -1 wall, i+1 block i. */
export function occupancy(g: Grid): Int16Array {
  const occ = new Int16Array(g.W * g.H);
  for (let c = 0; c < occ.length; c++) if (g.wall[c]) occ[c] = -1;
  g.pieces.forEach((p, i) => cellsAt(g, p, g.pos[i]!).forEach((c) => (occ[c] = i + 1)));
  return occ;
}

/** Blocks that can never move: the largest set each of whose blocks has, at both ends of its
 * lane, a wall, the edge (when it is a wall) or another block of the set. */
export function lockedSet(g: Grid, edge: Edge, occ = occupancy(g)): boolean[] {
  const locked = g.pieces.map(() => true);
  const blocked = (p: Piece, k: number) => {
    if (k < 0 || k > span(g, p)) return edge === "wall";
    const o = occ[laneCell(g, p, k)]!;
    return o === -1 || (o > 0 && locked[o - 1]!);
  };
  for (let changed = true; changed; ) {
    changed = false;
    g.pieces.forEach((p, i) => {
      if (!locked[i]) return;
      const at = g.pos[i]!;
      if (!blocked(p, at - 1) || !blocked(p, at + 2)) ((locked[i] = false), (changed = true));
    });
  }
  return locked;
}

export type Analysis = { locked: boolean[]; relevant: number[]; sealed: boolean; extent: [number, number][] };

/** Locked blocks, each free block's reach along its lane (walls and locked blocks stop it), and
 * the blocks that matter to `red`: red, and every free block whose reach shares a cell with the
 * reach of one that matters. */
export function analyse(g: Grid, red: number, edge: Edge, occ = occupancy(g)): Analysis {
  const locked = lockedSet(g, edge, occ);
  const stops = (c: number) => occ[c] === -1 || (occ[c]! > 0 && locked[occ[c]! - 1]!);
  const extent: [number, number][] = [];
  const open: boolean[] = [];
  g.pieces.forEach((p, i) => {
    if (locked[i]) return void extent.push([g.pos[i]!, g.pos[i]!]), void open.push(false);
    let lo = g.pos[i]!, hi = g.pos[i]!, o = false;
    for (; lo - 1 >= 0 && !stops(laneCell(g, p, lo - 1)); lo--);
    for (; hi + 2 <= span(g, p) && !stops(laneCell(g, p, hi + 2)); hi++);
    if ((lo === 0 && edge === "open") || (hi === span(g, p) - 1 && edge === "open")) o = true;
    extent.push([lo, hi]);
    open.push(o);
  });
  // Cells each free block can cover, and who covers each cell.
  const byCell = new Map<number, number[]>();
  g.pieces.forEach((p, i) => {
    if (locked[i]) return;
    const [lo, hi] = extent[i]!;
    for (let k = lo; k <= hi + 1; k++) {
      const c = laneCell(g, p, k);
      let l = byCell.get(c);
      if (!l) byCell.set(c, (l = []));
      l.push(i);
    }
  });
  // Blocks from past the window's edge (when it is open) can slide in along any lane that
  // crosses the edge, as far as the first wall or locked block.
  const phantom = new Uint8Array(g.W * g.H);
  if (edge === "open") {
    const run = (cells: number[]) => { for (const c of cells) { if (stops(c)) break; phantom[c] = 1; } };
    for (let y = 0; y < g.H; y++) {
      const row = Array.from({ length: g.W }, (_, x) => y * g.W + x);
      run(row); run(row.reverse());
    }
    for (let x = 0; x < g.W; x++) {
      const col = Array.from({ length: g.H }, (_, y) => y * g.W + x);
      run(col); run(col.reverse());
    }
  }
  const seen = new Set([red]), queue = [red];
  while (queue.length) {
    const i = queue.pop()!, p = g.pieces[i]!, [lo, hi] = extent[i]!;
    for (let k = lo; k <= hi + 1; k++) for (const j of byCell.get(laneCell(g, p, k)) ?? []) if (!seen.has(j)) (seen.add(j), queue.push(j));
  }
  const relevant = [red, ...[...seen].filter((i) => i !== red).sort((a, b) => a - b)];
  const reachesOut = (i: number) => {
    if (open[i]) return true;
    const [lo, hi] = extent[i]!;
    for (let k = lo; k <= hi + 1; k++) if (phantom[laneCell(g, g.pieces[i]!, k)]) return true;
    return false;
  };
  return { locked, relevant, sealed: edge === "wall" || !relevant.some(reachesOut), extent };
}

/** Breadth-first states of the blocks that matter, in a flat arena with an open-addressed
 * table; states in order of depth. */
class States {
  arena: Uint8Array;
  depth: Uint8Array;
  parent: Int32Array;
  table: Int32Array;
  count = 0;
  constructor(readonly n: number, size = 1 << 14) {
    this.arena = new Uint8Array(size * n);
    this.depth = new Uint8Array(size);
    this.parent = new Int32Array(size);
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
  /** The state's index, and whether it is new. */
  add(buf: Uint8Array, depth: number, parent: number): [number, boolean] {
    const mask = this.table.length - 1;
    let s = this.hash(buf, 0) & mask;
    for (; ; s = (s + 1) & mask) {
      const i = this.table[s]!;
      if (i < 0) break;
      if (this.same(i, buf)) return [i, false];
    }
    if (this.count === this.depth.length) this.grow();
    const i = this.count++;
    this.arena.set(buf, i * this.n);
    this.depth[i] = depth;
    this.parent[i] = parent;
    this.table[s] = i;
    if (this.count * 2 > this.table.length) this.rehash(this.table.length * 2);
    return [i, true];
  }
  private insertIndex(i: number) {
    const mask = this.table.length - 1;
    let s = this.hash(this.arena, i * this.n) & mask;
    while (this.table[s]! >= 0) s = (s + 1) & mask;
    this.table[s] = i;
  }
  private grow() {
    const size = this.depth.length * 2;
    const a = new Uint8Array(size * this.n); a.set(this.arena); this.arena = a;
    const d = new Uint8Array(size); d.set(this.depth); this.depth = d;
    const p = new Int32Array(size); p.set(this.parent); this.parent = p;
  }
  private rehash(size: number) {
    this.table = new Int32Array(size).fill(-1);
    for (let i = 0; i < this.count; i++) this.insertIndex(i);
  }
}

export type Paths<E> = { count: number; sampled: boolean; list: E[][] };

/** The paths from `start` to a goal through a DAG whose every edge lies on one (the shortest
 * solutions): all of them when there are at most `max`, else a uniform sample of `max` (seeded,
 * so the same each run). */
export function listPaths<E>(start: number, out: (s: number) => [number, E][], goals: Set<number>, max: number, seed = 12345): Paths<E> {
  const ways = new Map<number, number>();
  const count = (s: number): number => {
    if (goals.has(s)) return 1;
    let w = ways.get(s);
    if (w === undefined) ways.set(s, (w = out(s).reduce((a, [t]) => a + count(t), 0)));
    return w;
  };
  const total = count(start), list: E[][] = [];
  if (total <= max) {
    const walk = (s: number, path: E[]) => {
      if (goals.has(s)) return void list.push(path);
      for (const [t, e] of out(s)) walk(t, [...path, e]);
    };
    walk(start, []);
    return { count: total, sampled: false, list };
  }
  const rand = rng(seed);
  for (let k = 0; k < max; k++) {
    const path: E[] = [];
    for (let s = start; !goals.has(s); ) {
      const es = out(s);
      let r = rand() * count(s), j = 0;
      for (; j < es.length - 1 && r >= count(es[j]![0]); j++) r -= count(es[j]![0]);
      path.push(es[j]![1]);
      s = es[j]![0];
    }
    list.push(path);
  }
  return { count: total, sampled: true, list };
}

/** A move: block index, from, to (lane positions). */
export type GMove = [number, number, number];

export type Solve = {
  status: "ok" | "unsolvable" | "cap" | "unsealed" | "shorter";
  fewest: number;
  /** Over every shortest solution: the least and the most extra moves (red counting). */
  extraMin: number;
  extraMax: number;
  states: number;
  relevant: number;
  sealed: boolean;
  /** A shortest solution (breadth first), and its extra moves. */
  solution: GMove[];
  extraBfs: number;
  /** Cells some block passes or rests in on some shortest solution. */
  used: Uint8Array;
  /** With `paths`: every shortest solution, or a uniform sample of them, and how many there are. */
  paths?: Paths<GMove>;
};

export type SolveOptions = {
  edge?: Edge;
  cap?: number;
  /** Stop as soon as the goal is reached in fewer moves than this ("shorter"). */
  atLeast?: number;
  /** Stop past this depth ("unsolvable" as far as it looked). */
  maxDepth?: number;
  /** Skip the extra moves over every shortest solution (extraMin and extraMax = the BFS one's). */
  quick?: boolean;
  /** Only states that could still reach the goal within this many moves (red's 1 and 1 for each
   * other block on the cells red must pass): every state on a solution that short is kept at its
   * true depth, so the fewest and extra moves are exact when the fewest is at most `bound`
   * ("unsolvable" past it). */
  bound?: number;
  /** List the shortest solutions: all of them up to this many, else a uniform sample this big. */
  paths?: number;
};

/** The fewest moves for block `red` to reach lane position `target`, exactly, and the extra moves. */
export function solve(g: Grid, red: number, target: number, { edge = "wall", cap = 300_000, atLeast = 0, maxDepth = 60, quick = false, bound = Infinity, paths = 0 }: SolveOptions = {}): Solve {
  const occ = occupancy(g);
  const a = analyse(g, red, edge, occ);
  const fail = (status: Solve["status"], states = 0, fewest = -1): Solve => ({ status, fewest, extraMin: -1, extraMax: -1, states, relevant: a.relevant.length, sealed: a.sealed, solution: [], extraBfs: -1, used: new Uint8Array(0) });
  if (edge === "open" && !a.sealed) return fail("unsealed");
  const R = a.relevant, n = R.length;
  // The fixed part: walls, locked and left-out blocks.
  const base = new Int16Array(g.W * g.H);
  for (let c = 0; c < base.length; c++) base[c] = occ[c] === -1 ? -1 : occ[c]! > 0 && !R.includes(occ[c]! - 1) ? -1 : 0;
  const ps = R.map((i) => g.pieces[i]!), spans = ps.map((p) => span(g, p));
  const st = new States(n);
  const cur = new Uint8Array(n);
  R.forEach((i, k) => (cur[k] = g.pos[i]!));
  st.add(cur, 0, -1);
  const grid = new Int16Array(g.W * g.H);
  const load = (i: number) => {
    grid.set(base);
    const o = i * n;
    for (let k = 0; k < n; k++) {
      cur[k] = st.arena[o + k]!;
      const [c1, c2] = cellsAt(g, ps[k]!, cur[k]!);
      grid[c1] = grid[c2] = k + 1;
    }
  };
  /** Every slide from the loaded state: f(k, from, to) with cur set to the new state. */
  const slides = (f: (k: number, from: number, to: number) => void) => {
    for (let k = 0; k < n; k++) {
      const p = ps[k]!, at = cur[k]!;
      for (let j = at - 1; j >= 0 && grid[laneCell(g, p, j)] === 0; j--) ((cur[k] = j), f(k, at, j));
      for (let j = at + 1; j < spans[k]! && grid[laneCell(g, p, j + 1)] === 0; j++) ((cur[k] = j), f(k, at, j));
      cur[k] = at;
    }
  };
  /** A lower bound on the moves left after block k moved to `to` (the grid still has it where it
   * was): red's own move, and one for each other block on the cells red must pass. */
  const seen = new Int32Array(n + 1);
  let stamp = 0;
  const lower = (k: number, to: number) => {
    const r = k === 0 ? to : cur[0]!;
    if (r === target) return 0;
    const lo = target > r ? r + 2 : target, hi = target > r ? target + 1 : r - 1;
    stamp++;
    let count = 1;
    for (let j = lo; j <= hi; j++) {
      const c = laneCell(g, ps[0]!, j);
      let o = grid[c]!;
      if (k !== 0 && o === k + 1) o = 0;
      if (k !== 0 && (laneCell(g, ps[k]!, to) === c || laneCell(g, ps[k]!, to + 1) === c)) o = k + 1;
      if (o === -1) return 99;
      if (o > 1 && seen[o] !== stamp) ((seen[o] = stamp), count++);
    }
    return count;
  };
  if (cur[0] === target) return fail("ok", 1, 0);
  let fewest = -1, head = 0;
  for (let d = 0; fewest < 0; d++) {
    const end = st.count;
    if (head === end) return fail("unsolvable", st.count);
    if (d >= maxDepth) return fail("unsolvable", st.count);
    for (; head < end; head++) {
      load(head);
      const from = head;
      slides((k, _a, to) => {
        if (bound < Infinity && d + 1 + lower(k, to) > bound) return;
        const [, fresh] = st.add(cur, d + 1, from);
        if (fresh && k === 0 && to === target) fewest = d + 1;
      });
      if (st.count > cap) return fail("cap", st.count);
      if (fewest >= 0 && fewest < atLeast) return fail("shorter", st.count, fewest);
    }
  }
  // The goal states, and the breadth-first solution to the first of them.
  const goals: number[] = [];
  for (let i = head; i < st.count; i++) if (st.depth[i] === fewest && st.arena[i * n] === target) goals.push(i);
  const path: number[] = [];
  for (let i = goals[0]!; i >= 0; i = st.parent[i]!) path.unshift(i);
  const moveBetween = (s: number, t: number): GMove => {
    for (let k = 0; k < n; k++) if (st.arena[s * n + k] !== st.arena[t * n + k]) return [R[k]!, st.arena[s * n + k]!, st.arena[t * n + k]!];
    throw new Error("no move");
  };
  const solution = path.slice(1).map((t, k) => moveBetween(path[k]!, t));
  const extraBfs = solution.length - new Set(solution.map((m) => m[0])).size;
  if (quick) return { status: "ok", fewest, extraMin: extraBfs, extraMax: extraBfs, states: st.count, relevant: n, sealed: a.sealed, solution, extraBfs, used: new Uint8Array(0) };
  // Back from the goals: the states on shortest solutions, by depth, and the edges between them.
  const onPath = new Uint8Array(st.count);
  const layer: number[][] = Array.from({ length: fewest + 1 }, () => []);
  for (const i of goals) ((onPath[i] = 1), layer[fewest]!.push(i));
  const used = new Uint8Array(g.W * g.H);
  const edges: [number, number, number][][] = Array.from({ length: fewest + 1 }, () => []); // [s, t, k] into depth d
  const probe = new Uint8Array(n);
  for (let d = fewest; d > 0; d--) {
    for (const t of layer[d]!) {
      load(t);
      slides((k, _from, _to) => {
        probe.set(cur);
        const s = st.find(probe);
        if (s < 0 || st.depth[s] !== d - 1) return;
        edges[d]!.push([s, t, k]);
        if (!onPath[s]) ((onPath[s] = 1), layer[d - 1]!.push(s));
      });
    }
  }
  for (let d = 1; d <= fewest; d++) for (const [s, t, k] of edges[d]!) {
    const a0 = st.arena[s * n + k]!, b0 = st.arena[t * n + k]!;
    for (let j = Math.min(a0, b0); j <= Math.max(a0, b0) + 1; j++) used[laneCell(g, ps[k]!, j)] = 1;
  }
  // Forward: the sets of blocks moved so far, per state (bit masks; up to 31 blocks that matter).
  let extraMin = extraBfs, extraMax = extraBfs;
  if (n <= 31) {
    let masks = new Map<number, Set<number>>([[0, new Set([0])]]);
    let budget = 3_000_000;
    for (let d = 1; d <= fewest && budget > 0; d++) {
      const next = new Map<number, Set<number>>();
      for (const [s, t, k] of edges[d]!) {
        const ms = masks.get(s);
        if (!ms) continue;
        let set = next.get(t);
        if (!set) next.set(t, (set = new Set()));
        for (const m of ms) set.add((m | (1 << k)) >>> 0);
        budget -= ms.size;
      }
      masks = next;
    }
    if (budget > 0) {
      let most = 0, least = Infinity;
      for (const ms of masks.values()) for (const m of ms) {
        let c = 0;
        for (let x = m; x; x &= x - 1) c++;
        most = Math.max(most, c);
        least = Math.min(least, c);
      }
      extraMin = fewest - most;
      extraMax = fewest - least;
    }
  }
  let listed: Paths<GMove> | undefined;
  if (paths > 0) {
    const out = new Map<number, [number, GMove][]>();
    for (let d = 1; d <= fewest; d++) for (const [s, t, k] of edges[d]!) {
      const e: [number, GMove] = [t, [R[k]!, st.arena[s * n + k]!, st.arena[t * n + k]!]];
      (out.get(s) ?? out.set(s, []).get(s)!).push(e);
    }
    listed = listPaths(0, (s) => out.get(s) ?? [], new Set(goals), paths);
  }
  return { status: "ok", fewest, extraMin, extraMax, states: st.count, relevant: n, sealed: a.sealed, solution, extraBfs, used, paths: listed };
}

/** Every state reachable from the start (up to `cap`), and each block's fewest moves to each
 * position: for picking a room's best goal. */
export function reachAll(g: Grid, cap: number): { states: number; best: number[][]; capped: boolean } {
  const n = g.pieces.length;
  const occ = occupancy(g);
  const base = new Int16Array(g.W * g.H);
  for (let c = 0; c < base.length; c++) base[c] = occ[c] === -1 ? -1 : 0;
  const st = new States(n, 1 << 15);
  const cur = Uint8Array.from(g.pos);
  st.add(cur, 0, -1);
  const best = g.pieces.map((p) => new Array<number>(span(g, p)).fill(Infinity));
  g.pos.forEach((p, i) => (best[i]![p] = 0));
  const grid = new Int16Array(g.W * g.H);
  for (let head = 0; head < st.count; head++) {
    grid.set(base);
    const o = head * n;
    for (let k = 0; k < n; k++) {
      cur[k] = st.arena[o + k]!;
      const [c1, c2] = cellsAt(g, g.pieces[k]!, cur[k]!);
      grid[c1] = grid[c2] = k + 1;
    }
    const d = st.depth[head]! + 1;
    for (let k = 0; k < n; k++) {
      const p = g.pieces[k]!, at = cur[k]!, sp = span(g, p), bk = best[k]!;
      for (let j = at - 1; j >= 0 && grid[laneCell(g, p, j)] === 0; j--) {
        cur[k] = j;
        if (st.add(cur, d, head)[1] && bk[j] === Infinity) bk[j] = d;
      }
      for (let j = at + 1; j < sp && grid[laneCell(g, p, j + 1)] === 0; j++) {
        cur[k] = j;
        if (st.add(cur, d, head)[1] && bk[j] === Infinity) bk[j] = d;
      }
      cur[k] = at;
    }
    if (st.count > cap) return { states: st.count, best, capped: true };
  }
  return { states: st.count, best, capped: false };
}

/** A small random generator (LCG), seeded. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

export function free(occ: Int16Array, g: Grid, p: Piece, at: number) {
  return at >= 0 && at < span(g, p) && cellsAt(g, p, at).every((c) => occ[c] === 0);
}

/** Tries to place a random block on empty cells; its index, or -1. */
export function addRandom(g: Grid, next: () => number, occ = occupancy(g)): number {
  for (let t = 0; t < 30; t++) {
    const h = next() < 0.5, p: Piece = { h, lane: Math.floor(next() * (h ? g.H : g.W)) };
    const at = Math.floor(next() * span(g, p));
    if (!free(occ, g, p, at)) continue;
    g.pieces.push(p);
    g.pos.push(at);
    return g.pieces.length - 1;
  }
  return -1;
}

export function removePiece(g: Grid, i: number) {
  g.pieces.splice(i, 1);
  g.pos.splice(i, 1);
}

/** A random room: W x H with `blocks` blocks and `walls` walls inside (as extra-moves.ts makes them). */
export function randomRoom(W: number, H: number, blocks: number, walls: number, next: () => number): Grid {
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  for (let k = 0; k < walls; k++) g.wall[Math.floor(next() * W * H)] = 1;
  for (let t = 0; t < 400 && g.pieces.length < blocks; t++) addRandom(g, next);
  return g;
}

/** The room's best goal: a block to a position whose fewest is in [lo, hi], scored by its
 * extra moves (want "high": the most; "low": none, the fewest nearest `aim`). */
export type Goal = { red: number; target: number; fewest: number; extra: number; extraMax: number; states: number };
export function bestGoal(g: Grid, lo: number, hi: number, want: "high" | "low", cap = 150_000, aim?: number, deadline = Infinity): Goal | null {
  const all = reachAll(g, cap);
  if (all.capped) return null;
  const cands: { red: number; target: number; f: number }[] = [];
  all.best.forEach((b, i) => b.forEach((f, p) => f >= lo && f <= hi && cands.push({ red: i, target: p, f })));
  // Longest first (extra moves grow with length), or nearest the aim.
  cands.sort((a, b) => (aim !== undefined ? Math.abs(a.f - aim) - Math.abs(b.f - aim) : b.f - a.f));
  let best: Goal | null = null;
  for (const c of cands.slice(0, 12)) {
    if (performance.now() > deadline) break;
    const s = solve(g, c.red, c.target, { cap });
    if (s.status !== "ok") continue;
    const goal = { red: c.red, target: c.target, fewest: s.fewest, extra: s.extraMin, extraMax: s.extraMax, states: s.states };
    const score = (x: Goal) => (want === "high" ? x.extra * 100 + x.fewest : -x.extraMax * 100 - Math.abs(x.fewest - (aim ?? x.fewest)));
    if (!best || score(goal) > score(best)) best = goal;
    if (want === "low" && best.extraMax === 0 && (aim === undefined || best.fewest === aim)) break;
  }
  return best;
}

/** The room put in a window of the world: the room's cells at (m+1, m+1), a ring of walls round
 * it, and m cells of the world's blocks (randomLayout at the game's density and walls) round
 * that, which stop at the room's ring. */
export function inWorld(room: Grid, m: number, seed: number, density = TRIES, walls = WALLS): { g: Grid; ring: number[]; roomCells: Set<number>; ox: number; oy: number } {
  const W = room.W + 2 * m + 2, H = room.H + 2 * m + 2, o = m + 1;
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  const roomCells = new Set<number>(), ring: number[] = [];
  for (let y = 0; y < room.H; y++) for (let x = 0; x < room.W; x++) {
    roomCells.add((y + o) * W + x + o);
    if (room.wall[y * room.W + x]) g.wall[(y + o) * W + x + o] = 1;
  }
  for (let y = o - 1; y <= o + room.H; y++) for (let x = o - 1; x <= o + room.W; x++) {
    const c = y * W + x;
    if (roomCells.has(c)) continue;
    ring.push(c);
    g.wall[c] = 1;
  }
  room.pieces.forEach((p, i) => {
    g.pieces.push(p.h ? { h: true, lane: p.lane + o } : { h: false, lane: p.lane + o });
    g.pos.push(room.pos[i]! + o);
  });
  // The world round it: far from the origin's UI, a place picked by the seed.
  const ox = 4000 + (seed % 997) * 16, oy = 4000 + Math.floor(seed / 997) * 16;
  const layout = randomLayout(seed, { tries: density, walls });
  const occ = occupancy(g);
  for (const b of layout.blocksIn({ x: ox, y: oy, width: W, height: H })) {
    if (b.ui) continue;
    const x = b.x - ox, y = b.y - oy;
    if (x < 0 || y < 0 || x + b.w > W || y + b.h > H) continue;
    const cells = [];
    for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) cells.push((y + j) * W + x + i);
    if (cells.some((c) => occ[c] !== 0 || roomCells.has(c) || ring.includes(c))) continue;
    if (b.wall) { g.wall[cells[0]!] = 1; occ[cells[0]!] = -1; continue; }
    const h = b.w > b.h;
    g.pieces.push({ h, lane: h ? y : x });
    g.pos.push(h ? x : y);
    cells.forEach((c) => (occ[c] = g.pieces.length));
  }
  return { g, ring, roomCells, ox, oy };
}
