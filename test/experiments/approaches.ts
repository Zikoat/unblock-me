// The goal makers the benchmark compares.
import type { Point } from "../../src/camera";
import { makeGoal, type Goal, type GoalOptions } from "../../src/goal";
import type { Layout } from "../../src/layout";

export const APPROACHES: Record<string, (layout: Layout, near: Point, options: GoalOptions) => Goal | null> = {
  current: makeGoal,
};
