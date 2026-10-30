// The difficulty measure on the benchmark cases; run it capped:
//   scripts/capped.sh 800 120 bun test/experiments/difficulty.ts [perCell]
import { difficulty } from "../../src/difficulty";
import { makeGoalFast } from "../../src/goal-fast";
import { CASES } from "./bench-cases";

const perCell = Number(process.argv[2] ?? 6);
for (const [name, make] of Object.entries(CASES)) {
  const c = make();
  const goal = makeGoalFast(c.layout, c.near, { effort: 12, perCell, moved: c.moved, exclude: c.exclude, avoid: c.avoid }, { prune: true, lookahead: true, goalBudget: 50_000 });
  if (!goal) { console.log(name, "no goal"); continue; }
  const t = performance.now();
  const d = difficulty(c.layout, c.moved, goal);
  const ms = performance.now() - t;
  const red = c.layout.byId(goal.id)!, at = c.moved.get(goal.id) ?? red;
  console.log(`${name.padEnd(10)} distance ${Math.abs(goal.target.x - at.x) + Math.abs(goal.target.y - at.y)} found ${goal.solution.length} fewest ${d.moves ?? `>=${d.atLeast}`} expanded ${d.searched} branching ${d.branching.toFixed(1)} score ${d.score.toFixed(1)} ${ms.toFixed(0)}ms`);
}
