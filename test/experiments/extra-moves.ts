// Extra moves (reports/extra-moves.html): small walled boards of 2x1 blocks, each searched
// whole from its start (every state reachable, breadth first), so every goal on it (any
// block to any place in its lane) has its exact fewest moves. For each goal of `--min` moves
// or more: the extra moves, Σ over moved blocks of (times moved − 1) = moves − distinct
// blocks moved, over every shortest solution (the least and the most, and of a breadth-first
// shortest solution), with and without the red block; then the measure's proof (the game's,
// src/difficulty.ts) with its extra moves and the Judge's decisions along it. A line per goal
// as JSONL (data/ is not kept in git):
//   bun test/experiments/extra-moves.ts --boards 200 --size 6x6 --blocks 10,13 --walls 0,2 --seed 1 --out data/extra/6x6.jsonl [--min 6] [--cap 400000]
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Board } from "../../src/board";
import { decisionStages } from "../../src/decisions";
import { measure } from "../../src/difficulty";
import { fixedLayout, type Placed } from "../../src/layout";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const [W, H] = arg("size", "6x6").split("x").map(Number) as [number, number];
const [minBlocks, maxBlocks] = arg("blocks", "10,13").split(",").map(Number) as [number, number];
const [minWalls, maxWalls] = arg("walls", "0,0").split(",").map(Number) as [number, number];
const boards = Number(arg("boards", "50")), seed0 = Number(arg("seed", "1")), minMoves = Number(arg("min", "6"));
const cap = Number(arg("cap", "400000")), out = arg("out", "data/extra/run.jsonl");
mkdirSync(dirname(out), { recursive: true });

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A block: horizontal (its row is `lane`) or vertical (its column), 2 cells long. */
type Piece = { h: boolean; lane: number };
const B = 8; // positions are packed in base 8: up to 9 cells a lane, 17 blocks (53 bits)
const span = (p: Piece) => (p.h ? W : H) - 1; // positions 0 .. span-1

function randomBoard(next: () => number) {
  const wall = new Uint8Array(W * H);
  const walls = minWalls + Math.floor(next() * (maxWalls - minWalls + 1));
  for (let k = 0; k < walls; k++) wall[Math.floor(next() * W * H)] = 1;
  const taken = Uint8Array.from(wall), pieces: Piece[] = [], pos: number[] = [];
  const want = Math.min(17, minBlocks + Math.floor(next() * (maxBlocks - minBlocks + 1)));
  for (let t = 0; t < 400 && pieces.length < want; t++) {
    const h = next() < 0.5, p: Piece = { h, lane: Math.floor(next() * (h ? H : W)) };
    const at = Math.floor(next() * span(p));
    const cs = cellsOf(p, at);
    if (cs.some((c) => taken[c])) continue;
    cs.forEach((c) => (taken[c] = 1));
    pieces.push(p);
    pos.push(at);
  }
  return { wall, pieces, pos };
}
const cellsOf = (p: Piece, at: number) => (p.h ? [p.lane * W + at, p.lane * W + at + 1] : [at * W + p.lane, (at + 1) * W + p.lane]);
const pack = (pos: number[]) => pos.reduce((k, v, i) => k + v * B ** i, 0);
const unpack = (k: number, n: number) => Array.from({ length: n }, (_, i) => Math.floor(k / B ** i) % B);

/** Every state one slide away: [moved block, new key]. */
function neighbours(wall: Uint8Array, pieces: Piece[], key: number, grid: Uint8Array): [number, number][] {
  const pos = unpack(key, pieces.length);
  grid.set(wall);
  pieces.forEach((p, i) => cellsOf(p, pos[i]!).forEach((c) => (grid[c] = 1)));
  const out: [number, number][] = [];
  pieces.forEach((p, i) => {
    const step = B ** i, n = span(p);
    for (const d of [-1, 1]) {
      for (let k = pos[i]! + d; k >= 0 && k < n; k += d) {
        const lead = d > 0 ? k + 1 : k;
        const c = p.h ? p.lane * W + lead : lead * W + p.lane;
        if (grid[c]) break;
        out.push([i, key + (k - pos[i]!) * step]);
      }
    }
  });
  return out;
}

const popcount = (m: number) => {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
};

/** The board as the game places it: the square's walls round it (and inside), the blocks
 * with ids; the square's top-left at (ox, oy). */
export function placed(wall: Uint8Array, pieces: Piece[], pos: number[], ox: number, oy: number): Placed[] {
  const out: Placed[] = [];
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    const inside = x >= 0 && y >= 0 && x < W && y < H;
    if (!inside || wall[y * W + x]) out.push({ id: `wall ${x + ox},${y + oy}`, x: x + ox, y: y + oy, w: 1, h: 1, wall: true });
  }
  pieces.forEach((p, i) => {
    const x = p.h ? pos[i]! : p.lane, y = p.h ? p.lane : pos[i]!;
    out.push({ id: `b${i}`, x: x + ox, y: y + oy, w: p.h ? 2 : 1, h: p.h ? 1 : 2 });
  });
  return out;
}

