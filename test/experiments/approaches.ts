// The goal makers the benchmark compares.
import type { Point } from "../../src/camera";
import { makeGoal, type Goal, type GoalOptions } from "../../src/goal";
import { makeGoalFast } from "../../src/goal-fast";
import type { Layout } from "../../src/layout";

type Maker = (layout: Layout, near: Point, options: GoalOptions) => Goal | null;
export const APPROACHES: Record<string, Maker> = {
  current: makeGoal,
  /** The same search on an indexed board with an undo log. */
  indexed: (l, n, o) => makeGoalFast(l, n, o),
  /** Plus pruning slides that cannot succeed. */
  pruned: (l, n, o) => makeGoalFast(l, n, o, { prune: true }),
  /** Plus stopping at the first candidate that reaches full effort. */
  early: (l, n, o) => makeGoalFast(l, n, o, { prune: true, earlyStop: true }),
};
