// Rooms: goals made ahead whose fewest and extra moves hold wherever they are put in the world
// (research/roadmap.md; the user's design of 2026-11-12). A room is a box of cells:
//  - set blocks: stamped exactly where the room says. The first `n` are the puzzle's (R, red
//    first): the blocks a shortest solution moves. The rest are keepers: blocks the bounds need
//    to stay exact (without them a shorter way opens), never moved by a shortest solution.
//  - walls: stamped 1x1 walls, for the same reason.
//  - reserved cells: empty at the start, swept by some shortest solution.
//  - free cells: every other cell of the box, and everything outside it. The world's own
//    generation fills them when the room is stamped (the room blends in, decoys come by
//    themselves).
// Exact, by two bounds on the room alone (open-core.ts's, with the unknown cells made safe):
//  - Upper (`solveFramed`): R moves; keepers, walls, free cells and everything outside are
//    walls. Its solutions sweep only R's own and reserved cells, so they are legal whatever
//    fills the free cells and whatever lies round the room.
//  - Lower (`solveSoft`): R moves exactly; keepers are soft (one move's toll the first time an R
//    block goes through one), walls are walls, free cells and everything outside are empty (a
//    filled cell can only add obstruction, so empty is the easiest fill there is).
// When both agree on the fewest and on the least and most extra moves, those hold in every
// fill and every surroundings (open-core.ts's argument: a real shortest solution maps onto a
// lower-bound one of the same length).
//
// The swept (reserved) cells may be filled too, once the room is stamped: then the fill's
// blocks there become part of the puzzle, and `checkStamped` measures the stamped box again,
// with the actual fill, by the same two bounds (the fill's blocks on reserved cells moving
// exactly, the rest soft or walls, everything outside the box empty or walls).
import { type Grid, type Piece } from "./extra-gen-core";
import { checkOpen, solveFramed, solveSoft, type SMove } from "./open-core";
import { cellKinds, cellsOf, laneAt, type RBlock, type Room } from "./room";

export { cellKinds, cellsOf, laneAt, type RBlock, type Room };

/** The two grids of the bounds: upper (free cells walls), lower (free cells empty). */
export function boundGrids(room: Room): { up: Grid; low: Grid } {
  const kinds = cellKinds(room), W = room.W, H = room.H;
  const pieces = room.b.map(piece), pos = room.b.map(laneAt);
  const low: Grid = { W, H, wall: new Uint8Array(W * H), pieces, pos };
  for (const [x, y] of room.w) low.wall[y * W + x] = 1;
  const up: Grid = { W, H, wall: low.wall.slice(), pieces, pos };
  kinds.forEach((k, c) => k === "f" && (up.wall[c] = 1));
  return { up, low };
}

export type Bounds = { exact: boolean; fewest: number; extra: number; extraMax: number; solution: [number, number, number][]; used: Uint8Array; states: number; status: string };

/** Both bounds on R's goal over two grids (the same blocks, in the same order): exact when they
 * agree. `cap`: states per search (a budget in work, the same on every device). */
export function bounds(up: Grid, low: Grid, R: number[], target: number, cap = 600_000): Bounds {
  const u = solveFramed(up, R, target, { cap, maxDepth: 40 });
  const fail = (status: string, states: number): Bounds => ({ exact: false, fewest: -1, extra: -1, extraMax: -1, solution: [], used: new Uint8Array(0), states, status });
  if (u.status !== "ok") return fail(`up ${u.status}`, u.states);
  const l = solveSoft(low, R, target, { bound: u.fewest, cap, atLeast: u.fewest });
  const states = u.states + l.states;
  if (l.status !== "ok") return fail(`low ${l.status}`, states);
  if (l.fewest !== u.fewest || l.extraMin !== u.extraMin || l.extraMax !== u.extraMax) return fail("apart", states);
  return { exact: true, fewest: u.fewest, extra: u.extraMin, extraMax: u.extraMax, solution: u.solution, used: usedCells(up, u.solution, R), states, status: "ok" };
}

