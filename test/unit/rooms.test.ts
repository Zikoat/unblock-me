// Rooms (src/room-core.ts, src/rooms.ts): a room's numbers hold whatever fills its free cells and
// whatever lies round it (checked against a plain exact search of the whole window); a room
// measured again with its reserved cells filled agrees with that search too; turned rooms keep
// their numbers; a room is placed on untouched ground only, the same way every time, and its
// goal passes the Referee on the stamped board; with no ground for it, there is no room goal. A
// room lands just off screen, near the player; a far one, or a spike, is reached through travel
// goals (src/travel.ts).
import { expect, test } from "bun:test";
import { bestGoal, type Grid, randomRoom, rng, solve } from "../../src/extra-gen-core";
import { checkRoom, checkStamped, type Fill, thin, transform, walledRoom } from "../../src/room-core";
import { cellKinds, cellsOf, laneAt, type Room } from "../../src/room";
import { dist, FILL_BUDGET, LIBRARY, pace, pickRooms, roomGoal, type Screen, stampReach, TRAVEL_AIM } from "../../src/rooms";
import { roomOrTravel, travelGoal } from "../../src/travel";
import { randomLayout, type Stamp } from "../../src/layout";
import { makeRoom } from "../../src/room-make";
import { contractGoal, gameRequest } from "../../src/contract";
import { referee } from "../../src/referee";

/** A few small rooms made the way the device makes them. */
function rooms(count: number, seed: number): Room[] {
  const next = rng(seed), out: Room[] = [];
  for (let t = 0; out.length < count && t < 200; t++) {
    const g = randomRoom(5, 5, 7 + Math.floor(next() * 3), 0, next);
    const b = bestGoal(g, 4, 9, "high", 60_000);
    if (!b) continue;
    const r = walledRoom(5, g.pieces, g.pos, [], b.red, b.target, `t${t}`);
    if (r) out.push(thin(r, next, 3_000_000).room);
  }
  return out;
}
const made = rooms(4, 7);

/** The room in a window with `m` cells round it, its free cells and surroundings filled at
 * random (and its reserved cells too with `onReserved`), the window's edge a wall; the true
 * fewest and extra moves by a plain search with every block moving. */
function filled(room: Room, next: () => number, m: number, onReserved: boolean) {
  const W = room.W + 2 * m, H = room.H + 2 * m, kinds = cellKinds(room);
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  const occ = new Uint8Array(W * H);
  for (const [x, y] of room.w) ((g.wall[(y + m) * W + x + m] = 1), (occ[(y + m) * W + x + m] = 1));
  for (const b of room.b) {
    for (const [x, y] of cellsOf(b)) occ[(y + m) * W + x + m] = 1;
    g.pieces.push(b[2] ? { h: true, lane: b[1] + m } : { h: false, lane: b[0] + m });
    g.pos.push(laneAt(b) + m);
  }
  const fill: Fill[] = [];
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || occ[y * W + x]) return false;
    const lx = x - m, ly = y - m, inBox = lx >= 0 && ly >= 0 && lx < room.W && ly < room.H;
    return !inBox || kinds[ly * room.W + lx] === "f" || (onReserved && kinds[ly * room.W + lx] === "r");
  };
  for (let t = 0; t < W * H; t++) {
    const x = Math.floor(next() * W), y = Math.floor(next() * H), h = next() < 0.5;
    const [x2, y2] = h ? [x + 1, y] : [x, y + 1];
    if (!ok(x, y) || !ok(x2, y2)) continue;
    occ[y * W + x] = occ[y2 * W + x2] = 1;
    g.pieces.push(h ? { h: true, lane: y } : { h: false, lane: x });
    g.pos.push(h ? x : y);
    const lx = x - m, ly = y - m;
    if (lx >= 0 && ly >= 0 && x2 - m < room.W && y2 - m < room.H) fill.push({ id: `f${g.pieces.length}`, x: lx, y: ly, h: h ? 1 : 0 });
  }
  const red = room.b[0]!, target = (red[2] ? room.t[0] : room.t[1]) + m;
  return { truth: solve(g, 0, target, { cap: 400_000, maxDepth: 40 }), fill };
}

