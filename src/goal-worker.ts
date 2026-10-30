// Makes goals off the main thread, so the board stays responsive while it shuffles.
import { makeGoal } from "./goal";
import { randomLayout } from "./layout";
import type { Point } from "./camera";

export type GoalRequest = { job: number; seed: number; tries: number; near: Point; moved: [string, Point][]; effort: number };

self.onmessage = (event: MessageEvent<GoalRequest>) => {
  const { job, seed, tries, near, moved, effort } = event.data;
  const goal = makeGoal(randomLayout(seed, { tries }), near, { effort, moved: new Map(moved) });
  postMessage({ job, goal });
};