/** The cells a solution's moves sweep (blocks given by board index). */
function usedCells(g: Grid, solution: [number, number, number][], _R: number[]): Uint8Array {
  const used = new Uint8Array(g.W * g.H);
  for (const [i, a, b] of solution) {
    const p = g.pieces[i]!;
    for (let j = Math.min(a, b); j <= Math.max(a, b) + 1; j++) used[p.h ? p.lane * g.W + j : j * g.W + p.lane] = 1;
  }
  return used;
}

/** Is the room exact as it says (fewest, extra and most extra)? Checked again from scratch. */
export function checkRoom(room: Room, cap = 600_000): Bounds {
  const { up, low } = boundGrids(room);
  const R = [...Array(room.n).keys()];
  return bounds(up, low, R, laneAt([room.t[0], room.t[1], room.b[0]![2]]), cap);
}

/** The cells every shortest solution of the upper bound sweeps, on the room's grid (every
 * shortest solution, from `solve`'s used cells). */
export function sweptCells(room: Room, cap = 600_000): Uint8Array | null {
  const { up } = boundGrids(room);
  const R = [...Array(room.n).keys()];
  const s = solveFramed(up, R, laneAt([room.t[0], room.t[1], room.b[0]![2]]), { cap, maxDepth: 40 });
  if (s.status !== "ok") return null;
  // solveFramed's grid holds R only, in R's order, on the same cells.
  return s.used;
}

/** A shortest solution as moves of the room's blocks (block index, to cell). */
export function proofOf(g: Grid, solution: [number, number, number][]): [number, number, number][] {
  return solution.map(([i, , to]) => {
    const p = g.pieces[i]!;
    return p.h ? [i, to, p.lane] : [i, p.lane, to];
  });
}

export const piece = (b: RBlock): Piece => (b[2] ? { h: true, lane: b[1] } : { h: false, lane: b[0] });

// --- Symmetries: the 8 ways to turn and mirror a room; each is the same puzzle, exactly. ---

/** Turned or mirrored: `s` in 0..7 (bit 1 mirror x, bit 2 mirror y, bit 4 swap x and y). */
export function transform(room: Room, s: number): Room {
  if (!s) return room;
  const swap = !!(s & 4);
  const W2 = swap ? room.H : room.W, H2 = swap ? room.W : room.H;
  const cell = ([x, y]: [number, number]): [number, number] => {
    let a = s & 1 ? room.W - 1 - x : x, b = s & 2 ? room.H - 1 - y : y;
    if (swap) [a, b] = [b, a];
    return [a, b];
  };
  const blk = (b: RBlock): RBlock => {
    const cs = cellsOf(b).map(cell);
    const x = Math.min(cs[0]![0], cs[1]![0]), y = Math.min(cs[0]![1], cs[1]![1]);
    return [x, y, cs[0]![1] === cs[1]![1] ? 1 : 0];
  };
  const red = room.b[0]!;
  const at = (i: number, x: number, y: number): [number, number] => {
    const b = blk([x, y, room.b[i]![2]]);
    return [b[0], b[1]];
  };
  return {
    ...room, id: `${room.id}/${s}`, W: W2, H: H2,
    b: room.b.map(blk), w: room.w.map(cell), r: room.r.map(cell),
    t: at(0, room.t[0], room.t[1]),
    p: room.p.map(([i, x, y]) => [i, ...at(i, x, y)] as [number, number, number]),
    ...(red && {}),
  };
}

// --- Making rooms (offline in the lab, and in the background on the device). ---

/** A room from a board: R (board indices, red first) and `keep` (other blocks stamped as
 * keepers), walls, red's target lane position; reserved = every empty cell; checked. */
export function roomOf(g: Grid, R: number[], keep: number[], target: number, id: string, cap = 600_000): Room | null {
  const blk = (i: number): RBlock => {
    const p = g.pieces[i]!, at = g.pos[i]!;
    return p.h ? [at, p.lane, 1] : [p.lane, at, 0];
  };
  const b = [...R, ...keep].map(blk);
  const occ = new Uint8Array(g.W * g.H);
  for (const x of b) for (const [cx, cy] of cellsOf(x)) occ[cy * g.W + cx] = 1;
  const w: [number, number][] = [], r: [number, number][] = [];
  for (let c = 0; c < g.W * g.H; c++) {
    const xy: [number, number] = [c % g.W, Math.floor(c / g.W)];
    if (g.wall[c]) w.push(xy);
    else if (!occ[c]) r.push(xy);
  }
  const red = g.pieces[R[0]!]!;
  const t: [number, number] = red.h ? [target, red.lane] : [red.lane, target];
  const room: Room = { id, W: g.W, H: g.H, b, n: R.length, w, r, t, f: 0, e: 0, E: 0, p: [] };
  return settle(room, cap);
}

