// The full state graph of a board's blocks that matter (lab/, research): every state reachable
// from the start by sliding the blocks in R (the rest frozen as walls), its distance to the goal,
// and the numbers the research asks about: where a player can wander off, which moves look like
// progress and are not, how narrow the way through is, and how long simulated players take.
//
// Slides are reversible, so the graph is undirected and every reachable state can reach the goal
// if the start can: nobody is ever "stuck" for good. Being stuck means being far from the goal in
// moves (d*) while the board gives no sign of it.
import { cellsAt, type Grid, occupancy, span } from "../test/experiments/extra-gen-core";

export type Graph = {
  g: Grid;
  R: number[];
  n: number;
  /** Positions of R's blocks per state, n bytes each. */
  arena: Uint8Array;
  count: number;
  /** Neighbours, CSR. edge k from state s: adj[off[s]..off[s+1]) = target states. */
  off: Int32Array;
  adj: Int32Array;
  /** Which block (index into R) each edge moves. */
  who: Uint8Array;
  /** Moves from the goal (fewest moves to any goal state), -1 if none. */
  dist: Int32Array;
  /** Moves from the start. */
  fromStart: Int32Array;
  goals: number[];
  start: number;
  capped: boolean;
};

const laneCell = (g: Grid, p: { h: boolean; lane: number }, k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);

