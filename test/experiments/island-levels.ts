// Handcrafted-style island levels: a 6x6 square with only 2x1 blocks and the red block on row
// 2, its goal a 2x1 extrusion just outside the right wall (x 6..7). Random boards, each
// shuffled within everything reachable from it to the state farthest (in moves: one block's
// slide, any distance) from the red block on its goal. Keeps the best per fewest-moves count.
//   scripts/capped.sh 2000 600 bun test/experiments/island-levels.ts <boards> <out.json> [state cap]
export {};
type Piece = { h: boolean; lane: number }; // h: lane is the row; else the column
const N = 6, ROW = 2, EXIT = 6; // red solved at x = EXIT (cells 6, 7 of row ROW)

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// A state is the pieces' positions (0..6), 3 bits each, packed in one number (up to 17
// pieces fit in 53 bits); one grid of cells is filled per state.
const W = 8; // grid row width: 0..5 inside, 6..7 the exit on row ROW
const pack = (pos: number[]) => pos.reduce((k, v, i) => k + v * 8 ** i, 0);
const unpack = (k: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(k / 8 ** i) % 8);
const inside = (x: number, y: number) => y >= 0 && y < N && x >= 0 && (x < N || (y === ROW && x < EXIT + 2));

function cells(p: Piece, at: number): [number, number] {
  return p.h ? [p.lane * W + at, p.lane * W + at + 1] : [at * W + p.lane, (at + 1) * W + p.lane];
}
function occupied(pieces: Piece[], pos: number[]): Set<number> {
  const s = new Set<number>();
  pieces.forEach((p, i) => cells(p, pos[i]!).forEach((c) => s.add(c)));
  return s;
}

const grid = new Uint8Array(W * N);
/** Every state one slide away, packed. */
function neighbours(pieces: Piece[], key: number): number[] {
  const pos = unpack(key, pieces.length);
  grid.fill(0);
  pieces.forEach((p, i) => cells(p, pos[i]!).forEach((c) => (grid[c] = 1)));
  const out: number[] = [];
  pieces.forEach((p, i) => {
    const step = 8 ** i;
    for (const d of [-1, 1]) {
      for (let k = pos[i]! + d; ; k += d) {
        // The cell newly entered: the leading one in the direction of travel.
        const lead = d > 0 ? k + 1 : k;
        const x = p.h ? lead : p.lane, y = p.h ? p.lane : lead;
        if (!inside(x, y) || grid[y * W + x]) break;
        out.push(key + (k - pos[i]!) * step);
      }
    }
  });
  return out;
}

function randomBoard(next: () => number, count: number): { pieces: Piece[]; pos: number[] } | null {
  const pieces: Piece[] = [{ h: true, lane: ROW }], pos = [Math.floor(next() * 3)];
  for (let t = 0; t < 200 && pieces.length < count; t++) {
    const h = next() < 0.5, lane = Math.floor(next() * N), at = Math.floor(next() * (N - 1));
    if (h && lane === ROW) continue; // only the red block on its row, so nothing else can slide out
    const taken = occupied(pieces, pos);
    const cells = h ? [[at, lane], [at + 1, lane]] : [[lane, at], [lane, at + 1]];
    if (cells.some(([x, y]) => taken.has(y! * 8 + x!))) continue;
    pieces.push({ h, lane });
    pos.push(at);
  }
  return pieces.length === count ? { pieces, pos } : null;
}

type Level = { fewest: number; states: number; pieces: Piece[]; pos: number[]; solution: { piece: number; from: number; to: number }[] };

function hardest(pieces: Piece[], startPos: number[], cap: number): Level | null {
  const start = pack(startPos), n = pieces.length;
  const seen = new Set<number>([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) {
    if (queue.length > cap) return null;
    for (const s of neighbours(pieces, queue[i]!)) if (!seen.has(s)) (seen.add(s), queue.push(s));
  }
  const solved = queue.filter((k) => k % 8 === EXIT);
  if (!solved.length) return null;
  const dist = new Map<number, number>(), parent = new Map<number, number>();
  for (const s of solved) dist.set(s, 0);
  const q = [...solved];
  let far = solved[0]!;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i]!, d = dist.get(cur)!;
    if (d > dist.get(far)! && cur % 8 <= N - 2) far = cur; // starts with the red block all inside
    for (const s of neighbours(pieces, cur)) if (!dist.has(s)) (dist.set(s, d + 1), parent.set(s, cur), q.push(s));
  }
  const solution: Level["solution"] = [];
  for (let cur = far; parent.has(cur); ) {
    const to = parent.get(cur)!, a = unpack(cur, n), b = unpack(to, n), piece = a.findIndex((v, j) => v !== b[j]);
    solution.push({ piece, from: a[piece]!, to: b[piece]! });
    cur = to;
  }
  return { fewest: dist.get(far)!, states: queue.length, pieces, pos: unpack(far, n), solution };
}

/** The fewest moves from `pos` to solved, with a shortest solution (forward BFS); null if none. */
function solve(pieces: Piece[], pos: number[], cap: number): Level["solution"] | null {
  const start = pack(pos), n = pieces.length, parent = new Map<number, number>([[start, -1]]), q = [start];
  for (let i = 0; i < q.length && q.length <= cap; i++) {
    const cur = q[i]!;
    if (cur % 8 === EXIT) {
      const path: Level["solution"] = [];
      for (let c = cur; parent.get(c)! >= 0; c = parent.get(c)!) {
        const a = unpack(parent.get(c)!, n), b = unpack(c, n), piece = a.findIndex((v, j) => v !== b[j]);
        path.unshift({ piece, from: a[piece]!, to: b[piece]! });
      }
      return path;
    }
    for (const s of neighbours(pieces, cur)) if (!parent.has(s)) (parent.set(s, cur), q.push(s));
  }
  return null;
}

/** Drop the blocks the puzzle doesn't need: each whose removal leaves the fewest moves the same. */
function prune(l: Level, cap: number): Level {
  let { pieces, pos } = l;
  for (let i = pieces.length - 1; i >= 1; i--) {
    const p2 = pieces.filter((_, j) => j !== i), q2 = pos.filter((_, j) => j !== i);
    const s = solve(p2, q2, cap);
    if (s && s.length === l.fewest) (pieces = p2), (pos = q2);
  }
  return { ...l, pieces, pos, solution: solve(pieces, pos, cap)! };
}

const tries = Number(process.argv[2] ?? 100), out = process.argv[3] ?? "island-levels.json", cap = Number(process.argv[4] ?? 200_000);
const began = performance.now();
const next = rng(12345), best = new Map<number, Level>();
for (let t = 0; t < tries; t++) {
  const b = randomBoard(next, 7 + Math.floor(next() * 7));
  if (!b) continue;
  const l = hardest(b.pieces, b.pos, cap);
  if (!l) continue;
  // Per fewest count, prefer fewer blocks (cleaner), then a bigger state space.
  const old = best.get(l.fewest);
  if (!old || l.pieces.length < old.pieces.length || (l.pieces.length === old.pieces.length && l.states > old.states)) best.set(l.fewest, l);
}
const levels = [...best.values()].sort((a, b) => a.fewest - b.fewest).map((l) => prune(l, cap));
console.log(`${tries} boards in ${((performance.now() - began) / 1000).toFixed(1)} s`);
console.log(levels.map((l) => `${l.fewest} moves, ${l.pieces.length} blocks, ${l.states} states`).join("\n"));
await Bun.write(out, JSON.stringify(levels));
