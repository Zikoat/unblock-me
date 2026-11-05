// Makes goals off the main thread, so the board stays responsive while it searches.
import { choices } from "./choices";
import { makeGoalHard } from "./goal-search";
import { fixedLayout, randomLayout, type Placed, type UiShown } from "./layout";
import type { Point, Rect } from "./camera";

export type GoalRequest = {
  job: number;
  seed: number;
  tries: number;
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
  /** The most fewest moves it may take (goal.ts rampCap); none when absent. */
  cap?: number;
};

self.onmessage = (event: MessageEvent<GoalRequest>) => {
  const { job, seed, tries, ui, placed, near, moved, level = 1, exclude, avoid, cap } = event.data;
  const layout = placed ? fixedLayout(placed) : randomLayout(seed, { tries, ...ui });
  // The push search's targets ranked by the difficulty measure (docs/goal-search.md).
  const found = makeGoalHard(layout, near, { moved: new Map(moved), exclude: new Set(exclude), avoid, cap }, level);
  if (!found) {
    postMessage({ job, goal: null });
    return;
  }
  const { difficulty, distance: _, ...goal } = found;
  const map = new Map(moved);
  const home = layout.byId(goal.id)!;
  goal.start = map.get(goal.id) ?? { x: home.x, y: home.y };
  postMessage({ job, goal });
  // Its difficulty was measured choosing it.
  postMessage({ job, of: { id: goal.id, target: goal.target }, difficulty, choices: choices(layout, map, goal) });
};