test("a room's numbers hold in any fill and surroundings", () => {
  expect(made.length).toBeGreaterThan(2);
  const next = rng(3);
  let checked = 0;
  for (const room of made) {
    expect(checkRoom(room).exact).toBe(true);
    for (let k = 0; k < 6; k++) {
      const { truth } = filled(room, next, 2, false);
      if (truth.status !== "ok") continue;
      checked++;
      expect([room.id, truth.fewest, truth.extraMin, truth.extraMax]).toEqual([room.id, room.f, room.e, room.E]);
    }
  }
  expect(checked).toBeGreaterThan(10);
}, 120_000);

test("filled reserved cells: the stamped measure agrees with a plain search", () => {
  const next = rng(5);
  let agreed = 0;
  for (const room of made) for (let k = 0; k < 6; k++) {
    // The fill's blocks wholly in the box; outside it, nothing (the bounds treat it as anything).
    const { truth, fill } = filled(room, next, 0, true);
    const c = checkStamped(room, fill, room.b.map((_, i) => `room 0 ${i}`));
    if (!c.exact || truth.status !== "ok") continue;
    agreed++;
    expect([truth.fewest, truth.extraMin, truth.extraMax]).toEqual([c.fewest, c.extra, c.extraMax]);
  }
  expect(agreed).toBeGreaterThan(3);
}, 60_000);

test("a turned room is the same puzzle", () => {
  const room = made[0]!;
  for (let s = 0; s < 8; s++) {
    const c = checkRoom(transform(room, s));
    expect([s, c.exact, c.fewest, c.extra, c.extraMax]).toEqual([s, true, room.f, room.e, room.E]);
  }
});

test("the shipped library's rooms are exact as they say", () => {
  expect(LIBRARY.length).toBeGreaterThan(30);
  for (const room of LIBRARY.filter((_, i) => i % 9 === 0)) {
    const c = checkRoom(room, 2_000_000);
    expect([room.id, c.exact, c.fewest, c.extra, c.extraMax]).toEqual([room.id, true, room.f, room.e, room.E]);
  }
}, 120_000);

test("pacing: rising, a spike now and then, easier after it", () => {
  expect(pace(0).fewest).toBeLessThanOrEqual(5);
  expect(pace(29).fewest).toBeGreaterThan(pace(1).fewest);
  const spikes = [...Array(40).keys()].filter((n) => pace(n).spike);
  expect(spikes.length).toBeGreaterThan(3);
  for (const n of spikes) expect(pace(n + 1).fewest).toBeLessThan(pace(n).fewest);
  const picked = pickRooms(LIBRARY, new Set(), spikes[1]!, 1);
  expect(picked[0]!.f).toBeGreaterThanOrEqual(12);
});

const world = { seed: 42, tries: 12, walls: 0.04, ui: { fullscreen: true, debug: false, island: false } };
test("a room goes on untouched ground, the same way every time, and its proof is legal", () => {
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui });
  // Blocks moved round the player: the room keeps off them.
  const near = { x: 40, y: 40 };
  const moved = new Map(layout.blocksIn({ x: 36, y: 36, width: 9, height: 9 }).filter((b) => !b.wall).slice(0, 12).map((b) => [b.id, { x: b.x, y: b.y }] as const));
  const ground = { moved, layout, keepOut: [], stamps: [] as Stamp[] };
  const a = roomGoal(LIBRARY, 3, near, ground, world)!, b = roomGoal(LIBRARY, 3, near, ground, world)!;
  expect(a).not.toBeNull();
  expect(JSON.stringify(a.goal)).toBe(JSON.stringify(b.goal));
  const box = { x: a.stamp.x, y: a.stamp.y, w: a.stamp.room.W, h: a.stamp.room.H };
  for (const [id, p] of moved) {
    const home = layout.byId(id)!;
    for (const at of [home, p]) expect(at.x + home.w <= box.x || at.x >= box.x + box.w || at.y + home.h <= box.y || at.y >= box.y + box.h).toBe(true);
  }
  const request = gameRequest({ ...world, moved, done: [], rooms: [a.stamp] });
  expect(referee(request, contractGoal(a.goal))).toEqual({ ok: true });
  expect(a.goal.solution.length).toBe(a.goal.room!.f);
});

