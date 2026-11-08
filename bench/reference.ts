// The Reference maker (reports/goal-spec.md): the simplest maker that meets the spec, plain
// and slow. Written to the spec, not from today's maker:
//
// 1. The candidate red blocks: the sliding blocks nearest where the player is (the last red
//    block on its target, or the origin), within REFERENCE.radius cells.
// 2. For each, a breadth-first search over the boards of a window round its lane, in which
//    only the blocks that can matter slide (those crossing its lane, and those crossing
//    theirs); everything else stands still, so every move found is a move on the real board.
//    Breadth first, the first board on which red stands somewhere new is the fewest moves
//    (within the window) to get it there: every red position reached is a candidate goal,
//    with a shortest solution as its proof.
// 3. Every candidate is scored by the Judge; the fittest wins, ties broken by a hash of the
//    Request's seed.
//
// Its work is bounded by boards searched, never by time, so it is deterministic.
import { isFixed, type Board } from "../src/board";
import type { Point } from "../src/camera";
import { playerCells, requestBoard, type Goal, type Maker, type Move, type Request } from "../src/contract";
import { judge } from "../src/judge";

export type ReferenceOptions = { candidates: number; radius: number; along: number; across: number; levels: number[]; states: number };
export const REFERENCE: ReferenceOptions = {
  /** Candidate red blocks tried, nearest first, and how far from the player they may be. */
  candidates: 8,
  radius: 6,
  /** The window: cells beyond red's ends along its lane, and lanes either side of it. */
  along: 8,
  across: 3,
  /** Which blocks slide, one search for each: red and those crossing its lane (1), and also
   * those crossing theirs (2). Fewer sliding blocks search deeper, more find more ways. */
  levels: [1, 2],
  /** Boards each breadth-first search may visit. */
  states: 60_000,
};

/** A sliding block in the window: its lane (y for a horizontal one, x for a vertical, in
 * window cells), its length and where it starts along its lane. */
type Slider = { id: string; hz: boolean; line: number; size: number; at: number };

export function referenceMaker(options: Partial<ReferenceOptions> = {}): Maker {
  return (request) => reference(request, { ...REFERENCE, ...options });
}

export function reference(request: Request, options: ReferenceOptions = REFERENCE): Goal | null {
  const board = requestBoard(request);
  let best: { goal: Goal; fitness: number; tie: number } | null = null;
  for (const goal of referenceGoals(request, board, options)) {
    const fitness = judge(request, goal, { board }).fitness;
    const tie = hash(`${request.seed} ${goal.red} ${goal.target.x},${goal.target.y}`);
    if (!best || fitness > best.fitness || (fitness === best.fitness && tie < best.tie)) best = { goal, fitness, tie };
  }
  return best?.goal ?? null;
}

/** Every goal the Reference weighs (steps 1 and 2), before the Judge picks one. */
export function* referenceGoals(request: Request, board: Board, options: ReferenceOptions = REFERENCE): Generator<Goal> {
  for (const red of candidates(request, board, options)) for (const levels of options.levels) yield* reachable(board, red, levels, options);
}

/** The sliding blocks (not the island's) within `radius` cells of the player, nearest first. */
function candidates(request: Request, board: Board, { candidates, radius }: ReferenceOptions): string[] {
  const p = playerCells(request, board), found = new Map<string, number>();
  for (let x = p.x - radius; x < p.x + p.w + radius; x++) {
    for (let y = p.y - radius; y < p.y + p.h + radius; y++) {
      const id = board.at(x, y);
      if (id === null || found.has(id)) continue;
      const b = board.block(id);
      if (isFixed(b) || b.island) continue;
      const gap = Math.max(0, p.x - (b.x + b.w - 1), b.x - (p.x + p.w - 1)) + Math.max(0, p.y - (b.y + b.h - 1), b.y - (p.y + p.h - 1));
      if (gap <= radius) found.set(id, gap);
    }
  }
  return [...found].sort(([a, ga], [b, gb]) => ga - gb || (a < b ? -1 : 1)).slice(0, candidates).map(([id]) => id);
}

/** Every position `red` can reach in its window (with `levels` of blocks sliding), each with a shortest solution (within the
 * window), by breadth-first search. */
