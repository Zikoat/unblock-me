// Rooms in the world (the user's decisions of 2026-11-12): every world goal is a room stamped
// into the endless board where the goal is placed, from the library shipped with the game
// (src/rooms-library.json, made by the lab's lab/room-lib.ts) and the rooms this device made
// in the background (src/room-worker.ts). What a room is, and why its numbers hold wherever it
// goes: src/room-core.ts. A room goes on ground the player has never seen (the view and a
// margin round it, as tiles: src/main.ts markSeen), so a stamp never changes a cell they see or
// saw: the nearest such ground within SEEN_RADIUS. If none fits, the maker makes the goal.
//
// Pacing: which room comes next (pace, pickRooms). Rule, by n = world goals reached so far:
//  - The aim rises from AIM_FROM fewest moves to AIM_TO over RISE goals (about the old ramp),
//    with extra moves aimed at from none up to EXTRA_TO.
//  - Every SPIKE_EVERY goals (from SPIKE_FROM on) a spike: a room of SPIKE fewest moves or
//    more with SPIKE_EXTRA extra or more (an R11-like level: hard, maybe frustrating).
//  - The AFTER goals after a spike are easier: the aim less EASE moves, no extra wanted.
// The room picked is the unused one nearest the aim: |fewest - aim| + EXTRA_WEIGHT * |extra -
// aim's extra|, ties broken by the seed (so the same on every device with the same rooms).
import type { Point, Rect } from "./camera";
import type { Goal } from "./goal";
import { type Layout, randomLayout, type Stamp, type UiShown } from "./layout";
import { checkStamped, type Fill, transform } from "./room-core";
import { cellKinds, type Room } from "./room";
import library from "./rooms-library.json";
import type { Move } from "./rules";

export const LIBRARY = library as Room[];

export const PACING = { AIM_FROM: 5, AIM_TO: 11, RISE: 30, EXTRA_TO: 3, SPIKE_EVERY: 7, SPIKE_FROM: 6, SPIKE: 14, SPIKE_EXTRA: 5, AFTER: 2, EASE: 3, EXTRA_WEIGHT: 1.5 };

export type Pace = { fewest: number; extra: number; spike: boolean; easy: boolean };

/** What the n-th world goal (from 0) aims at. */
export function pace(n: number, P = PACING): Pace {
  const rise = Math.min(1, n / P.RISE);
  const aim = Math.round(P.AIM_FROM + (P.AIM_TO - P.AIM_FROM) * rise), extra = Math.round(P.EXTRA_TO * rise);
  const since = n >= P.SPIKE_FROM ? (n - P.SPIKE_FROM) % P.SPIKE_EVERY : -1;
  if (since === 0) return { fewest: Math.max(P.SPIKE, aim + 3), extra: P.SPIKE_EXTRA, spike: true, easy: false };
  if (since > 0 && since <= P.AFTER && n - since >= P.SPIKE_FROM) return { fewest: Math.max(P.AIM_FROM, aim - P.EASE), extra: 0, spike: false, easy: true };
  return { fewest: aim, extra, spike: false, easy: false };
}

const hash = (a: number, b: string) => {
  let h = a >>> 0 ^ 0x9e3779b9;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
};
/** A room's library id without its turn ("o6-3/5" -> "o6-3"). */
export const baseId = (id: string) => id.split("/")[0]!;

/** The rooms to try for the n-th world goal, best first (up to `count`): the device's own
 * rooms and the library's, those not used yet, nearest the aim; a spike takes only rooms that
 * reach it (else the hardest there are). Used ones come back only when all are used. */
export function pickRooms(pool: readonly Room[], used: ReadonlySet<string>, n: number, seed: number, count = 4, P = PACING): Room[] {
  const p = pace(n, P);
  let fresh = pool.filter((r) => !used.has(baseId(r.id)));
  if (fresh.length < count) fresh = [...pool];
  const cost = (r: Room) => {
    if (p.spike) return (r.f >= p.fewest && r.e >= p.extra ? 0 : 10) + Math.max(0, p.fewest - r.f) + P.EXTRA_WEIGHT * Math.max(0, p.extra - r.e);
    return Math.abs(r.f - p.fewest) + P.EXTRA_WEIGHT * Math.abs(r.e - p.extra);
  };
  // (The device's own rooms first among equals: the library is the fallback.)
  return fresh.map((r) => [r, cost(r) + 0.5 * hash(seed + n, r.id) - (r.id.startsWith("d") ? 0.75 : 0)] as const).sort((a, b) => a[1] - b[1]).slice(0, count).map((a) => a[0]);
}

export type RoomGoal = { goal: Goal; stamp: Stamp; fill: string; states: number };

/** Where a room may go: its box (with a cell round it) clear of blocks the player has moved
 * (where they started and where they are), of the cells `keepOut` covers (the island, the UI,
 * earlier targets, the view), of other rooms, and of every tile in `seen` (the player has seen
 * it: a stamp there would change blocks before their eyes, or blocks they remember). */