/** The room's numbers and proof from its bounds, its reserved cells cut to those a shortest
 * solution sweeps, and its box to what is set or reserved; null if its bounds disagree. */
export function settle(room: Room, cap = 600_000): Room | null {
  const c = checkRoom(room, cap);
  if (!c.exact) return null;
  const swept = sweptCells(room, cap);
  if (!swept) return null;
  const { up } = boundGrids(room);
  const r = room.r.filter(([x, y]) => swept[y * room.W + x]);
  const out = trim({ ...room, r, f: c.fewest, e: c.extra, E: c.extraMax, p: proofOf(up, c.solution) });
  // Cutting reserved cells to the swept ones only walls off cells no shortest solution uses
  // in the upper bound, and the box only drops free cells: the bounds stay; checked anyway.
  const again = checkRoom(out, cap);
  return again.exact && again.fewest === out.f && again.extra === out.e && again.extraMax === out.E ? out : null;
}

/** The box cut to its set blocks, walls and reserved cells. */
export function trim(room: Room): Room {
  const xs: number[] = [], ys: number[] = [];
  for (const b of room.b) for (const [x, y] of cellsOf(b)) (xs.push(x), ys.push(y));
  for (const [x, y] of [...room.w, ...room.r]) (xs.push(x), ys.push(y));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const mv = ([x, y]: [number, number]): [number, number] => [x - x0, y - y0];
  return {
    ...room, W: x1 - x0 + 1, H: y1 - y0 + 1,
    b: room.b.map(([x, y, h]) => [x - x0, y - y0, h] as RBlock), w: room.w.map(mv), r: room.r.map(mv), t: mv(room.t),
    p: room.p.map(([i, x, y]) => [i, x - x0, y - y0] as [number, number, number]),
  };
}

/** Fewer set things: each keeper and each wall in turn (`order` picks the order), dropped
 * (its cells free) if the room stays exact with the same numbers. Stops at `budget` states. */
export function thin(room: Room, next: () => number, budget = 30_000_000, cap = 600_000): { room: Room; states: number } {
  let cur = room, spent = 0;
  const steps = [
    ...cur.w.map(([x, y]) => `w${x},${y}`),
    ...cur.b.slice(cur.n).map(([x, y, h]) => `k${x},${y},${h}`),
  ].map((s) => [s, next()] as const).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  const without = (keys: Set<string>): Room => ({
    ...cur,
    w: cur.w.filter(([a, b]) => !keys.has(`w${a},${b}`)),
    b: cur.b.filter((b, i) => i < cur.n || !keys.has(`k${b[0]},${b[1]},${b[2]}`)),
  });
  const tryDrop = (keys: string[]): boolean => {
    if (spent > budget || !keys.length) return false;
    const x = without(new Set(keys));
    const c = checkRoom(x, cap);
    spent += c.states;
    if (c.exact && c.fewest === cur.f && c.extra === cur.e && c.extraMax === cur.E) return ((cur = x), true);
    return false;
  };
  // Halves first (most of a window's world can often go at once), then one by one.
  const split = (keys: string[]) => {
    if (keys.length === 0 || tryDrop(keys) || keys.length === 1) return;
    const h = keys.length >> 1;
    split(keys.slice(0, h));
    split(keys.slice(h));
  };
  split(steps);
  return { room: trim(cur), states: spent };
}

/** The room as a walled square: a library room (C x C, every goal exact on the square) with a
 * ring of walls round it; exact (sealed). Then thinned (`thin`): ring walls given up where the
 * bounds allow. */
