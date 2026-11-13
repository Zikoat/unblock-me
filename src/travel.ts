// Travel goals (the user's idea, 2026-11-13): a room placed further than a screen from the last
// red block (src/rooms.ts), and every spike, is stamped where it fits, off screen, and the
// player is led there by ordinary goals on the plain world (the maker's, short and easy: relief
// between hard ones), each a screen or so on towards it, until the room's goal is next. A
// travel goal keeps off the room: its red block and every block its proof moves stay out of
// the room's reach, so the room is still as it was stamped when its goal comes.
import type { Point, Rect } from "./camera";
import { choices } from "./choices";
import type { Difficulty } from "./difficulty";
import type { Goal } from "./goal";
import { makeGoalHard } from "./goal-search";
import { type Layout, randomLayout, type UiShown } from "./layout";
import type { Room } from "./room";
import { dist, type Ground, roomGoal, type Screen, stampReach, TRAVEL_AIM } from "./rooms";

/** Where the next travel goal is made round: a step from `from` towards `to`, never closer to
 * it than half a step (the room's goal is next once within `screen.far`). */
export function travelNear(from: Point, to: Point, screen: Screen): Point {
  const d = dist(from, to);
  if (d < 1) return { ...from };
  const step = Math.max(1, Math.min(screen.step, d - screen.step / 2));
  return { x: Math.round(from.x + ((to.x - from.x) * step) / d), y: Math.round(from.y + ((to.y - from.y) * step) / d) };
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export type Travel = Goal & { difficulty: Difficulty; travel: { k: number; room: string; left: number } };

/** A short goal leading from `from` (the last red block's target) towards `to` (the room's red
 * block), on `layout` (the room stamped in it), keeping off `reach` (the room's: rooms.ts
 * stampReach). Tries round travelNear, then nearer and to either side; the first that gets the
 * player closer to the room. Null if none does. */
export function travelGoal(layout: Layout, from: Point, to: Point, screen: Screen, opts: { moved: ReadonlyMap<string, Point>; exclude: ReadonlySet<string>; avoid: readonly Rect[]; reach: Rect; k: number; room: string; level?: number }): Travel | null {
  const d0 = dist(from, to), at = travelNear(from, to, screen);
  const ux = (at.x - from.x) / Math.max(1, dist(from, at)), uy = (at.y - from.y) / Math.max(1, dist(from, at));
  const side = 3;
  const tries: Point[] = [at, { x: Math.round(at.x - uy * side), y: Math.round(at.y + ux * side) }, { x: Math.round(at.x + uy * side), y: Math.round(at.y - ux * side) }, { x: Math.round((from.x + at.x) / 2), y: Math.round((from.y + at.y) / 2) }];
  let fallback: Travel | null = null;
  for (const near of tries) {
    const found = makeGoalHard(layout, near, { moved: opts.moved, exclude: opts.exclude, avoid: [...opts.avoid, opts.reach], target: TRAVEL_AIM }, opts.level ?? 0);
    if (!found || found.id.startsWith("room ")) continue;
    const home = layout.byId(found.id)!;
    const touches = found.solution.some((m) => {
      const b = layout.byId(m.id)!;
      // (The cells it sweeps through too.)
      const swept = { x: Math.min(m.from.x, m.to.x), y: Math.min(m.from.y, m.to.y), width: Math.abs(m.to.x - m.from.x) + b.w, height: Math.abs(m.to.y - m.from.y) + b.h };
      return m.id.startsWith("room ") || hits(swept, opts.reach);
    });
    if (touches) continue;
    const { distance: _, ...goal } = found;
    goal.start = opts.moved.get(goal.id) ?? { x: home.x, y: home.y };
    const left = Math.round(dist(goal.target, to) * 10) / 10;
    const travel: Travel = { ...goal, travel: { k: opts.k, room: opts.room, left } };
    if (left <= d0 - screen.step / 2) return travel;
    if (left < d0 && (!fallback || left < fallback.travel.left)) fallback = travel;
  }
  return fallback;
}

/** The n-th world goal as a room (rooms.ts roomGoal), as the goal worker gives it: the room's
 * goal with its stamp; or, a room further than `screen.far` from `near` (the last red block's
 * target) and every spike, the first travel goal leading to it, with the room's stamp and the
 * room's goal (`then`). Null if no room fits. `layout` is the world with the stamp. */
export function roomOrTravel(pool: readonly Room[], n: number, near: Point, g: Ground, world: { seed: number; tries: number; walls: number; ui: UiShown }, screen: Screen | undefined, opts: { exclude: ReadonlySet<string>; avoid: readonly Rect[] }): { goal: Goal; difficulty: Difficulty; layout: Layout } | null {
  const t0 = performance.now();
  const made = roomGoal(pool, n, near, g, world, undefined, screen);
  if (!made) return null;
  const { goal } = made;
  goal.room = { ...goal.room!, pace: made.pace, ms: Math.round(performance.now() - t0), states: made.states };
  const layout = randomLayout(world.seed, { tries: world.tries, walls: world.walls, ...world.ui, rooms: [...g.stamps, made.stamp] });
  if (screen && (made.pace.spike || dist(near, goal.start!) > screen.far)) {
    const t = travelGoal(layout, near, goal.start!, screen, { moved: g.moved, exclude: opts.exclude, avoid: opts.avoid, reach: stampReach(made.stamp), k: made.stamp.k, room: made.stamp.room.id });
    if (t) {
      goal.choices = choices(layout, g.moved, goal);
      const { difficulty, ...first } = t;
      return { goal: { ...first, stamp: made.stamp, then: goal }, difficulty, layout };
    }
  }
  return { goal: { ...goal, stamp: made.stamp }, difficulty: goal.difficulty!, layout };
}