export type Ground = { moved: ReadonlyMap<string, Point>; layout: Layout; keepOut: readonly Rect[]; stamps: readonly Stamp[]; seen?: ReadonlySet<string> };

/** Seen ground is kept as tiles of SEEN_TILE x SEEN_TILE cells ("tx,ty"). */
export const SEEN_TILE = 8;
/** The tiles a rectangle of cells touches. */
export function tilesOf(r: Rect): string[] {
  const out: string[] = [];
  const x0 = Math.floor(r.x / SEEN_TILE), y0 = Math.floor(r.y / SEEN_TILE);
  const x1 = Math.floor((r.x + r.width - 1e-9) / SEEN_TILE), y1 = Math.floor((r.y + r.height - 1e-9) / SEEN_TILE);
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) out.push(`${tx},${ty}`);
  return out;
}
/** The cells a stamp can change: its box and a cell round it (a world block sticking into the
 * box goes, leaving its outside cell empty); nothing beyond (layout.ts stampParts). */
export const stampReach = (s: { x: number; y: number; room: { W: number; H: number } }): Rect => ({ x: s.x - 1, y: s.y - 1, width: s.room.W + 2, height: s.room.H + 2 });

function clear(box: Rect, g: Ground, taken: Set<string>): boolean {
  const pad = { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
  const hit = (r: Rect) => r.x < pad.x + pad.width && r.x + r.width > pad.x && r.y < pad.y + pad.height && r.y + r.height > pad.y;
  if (g.keepOut.some(hit)) return false;
  if (g.seen?.size && tilesOf(pad).some((t) => g.seen!.has(t))) return false;
  for (const s of g.stamps) if (hit({ x: s.x, y: s.y, width: s.room.W, height: s.room.H })) return false;
  for (let x = box.x; x < box.x + box.width; x++) for (let y = box.y; y < box.y + box.height; y++) if (taken.has(`${x},${y}`)) return false;
  return true;
}

/** The cells covered by moved blocks, where they started and where they are now. */
function movedCells(g: Ground): Set<string> {
  const taken = new Set<string>();
  for (const [id, p] of g.moved) {
    const home = g.layout.byId(id);
    if (!home) continue;
    for (const at of [home, p]) for (let x = at.x; x < at.x + home.w; x++) for (let y = at.y; y < at.y + home.h; y++) taken.add(`${x},${y}`);
  }
  return taken;
}

/** Offsets within `radius`, nearest first (the same order everywhere). */
const spirals = new Map<number, [number, number, number][]>();
function spiral(radius: number): [number, number, number][] {
  let spots = spirals.get(radius);
  if (spots) return spots;
  spots = [];
  for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) spots.push([dx * dx + dy * dy, dx, dy]);
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  spirals.set(radius, spots);
  return spots;
}
/** How far a room may go from the player: near when nothing is seen (tests), further when the
 * ground round the player has been seen (the nearest unseen ground is often past the view). */
export const RADIUS = 14, SEEN_RADIUS = 48;

/** The nearest place to `near` (within `radius` cells, box centre to it) where the room fits
 * on untouched, unseen ground, or null. Spirals out, so the same place on every device. */
export function placeFor(room: Room, near: Point, g: Ground, radius = g.seen?.size ? SEEN_RADIUS : RADIUS, taken = movedCells(g)): Point | null {
  const cx = Math.floor(room.W / 2), cy = Math.floor(room.H / 2);
  for (const [d2, dx, dy] of spiral(radius)) {
    if (d2 < 4) continue; // not right on the player
    const at = { x: near.x + dx - cx, y: near.y + dy - cy };
    if (clear({ x: at.x, y: at.y, width: room.W, height: room.H }, g, taken)) return at;
  }
  return null;
}

/** The goal of a room stamped at `at` as the k-th stamp, on the world `world` (the layout's
 * inputs, without this stamp): the world fills the room's free cells, and its reserved cells
 * too when the stamped room, measured with that fill (checkStamped, within `cap` states), is
 * still exact; else they stay empty and the room's own numbers and proof hold. */