/** Build the graph: `R` the blocks that move (red first), the others walls. */
export function buildGraph(g: Grid, R: number[], target: number, cap = 2_000_000, bound = Infinity): Graph {
  const n = R.length;
  const occ = occupancy(g);
  const base = new Int16Array(g.W * g.H);
  for (let c = 0; c < base.length; c++) base[c] = occ[c] === -1 ? -1 : occ[c]! > 0 && !R.includes(occ[c]! - 1) ? -1 : 0;
  const ps = R.map((i) => g.pieces[i]!), spans = ps.map((p) => span(g, p));
  let size = 1 << 15;
  let arena = new Uint8Array(size * n);
  let table = new Int32Array(size * 2).fill(-1);
  let count = 0;
  const hash = (buf: Uint8Array, off: number) => {
    let h = 2166136261;
    for (let k = 0; k < n; k++) h = Math.imul(h ^ buf[off + k]!, 16777619);
    return h >>> 0;
  };
  const same = (i: number, buf: Uint8Array) => {
    const o = i * n;
    for (let k = 0; k < n; k++) if (arena[o + k] !== buf[k]) return false;
    return true;
  };
  const rehash = () => {
    table = new Int32Array(table.length * 2).fill(-1);
    const mask = table.length - 1;
    for (let i = 0; i < count; i++) {
      let s = hash(arena, i * n) & mask;
      while (table[s]! >= 0) s = (s + 1) & mask;
      table[s] = i;
    }
  };
  const add = (buf: Uint8Array): number => {
    const mask = table.length - 1;
    let s = hash(buf, 0) & mask;
    for (; ; s = (s + 1) & mask) {
      const i = table[s]!;
      if (i < 0) break;
      if (same(i, buf)) return i;
    }
    if (count === size) {
      size *= 2;
      const a = new Uint8Array(size * n);
      a.set(arena);
      arena = a;
    }
    const i = count++;
    arena.set(buf, i * n);
    table[s] = i;
    if (count * 2 > table.length) rehash();
    return i;
  };
  const cur = new Uint8Array(n);
  R.forEach((i, k) => (cur[k] = g.pos[i]!));
  const start = add(cur);
  const grid = new Int16Array(g.W * g.H);
  const load = (i: number) => {
    grid.set(base);
    const o = i * n;
    for (let k = 0; k < n; k++) {
      cur[k] = arena[o + k]!;
      const [c1, c2] = cellsAt(g, ps[k]!, cur[k]!);
      grid[c1] = grid[c2] = k + 1;
    }
  };
  // Depth from the start, for the bound: a state is kept only if depth + 1 + lower(k, to) <= bound
  // (lower: red's move plus one for each block on the cells red must cross; see extra-gen-core).
  let depthArr = new Int32Array(size);
  const seenStamp = new Int32Array(n + 1);
  let stamp = 0;
  const lower = (k: number, to: number) => {
    const r = k === 0 ? to : cur[0]!;
    if (r === target) return 0;
    const lo = target > r ? r + 2 : target, hi = target > r ? target + 1 : r - 1;
    stamp++;
    let c = 1;
    for (let j = lo; j <= hi; j++) {
      const cell = laneCell(g, ps[0]!, j);
      let o = grid[cell]!;
      if (k !== 0 && o === k + 1) o = 0;
      if (k !== 0 && (laneCell(g, ps[k]!, to) === cell || laneCell(g, ps[k]!, to + 1) === cell)) o = k + 1;
      if (o === -1) return 99;
      if (o > 1 && seenStamp[o] !== stamp) ((seenStamp[o] = stamp), c++);
    }
    return c;
  };
  let offsArr = new Int32Array(size + 1);
  let adjs = new Int32Array(1 << 18), whos = new Uint8Array(1 << 18), m = 0;
  const pushEdge = (t: number, k: number) => {
    if (m === adjs.length) {
      const a = new Int32Array(adjs.length * 2); a.set(adjs); adjs = a;
      const w = new Uint8Array(whos.length * 2); w.set(whos); whos = w;
    }
    adjs[m] = t; whos[m] = k; m++;
  };
  let capped = false, head = 0;
  for (; head < count; head++) {
    load(head);
    const d = depthArr[head]!;
    for (let k = 0; k < n; k++) {
      const p = ps[k]!, at = cur[k]!;
      for (const dir of [-1, 1]) {
        for (let j = at + dir; j >= 0 && j < spans[k]! && grid[laneCell(g, p, dir < 0 ? j : j + 1)] === 0; j += dir) {
          if (bound < Infinity && d + 1 + lower(k, j) > bound) continue;
          cur[k] = j;
          const before = count;
          const t = add(cur);
          if (count > before) {
            if (depthArr.length < size) { const nd = new Int32Array(size); nd.set(depthArr); depthArr = nd; }
            depthArr[t] = d + 1;
          }
          pushEdge(t, k);
        }
        cur[k] = at;
      }
    }
    offsSet(head + 1, m);
    if (count > cap) { capped = true; head++; break; }
  }
  function offsSet(i: number, v: number) { if (i >= offsArr.length) { const o = new Int32Array(offsArr.length * 2); o.set(offsArr); offsArr = o; } offsArr[i] = v; }
  // States discovered but not expanded (when capped) get no edges.
  for (let i = head + 1; i <= count; i++) offsSet(i, m);
  const off = offsArr.subarray(0, count + 1), adj = adjs.subarray(0, m), who = whos.subarray(0, m);
  const goals: number[] = [];
  for (let i = 0; i < count; i++) if (arena[i * n] === target) goals.push(i);
  const bfs = (sources: number[]) => {
    const d = new Int32Array(count).fill(-1);
    const q = new Int32Array(count);
    let qh = 0, qt = 0;
    for (const s of sources) ((d[s] = 0), (q[qt++] = s));
    while (qh < qt) {
      const s = q[qh++]!;
      for (let e = off[s]!; e < off[s + 1]!; e++) {
        const t = adj[e]!;
        if (d[t] < 0) ((d[t] = d[s]! + 1), (q[qt++] = t));
      }
    }
    return d;
  };
  // When capped the frontier states have no out-edges, but edges into them exist; the undirected
  // distance from the goal needs reverse edges too. Build the reverse adjacency only then.
  let dist: Int32Array;
  if (!capped) dist = bfs(goals);
  else {
    const deg = new Int32Array(count + 1);
    for (let s = 0; s < count; s++) for (let e = off[s]!; e < off[s + 1]!; e++) deg[adj[e]! + 1]++;
    for (let i = 1; i <= count; i++) deg[i] += deg[i - 1]!;
    const radj = new Int32Array(adj.length), fill = deg.slice();
    for (let s = 0; s < count; s++) for (let e = off[s]!; e < off[s + 1]!; e++) radj[fill[adj[e]!]++] = s;
    dist = new Int32Array(count).fill(-1);
    const q = new Int32Array(count);
    let qh = 0, qt = 0;
    for (const s of goals) ((dist[s] = 0), (q[qt++] = s));
    while (qh < qt) {
      const s = q[qh++]!;
      for (let e = off[s]!; e < off[s + 1]!; e++) { const t = adj[e]!; if (dist[t]! < 0) ((dist[t] = dist[s]! + 1), (q[qt++] = t)); }
      for (let e = deg[s]!; e < deg[s + 1]!; e++) { const t = radj[e]!; if (dist[t]! < 0) ((dist[t] = dist[s]! + 1), (q[qt++] = t)); }
    }
  }
  const fromStart = bfs([start]);
  return { g, R, n, arena: arena.subarray(0, count * n), count, off, adj, who, dist, fromStart, goals, start, capped };
}

