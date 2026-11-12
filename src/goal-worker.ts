// Makes goals off the main thread, so the board stays responsive while it searches. A world
// goal is a room (src/rooms.ts): the library's and the device's own rooms, paced, stamped on
// untouched ground near the player; if none fits, the maker makes one as before.
import { choices } from "./choices";
import { makeGoalHard } from "./goal-search";
import { fixedLayout, randomLayout, type Placed, type Stamp, type UiShown } from "./layout";
import type { Point, Rect } from "./camera";
import type { Room } from "./room";
import { LIBRARY, roomGoal } from "./rooms";

export type GoalRequest = {
  job: number;
  seed: number;
  tries: number;
  /** The share of cells that are walls. */
  walls: number;
  /** Which UI blocks are on the board (they change the layout). */
  ui: UiShown;
  /** An exact board instead of the random one (one placed for a test). */
  placed: Placed[] | null;
  near: Point;
  moved: [string, Point][];
  /** How hard to try (goal-search.ts, LEVELS_OF_EFFORT): 0 when the player is waiting. */
  level?: number;
  exclude: string[];
  /** Earlier targets' cells. */
  avoid: Rect[];
  /** The fewest moves it aims at (goal.ts rampTarget); none when absent. */
  target?: number;
  /** Rooms stamped so far. */
  rooms?: Stamp[];
  /** With rooms on: the rooms this device made (the library's are the worker's own), the
   * world goal's number (for the pacing), and where no room may go (the island, the UI). */
  roomsOn?: { made: Room[]; n: number; keepOut: Rect[] };
};

self.onmessage = (event: MessageEvent<GoalRequest>) => {
  const { job, seed, tries, walls, ui, placed, near, moved, level = 1, exclude, avoid, target, rooms = [], roomsOn } = event.data;
  const layout = placed ? fixedLayout(placed) : randomLayout(seed, { tries, walls, ...ui, rooms });
  const map = new Map(moved);
  if (roomsOn && !placed) {
    const t0 = performance.now();
    const made = roomGoal([...roomsOn.made, ...LIBRARY], roomsOn.n, near, { moved: map, layout, keepOut: [...roomsOn.keepOut, ...avoid], stamps: rooms }, { seed, tries, walls, ui });
    if (made) {
      const { goal } = made;
      goal.stamp = made.stamp;
      goal.room = { ...goal.room!, pace: made.pace, ms: Math.round(performance.now() - t0), states: made.states };
      postMessage({ job, goal });
      const stamped = randomLayout(seed, { tries, walls, ...ui, rooms: [...rooms, made.stamp] });
      postMessage({ job, of: { id: goal.id, target: goal.target }, difficulty: goal.difficulty, choices: choices(stamped, map, goal) });
      return;
    }
  }
  // The push search's targets ranked by the difficulty measure (docs/goal-search.md).
  const found = makeGoalHard(layout, near, { moved: map, exclude: new Set(exclude), avoid, target }, level);
  if (!found) {
    postMessage({ job, goal: null });
    return;
  }
  const { difficulty, distance: _, ...goal } = found;
  const home = layout.byId(goal.id)!;
  goal.start = map.get(goal.id) ?? { x: home.x, y: home.y };
  postMessage({ job, goal });
  // Its difficulty was measured choosing it.
  postMessage({ job, of: { id: goal.id, target: goal.target }, difficulty, choices: choices(layout, map, goal) });
};