for (let b = 0; b < boards; b++) {
  const seed = seed0 * 100_000 + b;
  const next = rng(seed);
  for (let i = 0; i < 5; i++) next();
  const { wall, pieces, pos } = randomBoard(next);
  const n = pieces.length;
  const t0 = performance.now();
  // Breadth first from the start: each state's distance, by layers.
  const grid = new Uint8Array(W * H);
  const dist = new Map<number, number>();
  const layers: number[][] = [[pack(pos)]];
  dist.set(pack(pos), 0);
  /** The fewest moves to put block i at position p. */
  const best = pieces.map((p) => new Array<number>(span(p)).fill(Infinity));
  pos.forEach((p, i) => (best[i]![p] = 0));
  let capped = false;
  for (let d = 0; layers[d]!.length && !capped; d++) {
    const layer: number[] = [];
    for (const s of layers[d]!) {
      for (const [, t] of neighbours(wall, pieces, s, grid)) {
        if (dist.has(t)) continue;
        dist.set(t, d + 1);
        layer.push(t);
        const tp = unpack(t, n);
        tp.forEach((p, i) => best[i]![p] === Infinity && (best[i]![p] = d + 1));
      }
      if (dist.size > cap) capped = true;
    }
    layers.push(layer);
  }
  const bfsMs = performance.now() - t0;
  if (capped) {
    console.log(`board ${b}: over ${cap} states, skipped`);
    continue;
  }
  let goals = 0;
  for (let i = 0; i < n; i++) for (let p = 0; p < span(pieces[i]!); p++) {
    const f = best[i]![p]!;
    if (f === Infinity || f < minMoves) continue;
    goals++;
    // The states on shortest solutions, back from those with block i at p.
    const dag: Set<number>[] = Array.from({ length: f + 1 }, () => new Set());
    for (const s of layers[f]!) if (Math.floor(s / B ** i) % B === p) dag[f]!.add(s);
    for (let d = f; d > 0; d--) for (const s of dag[d]!) for (const [, t] of neighbours(wall, pieces, s, grid)) if (dist.get(t) === d - 1) dag[d - 1]!.add(t);
    // Forward: the sets of blocks moved along the way (with each move's block last).
    let masks = new Map<number, Set<number>>([[pack(pos), new Set([0])]]);
    let bfsPath: number[] | null = null; // the first shortest solution found: its states
    const firstPath = new Map<number, number[]>([[pack(pos), [pack(pos)]]]);
    for (let d = 0; d < f; d++) {
      const nextMasks = new Map<number, Set<number>>();
      for (const [s, ms] of masks) {
        for (const [j, t] of neighbours(wall, pieces, s, grid)) {
          if (!dag[d + 1]!.has(t)) continue;
          let set = nextMasks.get(t);
          if (!set) {
            nextMasks.set(t, (set = new Set()));
            firstPath.set(t, [...firstPath.get(s)!, t]);
          }
          for (const m of ms) set.add(m | (1 << j));
        }
        firstPath.delete(s);
      }
      masks = nextMasks;
    }
    let most = 0, least = Infinity;
    for (const [s, ms] of masks) {
      bfsPath ??= firstPath.get(s)!;
      for (const m of ms) {
        const c = popcount(m);
        most = Math.max(most, c);
        least = Math.min(least, c);
      }
    }
    // The breadth-first solution as moves: [block, from, to] along its lane.
    const bfsMoves = bfsPath!.slice(1).map((t, k) => {
      const a = unpack(bfsPath![k]!, n), z = unpack(t, n), j = a.findIndex((v, q) => v !== z[q]);
      return [j, a[j]!, z[j]!] as [number, number, number];
    });
    const bfsBlocks = bfsMoves.map((m) => m[0]);
    const extraOf = (blocks: number[]) => blocks.length - new Set(blocks).size;
    const withoutRed = (blocks: number[]) => extraOf(blocks.filter((j) => j !== i));
    // The measure's proof and the Judge's decisions along it, on the board as the game places it.
    const layout = fixedLayout(placed(wall, pieces, pos, 0, 0));
    const board = new Board(layout);
    const target = pieces[i]!.h ? { x: p, y: pieces[i]!.lane } : { x: pieces[i]!.lane, y: p };
    const d = measure(board, { id: `b${i}`, target, solution: [] }, { limit: 200_000 });
    // The proof: the measure's when it is a shortest one, else the breadth-first one.
    const point = (j: number, v: number) => (pieces[j]!.h ? { x: v, y: pieces[j]!.lane } : { x: pieces[j]!.lane, y: v });
    const measured = d.moves === f && d.solution?.length === f;
    const proofMoves = measured ? d.solution!.map((m) => ({ block: m.id, from: m.from, to: m.to })) : bfsMoves.map(([j, a, z]) => ({ block: `b${j}`, from: point(j, a), to: point(j, z) }));
    const proofIdx = proofMoves.map((m) => Number(m.block.slice(1)));
    const stages = decisionStages(board, { red: `b${i}`, target, moves: proofMoves });
    const line = {
      size: `${W}x${H}`, seed, walls: [...wall.keys()].filter((c) => wall[c]), pieces, pos, red: i, target: p,
      fewest: f, states: dist.size, dagStates: dag.reduce((a, s) => a + s.size, 0),
      extra: { least: f - most, most: f - least, bfs: extraOf(bfsBlocks), bfsNoRed: withoutRed(bfsBlocks) },
      distinct: { most, least },
      measure: { moves: d.moves, atLeast: d.atLeast, solution: d.solution?.map((m) => Number(m.id.slice(1))) },
      proof: { from: measured ? "measure" : "bfs", blocks: proofIdx, extra: extraOf(proofIdx), extraNoRed: withoutRed(proofIdx), redMoves: proofIdx.filter((j) => j === i).length },
      decisions: stages.reduce((a, b) => a + b, 0), stages,
      solution: proofMoves.map((m) => [Number(m.block.slice(1)), m.to.x, m.to.y]),
    };
    appendFileSync(out, JSON.stringify(line) + "\n");
  }
  console.log(`board ${b}: ${n} blocks, ${dist.size} states, deepest ${layers.length - 2}, ${goals} goals, bfs ${Math.round(bfsMs)} ms, all ${Math.round(performance.now() - t0)} ms`);
}