export function stampGoal(room: Room, at: Point, k: number, world: { seed: number; tries: number; walls: number; ui: UiShown; rooms: readonly Stamp[] }, cap = 300_000): RoomGoal {
  const ids = room.b.map((_, i) => `room ${k} ${i}`);
  const box: Rect = { x: at.x, y: at.y, width: room.W, height: room.H };
  const inside = (b: { x: number; y: number; w: number; h: number }) => b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.width && b.y + b.h <= box.y + box.height;
  const fillOf = (layout: Layout): Fill[] =>
    layout.blocksIn(box).filter((b) => !b.id.startsWith("room ") && !b.ui && inside(b))
      .map((b) => ({ id: b.id, x: b.x - box.x, y: b.y - box.y, h: b.w > b.h ? 1 : 0, ...(b.wall && { wall: true }) }));
  /** The box's cells under blocks sticking out of it (UI blocks too). */
  const edgeOf = (layout: Layout): [number, number][] =>
    layout.blocksIn(box).filter((b) => !b.id.startsWith("room ") && (b.ui || !inside(b))).flatMap((b) => {
      const cs: [number, number][] = [];
      for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) if (x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height) cs.push([x - box.x, y - box.y]);
      return cs;
    });
  const make = (fill: Stamp["fill"]) => {
    const stamp: Stamp = { k, room, x: at.x, y: at.y, fill };
    return { stamp, layout: randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui, rooms: [...world.rooms, stamp] }) };
  };
  const kinds = cellKinds(room);
  const full = make(true);
  const fill = fillOf(full.layout);
  const cells = (f: Fill) => (f.wall ? [[f.x, f.y]] : f.h ? [[f.x, f.y], [f.x + 1, f.y]] : [[f.x, f.y], [f.x, f.y + 1]]) as [number, number][];
  const onReserved = fill.filter((f) => cells(f).some(([x, y]) => kinds[y * room.W + x] === "r"));
  // Nothing of the fill on a reserved cell: the fill changes nothing.
  if (!onReserved.length) return { goal: goalOf(room, full.stamp, full.layout, room.p.map(([i, x, y]) => [ids[i]!, x, y]), room.f, room.e, room.E, "none"), stamp: full.stamp, fill: "none", states: 0 };
  let states = 0;
  const measure = (m: ReturnType<typeof make>) => {
    const c = checkStamped(room, fillOf(m.layout), ids, cap, edgeOf(m.layout));
    states += c.states;
    return c;
  };
  // All of it; else as many of its blocks on reserved cells as stay exact, one at a time (the
  // rest of those cells left empty); else none.
  let c = measure(full);
  if (c.exact) return { goal: goalOf(room, full.stamp, full.layout, c.proof, c.fewest, c.extra, c.extraMax, "kept"), stamp: full.stamp, fill: "kept", states };
  const why = c.status;
  let kept: string[] = [], best: { m: ReturnType<typeof make>; c: typeof c } | null = null;
  for (const f of onReserved) {
    const m = make([...kept, f.id]);
    const t = measure(m);
    if (t.exact) ((kept = [...kept, f.id]), (best = { m, c: t }));
  }
  if (best) {
    const fillSaid = `part ${kept.length}/${onReserved.length} (${why})` as const;
    return { goal: goalOf(room, best.m.stamp, best.m.layout, best.c.proof, best.c.fewest, best.c.extra, best.c.extraMax, fillSaid), stamp: best.m.stamp, fill: fillSaid, states };
  }
  const bare = make(false);
  return { goal: goalOf(room, bare.stamp, bare.layout, room.p.map(([i, x, y]) => [ids[i]!, x, y]), room.f, room.e, room.E, `cleared ${why}`), stamp: bare.stamp, fill: `cleared ${why}`, states };
}

function goalOf(room: Room, st: Stamp, layout: Layout, proof: [string, number, number][], f: number, e: number, E: number, fill: string): Goal {
  const pos = new Map<string, Point>();
  const where = (id: string) => pos.get(id) ?? (({ x, y }) => ({ x, y }))(layout.byId(id)!);
  const solution: Move[] = proof.map(([id, x, y]) => {
    const from = where(id), to = { x: st.x + x, y: st.y + y };
    pos.set(id, to);
    return { id, from, to };
  });
  const red = `room ${st.k} 0`;
  return {
    id: red, target: { x: st.x + room.t[0], y: st.y + room.t[1] }, solution, start: { x: st.x + room.b[0]![0], y: st.y + room.b[0]![1] },
    difficulty: { moves: f, atLeast: f, searched: 0, branching: 2, score: f },
    room: { id: room.id, from: room.from, f, e, E, roomF: room.f, roomE: room.e, roomEMax: room.E, fill, k: st.k },
  };
}

/** The n-th world goal as a room: the rooms `pickRooms` gives, each turned the ways the seed
 * orders, at the nearest place it fits; null if none fits (the maker makes it then). */
export function roomGoal(pool: readonly Room[], n: number, near: Point, g: Ground, world: { seed: number; tries: number; walls: number; ui: UiShown }, cap?: number): (RoomGoal & { pace: Pace; tried: number }) | null {
  const used = new Set(g.stamps.map((s) => baseId(s.room.id)));
  const taken = movedCells(g);
  let tried = 0;
  for (const room of pickRooms(pool, used, n, world.seed)) {
    const turns = [...Array(8).keys()].sort((a, b) => hash(world.seed + n, `${room.id}/${a}`) - hash(world.seed + n, `${room.id}/${b}`));
    for (const s of turns.slice(0, 4)) {
      tried++;
      const r = transform(room, s);
      const at = placeFor(r, near, g, undefined, taken);
      if (!at) continue;
      const k = g.stamps.length ? Math.max(...g.stamps.map((x) => x.k)) + 1 : 0;
      return { ...stampGoal(r, at, k, { ...world, rooms: g.stamps }, cap), pace: pace(n), tried };
    }
  }
  return null;
}