test("a stamp's fill checks stay within their budget, and its goal is still legal", () => {
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui });
  for (let i = 0; i < 16; i++) {
    const near = { x: 20 + 17 * i, y: -30 + 11 * i }, ground = { moved: new Map(), layout, keepOut: [], stamps: [] as Stamp[] };
    const a = roomGoal(LIBRARY, i + 5, near, ground, world)!;
    // (Each check's two searches may each reach what is left of it.)
    expect(a.states).toBeLessThanOrEqual(2 * FILL_BUDGET);
    expect(referee(gameRequest({ ...world, moved: new Map(), done: [], rooms: [a.stamp] }), contractGoal(a.goal))).toEqual({ ok: true });
  }
}, 60_000);

test("no ground for a room: no room goal (the maker makes it)", () => {
  const layout = randomLayout(1, { tries: 12 });
  const ground = { moved: new Map(), layout, keepOut: [{ x: -100, y: -100, width: 200, height: 200 }], stamps: [] };
  expect(roomGoal(LIBRARY, 0, { x: 0, y: 0 }, ground, world)).toBeNull();
});

test("a device's room k is the same room everywhere, and exact", () => {
  const a = makeRoom(0), b = makeRoom(0);
  expect(a.room).not.toBeNull();
  expect(JSON.stringify(a.room)).toBe(JSON.stringify(b.room));
  const c = checkRoom(a.room!);
  expect([c.exact, c.fewest, c.extra]).toEqual([true, a.room!.f, a.room!.e]);
}, 60_000);

test("a device's room maker stopped part way goes on from its last failed try to the same room", () => {
  const failed: number[] = [];
  const whole = makeRoom(4, 30, 1, (t) => failed.push(t));
  expect(whole.tries).toBeGreaterThan(1);
  expect(failed).toEqual([...Array(whole.tries - 1).keys()].map((i) => i + 1));
  expect(JSON.stringify(makeRoom(4, 30, whole.tries).room)).toBe(JSON.stringify(whole.room));
}, 60_000);

const cells = (l: ReturnType<typeof randomLayout>, r: { x: number; y: number; width: number; height: number }) => {
  const m = new Map<string, string>();
  for (const b of l.blocksIn(r)) for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) m.set(`${x},${y}`, b.id);
  return m;
};
/** The cells in `r` stamping these rooms changes. */
function changed(stamps: Stamp[], r: { x: number; y: number; width: number; height: number }, before: Stamp[] = []) {
  const a = cells(randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui, rooms: before }), r);
  const b = cells(randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui, rooms: [...before, ...stamps] }), r);
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => {
    const [x, y] = k.split(",").map(Number) as [number, number];
    return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height && a.get(k) !== b.get(k);
  });
}
const grow = (r: { x: number; y: number; width: number; height: number }, m: number) => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m });
// A phone's view (7 x 14 cells) round the player, and its screen as src/main.ts screenOf has it.
const phone = (near: { x: number; y: number }) => ({ x: near.x - 3.5, y: near.y - 7, width: 7, height: 14 });
const screen: Screen = { step: 11, far: 14 };

test("a room lands near the player, just off screen: nothing in view changes, nothing beyond its reach", () => {
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui });
  const near = { x: 40, y: 40 }, view = phone(near);
  const blind = roomGoal(LIBRARY, 3, near, { moved: new Map(), layout, keepOut: [], stamps: [] }, world)!;
  expect(changed([blind.stamp], view).length).toBeGreaterThan(0); // (the bug: placed in view)
  const ground = { moved: new Map(), layout, keepOut: [grow(view, 2)], stamps: [] as Stamp[] };
  const made = roomOrTravel(LIBRARY, 3, near, ground, world, screen, { exclude: new Set(), avoid: [] })!;
  const a = made.goal;
  expect(a.room).toBeDefined();
  expect(a.travel).toBeUndefined();
  const again = roomOrTravel(LIBRARY, 3, near, ground, world, screen, { exclude: new Set(), avoid: [] })!.goal;
  expect(JSON.stringify({ ...a, room: { ...a.room, ms: 0 } })).toBe(JSON.stringify({ ...again, room: { ...again.room, ms: 0 } })); // (the same everywhere)
  // Near: its red block within a screen of the player (before: the nearest unseen ground, 16 to
  // 26 cells away in play), its box off the view.
  expect(dist(near, a.start!)).toBeLessThanOrEqual(screen.far);
  expect(changed([a.stamp!], view)).toEqual([]);
  const all = changed([a.stamp!], { x: near.x - 80, y: near.y - 80, width: 160, height: 160 }), reach = stampReach(a.stamp!);
  expect(all.length).toBeGreaterThan(0);
  for (const k of all) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    expect(x >= reach.x && y >= reach.y && x < reach.x + reach.width && y < reach.y + reach.height).toBe(true);
  }
  expect(referee(gameRequest({ ...world, moved: new Map(), done: [], rooms: [a.stamp!] }), contractGoal(a))).toEqual({ ok: true });
});

