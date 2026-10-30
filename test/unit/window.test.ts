// The window state space and the A* measure, against plain breadth-first search on small
// random boards: the same fewest moves to every reachable position, and a replayable path.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import { shortest } from "../../src/difficulty";
import { fixedLayout, type Placed } from "../../src/layout";
import { Pool, Window } from "../../src/window";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random board in a size x size box: blocks that fit, some walls. */
function randomBoard(seed: number, size: number, blocks: number, walls: number): Placed[] {
  const next = rng(seed);
  const taken = new Set<string>();
  const placed: Placed[] = [];
  const put = (p: Placed): boolean => {
    const cells: string[] = [];
    for (let x = p.x; x < p.x + p.w; x++) for (let y = p.y; y < p.y + p.h; y++) cells.push(`${x},${y}`);
    if (cells.some((c) => taken.has(c))) return false;
    cells.forEach((c) => taken.add(c));
    placed.push(p);
    return true;
  };
  for (let i = 0; placed.length < blocks && i < 200; i++) {
    const horizontal = next() < 0.5;
    put({ id: `b${placed.length}`, x: Math.floor(next() * (size - (horizontal ? 1 : 0))), y: Math.floor(next() * (size - (horizontal ? 0 : 1))), w: horizontal ? 2 : 1, h: horizontal ? 1 : 2 });
  }
  for (let i = 0, n = 0; n < walls && i < 100; i++) {
    if (put({ id: `w${i}`, x: Math.floor(next() * size), y: Math.floor(next() * size), w: 1, h: 1, wall: true })) n++;
  }
  return placed;
}

/** Fewest moves to every red position by breadth-first search over the whole space. */
function bfs(win: Window, r: number): Map<number, number> {
  const pool = new Pool(win.sliders.length);
  pool.add(win.start, 0, -1, 0);
  const found = new Map<number, number>([[win.start[r]!, 0]]);
  const child = new Uint8Array(win.sliders.length);
  for (let i = 0; i < pool.count; i++) {
    const at = pool.offset(i);
    win.fill(pool.data, at);
    const slides: number[] = [];
    win.moves(pool.data, at, (k, to) => slides.push(k, to));
    for (let m = 0; m < slides.length; m += 2) {
      child.set(pool.data.subarray(at, at + pool.n));
      child[slides[m]!] = slides[m + 1]!;
      const j = pool.add(child, 0, i, pool.depth[i]! + 1);
      if (j >= 0 && !found.has(child[r]!)) found.set(child[r]!, pool.depth[i]! + 1);
    }
  }
  return found;
}

describe("window search", () => {
  test("A* finds the same fewest moves as breadth-first search, with a path that replays", () => {
    let compared = 0;
    for (let seed = 1; seed <= 40; seed++) {
      // Small boards, and some dense 6x6 ones with chains of blockers.
      const size = seed > 30 ? 6 : 5 + (seed % 2);
      const placed = randomBoard(seed, size, seed > 30 ? 11 : 6 + (seed % 4), seed % 3);
      const layout = fixedLayout(placed);
      const board = new Board(layout);
      const win = new Window(board, { x: 0, y: 0, width: size, height: size });
      if (win.sliders.length === 0) continue;
      const r = seed % win.sliders.length;
      const truth = bfs(win, r);
      const red = win.sliders[r]!;
      for (let want = 0; want + red.size <= win.length(red); want++) {
        if (want === win.start[r]) continue;
        const d = shortest(win, r, want, 1_000_000);
        expect(d.moves).toBe(truth.get(want) ?? null);
        if (d.moves === null) expect(d.atLeast).toBe(Infinity);
        else {
          expect(d.solution!.length).toBe(d.moves);
          expect(board.replays(d.solution!)).toBe(true);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(60);
  }, 20_000);

  test("a move the window allows is legal on the board, and blocks outside stand still", () => {
    const layout = fixedLayout([{ id: "r", x: 2, y: 2, w: 2, h: 1 }, { id: "v", x: 5, y: 2, w: 1, h: 2 }, { id: "far", x: 2, y: 6, w: 2, h: 1 }]);
    const board = new Board(layout);
    const win = new Window(board, { x: 0, y: 0, width: 6, height: 4 });
    expect(win.sliders.map((s) => s.id).sort()).toEqual(["r", "v"]);
    win.fill(win.start, 0);
    const moves: string[] = [];
    win.moves(win.start, 0, (i, to) => moves.push(`${win.sliders[i]!.id}>${to}`));
    // v straddles the window's bottom edge? No: rows 2-3 fit. It can go up to 0 or 1.
    expect(moves).toEqual(["r>3", "r>1", "r>0", "v>1", "v>0"]);
    expect(board.replays([win.move(win.index("r"), 2, 3)])).toBe(true);
  });
});
