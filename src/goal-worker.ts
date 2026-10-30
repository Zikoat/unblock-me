// Makes goals off the main thread, so the board stays responsive while it shuffles.
import { difficulty } from "./difficulty";
import { makeGoalFast } from "./goal-fast";
import { fixedLayout, randomLayout, type Placed } from "./layout";
import type { Point, Rect } from "./camera";

export type GoalRequest = {
  job: number;
  seed: number;
  tries: number;
  /** An exact board instead of the random one (one placed for a test). */
  placed: Placed[] | null;
  near: Point;
  moved: [string, Point][];
  effort: number;
  exclude: string[];
  /** Earlier targets' cells. */
  avoid: Rect[];
};

self.onmessage = (event: MessageEvent<GoalRequest>) => {
  const { job, seed, tries, placed, near, moved, effort, exclude, avoid } = event.data;
  const layout = placed ? fixedLayout(placed) : randomLayout(seed, { tries });
  // Pruned search on an indexed board (docs/goal-search.md): perCell 6 reaches full distance
  // on dense boards too; the goal-wide budget caps the worst case.
  const goal = makeGoalFast(layout, near, { effort, perCell: 6, moved: new Map(moved), exclude: new Set(exclude), avoid }, { prune: true, lookahead: true, goalBudget: 50_000 });
  if (!goal) {
    postMessage({ job, goal });
    return;
  }
  const map = new Map(moved);
  const home = layout.byId(goal.id)!;
  goal.start = map.get(goal.id) ?? { x: home.x, y: home.y };
  postMessage({ job, goal });
  // Then how hard it is: this can take a second or two on dense boards, so the goal shows
  // first and its difficulty follows.
  postMessage({ job, of: { id: goal.id, target: goal.target }, difficulty: difficulty(layout, map, goal) });
};
