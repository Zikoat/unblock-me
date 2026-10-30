// Makes goals off the main thread, so the board stays responsive while it shuffles.
import { makeGoal } from "./goal";
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
  const goal = makeGoal(layout, near, { effort, moved: new Map(moved), exclude: new Set(exclude), avoid });
  postMessage({ job, goal });
};