export function walledRoom(C: number, pieces: Piece[], pos: number[], walls: number[], red: number, target: number, id: string): Room | null {
  const S = C + 2;
  const g: Grid = { W: S, H: S, wall: new Uint8Array(S * S), pieces: [], pos: [] };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (x === 0 || y === 0 || x === S - 1 || y === S - 1) g.wall[y * S + x] = 1;
  for (const c of walls) g.wall[(Math.floor(c / C) + 1) * S + (c % C) + 1] = 1;
  const order = [red, ...pieces.keys()].filter((i, k) => k === 0 || i !== red);
  for (const i of order) (g.pieces.push({ h: pieces[i]!.h, lane: pieces[i]!.lane + 1 }), g.pos.push(pos[i]! + 1));
  // Blocks no shortest solution moves are keepers, not R (they are stamped either way).
  const all = [...g.pieces.keys()];
  const s = solveFramed(g, all, target + 1, { cap: 600_000, maxDepth: 40 });
  if (s.status !== "ok") return null;
  const movedSet = new Set(s.solution.map(([i]) => i));
  // (Every shortest solution's blocks would be best; one solution's, plus red, is a start: the
  // check below decides.)
  const R = [0, ...all.filter((i) => i && movedSet.has(i))], keep = all.filter((i) => i && !movedSet.has(i));
  return roomOf(g, R, keep, target + 1, id) ?? roomOf(g, all, [], target + 1, id);
}

// --- Stamped: the room in the world, with the world's fill, measured again. ---

/** A block of the fill on the stamped box: x, y in the box, horizontal or not, its id. */
export type Fill = { id: string; x: number; y: number; h: 0 | 1; wall?: boolean };

export type Stamped = { exact: boolean; fewest: number; extra: number; extraMax: number; proof: [string, number, number][]; states: number; status: string; inR: string[] };

/**
 * The stamped room measured with its actual fill. Once stamped on untouched ground the box's
 * contents are known exactly: `fill`, the world's blocks and walls wholly inside it, and `edge`,
 * the box's cells under world blocks that stick out of it. R is the room's R and every fill
 * block on a reserved cell (they move exactly); the other blocks are frozen in the upper bound
 * and soft in the lower; the edge's cells are walls in the upper and empty in the lower; empty
 * cells are empty in both; outside the box, walls in the upper and empty in the lower. So the
 * upper bound's solutions are legal on the board as stamped, whatever lies round the box, and
 * the lower bound is the open-core one: when they agree the numbers are exact. The proof's
 * moves are by id, to the box's cells.
 */
export function checkStamped(room: Room, fill: Fill[], ids: string[], cap = 400_000, edge: [number, number][] = [], all = false): Stamped {
  const W = room.W, H = room.H, kinds = cellKinds(room);
  const low: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  for (const [x, y] of room.w) low.wall[y * W + x] = 1;
  const names: string[] = [];
  const add = (b: RBlock, id: string) => (low.pieces.push(piece(b)), low.pos.push(laneAt(b)), names.push(id));
  room.b.forEach((b, i) => add(b, ids[i]!));
  const R = [...Array(room.n).keys()];
  const inR: string[] = [];
  for (const f of fill) {
    if (f.wall) { low.wall[f.y * W + f.x] = 1; continue; }
    const b: RBlock = [f.x, f.y, f.h];
    if (all || cellsOf(b).some(([x, y]) => kinds[y * W + x] === "r")) (R.push(low.pieces.length), inR.push(f.id));
    add(b, f.id);
  }
  const up: Grid = { W, H, wall: low.wall.slice(), pieces: low.pieces, pos: low.pos };
  for (const [x, y] of edge) up.wall[y * W + x] = 1;
  const red = room.b[0]!;
  const c = bounds(up, low, R, laneAt([room.t[0], room.t[1], red[2]]), cap);
  const proof = c.exact ? proofOf(up, c.solution).map(([i, x, y]) => [names[i]!, x, y] as [string, number, number]) : [];
  return { exact: c.exact, fewest: c.fewest, extra: c.extra, extraMax: c.extraMax, proof, states: c.states, status: c.status, inR };
}

const rb = (g: Grid, i: number): RBlock => {
  const p = g.pieces[i]!, at = g.pos[i]!;
  return p.h ? [at, p.lane, 1] : [p.lane, at, 0];
};

export type { SMove };
export { checkOpen };
