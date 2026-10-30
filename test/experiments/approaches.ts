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

/** pruned, printing how the work splits (for reports). */
APPROACHES.stats = (l, n, o) => {
  const stats = { clears: 0, fails: 0, nodes: 0, failNodes: 0 };
  const goal = makeGoalFast(l, n, o, { prune: true, stats });
  console.error(JSON.stringify(stats));
  return goal;
};
/** pruned, plus a one-slide lookahead for blockers when the moves left are tight. */
APPROACHES.lookahead = (l, n, o) => makeGoalFast(l, n, o, { prune: true, lookahead: true });