/** The state's positions (into R). */
export const stateOf = (G: Graph, s: number) => G.arena.subarray(s * G.n, (s + 1) * G.n);

/** Find a state by R positions, -1 if not in the graph. */
export function findState(G: Graph, pos: ArrayLike<number>): number {
  // Linear scan is too slow for millions; keep a lazily built map.
  const m = indexOf(G);
  return m.get(keyOf(pos, G.n)) ?? -1;
}
const keyOf = (pos: ArrayLike<number>, n: number) => {
  let s = "";
  for (let k = 0; k < n; k++) s += String.fromCharCode(pos[k]!);
  return s;
};
const indexes = new WeakMap<Graph, Map<string, number>>();
function indexOf(G: Graph) {
  let m = indexes.get(G);
  if (!m) {
    m = new Map();
    for (let i = 0; i < G.count; i++) m.set(keyOf(G.arena.subarray(i * G.n, (i + 1) * G.n), G.n), i);
    indexes.set(G, m);
  }
  return m;
}

/** The blocker count a player sees: red's move, plus one for each distinct block on the cells
 * red must cross to the target (walls make it impossible: a big number). A cheap, human-like
 * heuristic (what Trenquelleon's closure and Hauptman's lower bound start from). */
export function blockers(G: Graph, s: number, target: number): number {
  const { g, R, n } = G;
  const p = g.pieces[R[0]!]!, pos = stateOf(G, s);
  const r = pos[0]!;
  if (r === target) return 0;
  const occ = new Int16Array(g.W * g.H);
  for (let k = 0; k < n; k++) cellsAt(g, g.pieces[R[k]!]!, pos[k]!).forEach((c) => (occ[c] = k + 1));
  const lo = target > r ? r + 2 : target, hi = target > r ? target + 1 : r - 1;
  const seen = new Set<number>();
  for (let j = lo; j <= hi; j++) {
    const o = occ[laneCell(g, p, j)]!;
    if (o > 1) seen.add(o);
  }
  return 1 + seen.size;
}

/** Recursive blocker bound (Hauptman 2009 style, depth-limited): each blocker must itself clear
 * its lane of red's path, and whatever blocks the cells it could go to counts too (one level). */
export function blockersDeep(G: Graph, s: number, target: number): number {
  const { g, R, n } = G;
  const pos = stateOf(G, s);
  const occ = new Int16Array(g.W * g.H);
  const base = occupancy(g);
  for (let c = 0; c < occ.length; c++) occ[c] = base[c] === -1 || (base[c]! > 0 && !R.includes(base[c]! - 1)) ? -1 : 0;
  for (let k = 0; k < n; k++) cellsAt(g, g.pieces[R[k]!]!, pos[k]!).forEach((c) => (occ[c] = k + 1));
  const r = pos[0]!;
  if (r === target) return 0;
  const p0 = g.pieces[R[0]!]!;
  const lo = target > r ? r + 2 : target, hi = target > r ? target + 1 : r - 1;
  const need = new Set<number>();
  const pathCells = new Set<number>();
  for (let j = lo; j <= hi; j++) {
    const c = laneCell(g, p0, j);
    pathCells.add(c);
    const o = occ[c]!;
    if (o > 1) need.add(o - 1);
  }
  let total = 1;
  for (const k of need) {
    total++;
    // Can block k leave red's path by sliding one way without moving anything else?
    const p = g.pieces[R[k]!]!, at = pos[k]!;
    let freeWay = false;
    for (const dir of [-1, 1]) {
      let j = at;
      for (;;) {
        j += dir;
        if (j < 0 || j > span(g, p) - 1) break;
        const c = laneCell(g, p, dir < 0 ? j : j + 1);
        if (occ[c] !== 0) break;
        const [c1, c2] = cellsAt(g, p, j);
        if (!pathCells.has(c1) && !pathCells.has(c2)) { freeWay = true; break; }
      }
      if (freeWay) break;
    }
    if (!freeWay) total++;
  }
  return total;
}

/** A simulated player's moves to the goal: `pick(s, options)` returns an edge index. Returns the
 * number of moves, or `cap` when it gives up. */
export function rollout(G: Graph, pick: (s: number, from: number, to: number, prev: number) => number, cap = 500): number {
  let s = G.start, prev = -1, moves = 0;
  while (G.dist[s] !== 0 && moves < cap) {
    const e = pick(s, G.off[s]!, G.off[s + 1]!, prev);
    prev = s;
    s = G.adj[e]!;
    moves++;
  }
  return moves;
}

/** A seeded random number generator. */
export function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