function reachable(board: Board, red: string, levels: number, { along, across, states }: ReferenceOptions): Goal[] {
  const r = board.block(red), hz = r.w > r.h;
  // The window, in board cells: red's lane `along` beyond each end, `across` lanes each side.
  const x0 = hz ? r.x - along : r.x - across, y0 = hz ? r.y - across : r.y - along;
  const W = hz ? r.w + 2 * along : 2 * across + 1, H = hz ? 2 * across + 1 : r.h + 2 * along;
  const inside = (b: { x: number; y: number; w: number; h: number }) => b.x >= x0 && b.y >= y0 && b.x + b.w <= x0 + W && b.y + b.h <= y0 + H;
  // The blocks wholly inside the window, by id.
  const blocks = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (let x = x0; x < x0 + W; x++) for (let y = y0; y < y0 + H; y++) {
    const id = board.at(x, y);
    if (id !== null && !blocks.has(id)) blocks.set(id, board.block(id));
  }
  // Which slide: red, the blocks crossing its lane, and (levels 2) the blocks crossing theirs.
  const slides = (b: { x: number; y: number; w: number; h: number }, id: string) => inside(b) && !isFixed(board.block(id));
  const lane = (id: string) => {
    const b = blocks.get(id)!;
    const cells: Point[] = [];
    if (b.w > b.h) for (let x = x0; x < x0 + W; x++) cells.push({ x, y: b.y });
    else for (let y = y0; y < y0 + H; y++) cells.push({ x: b.x, y });
    return cells;
  };
  const mobile = new Set([red]);
  let level = [red];
  for (let depth = 0; depth < levels; depth++) {
    const next: string[] = [];
    for (const id of level) for (const c of lane(id)) {
      const o = board.at(c.x, c.y);
      if (o !== null && !mobile.has(o) && blocks.has(o) && slides(blocks.get(o)!, o)) {
        mobile.add(o);
        next.push(o);
      }
    }
    level = next;
  }
  // The window as a grid: 1 where something stands still (or the window ends), 0 elsewhere.
  const sliders: Slider[] = [...mobile].sort().map((id) => {
    const b = blocks.get(id)!, h = b.w > b.h;
    return { id, hz: h, line: h ? b.y - y0 : b.x - x0, size: h ? b.w : b.h, at: h ? b.x - x0 : b.y - y0 };
  });
  const still = new Uint8Array(W * H);
  for (const [id, b] of blocks) {
    if (mobile.has(id)) continue;
    for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) if (x >= x0 && y >= y0 && x < x0 + W && y < y0 + H) still[(y - y0) * W + (x - x0)] = 1;
  }
  const ri = sliders.findIndex((s) => s.id === red);

  // Breadth first: each board is its sliders' positions, kept as a string; the queue is the
  // list of boards found, with the board and move each was reached from.
  const start = sliders.map((s) => s.at);
  const seen = new Map<string, number>([[String.fromCharCode(...start), 0]]);
  const found: { state: number[]; parent: number; slider: number }[] = [{ state: start, parent: -1, slider: -1 }];
  const reached = new Map<number, number>([[start[ri]!, 0]]); // red's position -> board
  const grid = new Int16Array(W * H);
  for (let i = 0; i < found.length && found.length < states; i++) {
    const { state } = found[i]!;
    grid.set(still);
    sliders.forEach((s, k) => {
      for (let q = 0; q < s.size; q++) grid[s.hz ? s.line * W + state[k]! + q : (state[k]! + q) * W + s.line] = 1;
    });
    for (const [k, s] of sliders.entries()) {
      const limit = s.hz ? W : H;
      for (const dir of [-1, 1]) {
        for (let to = state[k]! + dir; to >= 0 && to + s.size <= limit; to += dir) {
          const cell = dir > 0 ? to + s.size - 1 : to; // the cell it moves into
          if (grid[s.hz ? s.line * W + cell : cell * W + s.line]) break;
          const child = state.slice();
          child[k] = to;
          const key = String.fromCharCode(...child);
          if (seen.has(key)) continue;
          seen.set(key, found.length);
          found.push({ state: child, parent: i, slider: k });
          if (!reached.has(child[ri]!)) reached.set(child[ri]!, found.length - 1);
        }
      }
    }
  }

  // Each red position reached (but where it is) is a goal, its moves read back up the parents.
  const world = (s: Slider, at: number): Point => (s.hz ? { x: x0 + at, y: y0 + s.line } : { x: x0 + s.line, y: y0 + at });
  const goals: Goal[] = [];
  for (const [p, j] of reached) {
    if (j === 0) continue;
    const moves: Move[] = [];
    for (let i = j; found[i]!.parent >= 0; i = found[i]!.parent) {
      const { state, parent, slider } = found[i]!, s = sliders[slider]!;
      moves.push({ block: s.id, from: world(s, found[parent]!.state[slider]!), to: world(s, state[slider]!) });
    }
    goals.push({ red, target: world(sliders[ri]!, p), moves: moves.reverse() });
  }
  return goals;
}

/** FNV-1a: a deterministic tie-breaker. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