/** Plays the travel goals from `near` to the room `first` stamps, by their proofs, until the
 * player is within a screen of it; then its goal on the board as it is. */
function travel(first: ReturnType<typeof roomOrTravel> & {}, near: { x: number; y: number }, view: { x: number; y: number; width: number; height: number }) {
  const stamp = first.goal.stamp!, room = first.goal.then!;
  // Stamped off screen: nothing in view changes.
  expect(changed([stamp], view)).toEqual([]);
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui, rooms: [stamp] });
  const moved = new Map<string, { x: number; y: number }>(), done: { id: string; target: { x: number; y: number } }[] = [];
  const legs: number[] = [];
  let goal = first.goal, from = near;
  for (let i = 0; i < 8; i++) {
    expect(goal.travel).toBeDefined();
    expect(goal.solution.length).toBeLessThanOrEqual(TRAVEL_AIM + 3); // (short)
    expect(referee(gameRequest({ ...world, moved, done, rooms: [stamp] }), contractGoal(goal))).toEqual({ ok: true });
    for (const m of goal.solution) moved.set(m.id, m.to);
    done.push(goal);
    legs.push(Math.round(dist(from, goal.target)));
    from = goal.target;
    if (dist(from, room.start!) <= screen.far) break;
    goal = travelGoal(layout, from, room.start!, screen, { moved, exclude: new Set(done.map((d) => d.id)), avoid: [], reach: stampReach(stamp), k: stamp.k, room: stamp.room.id })!;
    expect(goal).not.toBeNull();
    expect(goal.travel!.left).toBeLessThan(dist(from, room.start!));
  }
  expect(dist(from, room.start!)).toBeLessThanOrEqual(screen.far);
  // The room is as it was stamped: its goal holds on the board the travel left.
  expect(referee(gameRequest({ ...world, moved, done, rooms: [stamp] }), contractGoal(room))).toEqual({ ok: true });
  return legs;
}

test("a spike is stamped ahead and reached through short travel goals", () => {
  const n = [...Array(20).keys()].find((k) => pace(k).spike)!;
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui });
  const near = { x: 40, y: 40 }, view = phone(near);
  const made = roomOrTravel(LIBRARY, n, near, { moved: new Map(), layout, keepOut: [grow(view, 2)], stamps: [] }, world, screen, { exclude: new Set(), avoid: [] })!;
  expect(made.goal.travel).toBeDefined();
  expect(made.goal.then?.room?.pace?.spike).toBe(true);
  expect(made.goal.then!.room!.f).toBeGreaterThanOrEqual(12);
  expect(dist(near, made.goal.then!.start!)).toBeGreaterThan(screen.far);
  const legs = travel(made, near, view);
  expect(legs.length).toBeGreaterThanOrEqual(1);
}, 60_000);

test("a room with no ground within a screen is reached through travel goals", () => {
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui });
  const near = { x: 40, y: 40 }, view = phone(near);
  // Rooms all round the player (other rooms' ground): the nearest free ground is far.
  const busy = { x: near.x - 15, y: near.y - 15, width: 30, height: 30 };
  const made = roomOrTravel(LIBRARY, 3, near, { moved: new Map(), layout, keepOut: [grow(view, 2), busy], stamps: [] }, world, screen, { exclude: new Set(), avoid: [] })!;
  expect(made.goal.travel).toBeDefined();
  expect(made.goal.then?.room?.pace?.spike).toBe(false);
  expect(dist(near, made.goal.then!.start!)).toBeGreaterThan(screen.far);
  travel(made, near, view);
}, 60_000);
