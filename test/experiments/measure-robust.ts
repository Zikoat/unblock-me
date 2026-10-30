// Do the chosen goals' lower bounds hold in a fuller model? Measure each approach's goal
// with the whole window's closure and a bigger margin and limit.
//   scripts/capped.sh 1000 600 bun test/experiments/measure-robust.ts <approach> [limit]
import { difficulty } from "../../src/difficulty";
import { CASES } from "./bench-cases";
import { TABLE } from "./goal-table";

const [approach, limitArg] = process.argv.slice(2);
const limit = Number(limitArg ?? 200_000);
for (const [name, build] of Object.entries(CASES)) {
  const c = build();
  const goal = TABLE[approach!]!(c);
  if (!goal) continue;
  const a = difficulty(c.layout, c.moved, goal);
  const t = performance.now();
  const b = difficulty(c.layout, c.moved, goal, { limit, margin: 3, levels: Infinity });
  console.log(`${name.padEnd(9)} default: ${a.moves ?? `>=${a.atLeast}`} b ${a.branching.toFixed(0)} score ${a.score.toFixed(0)} | full: ${b.moves ?? `>=${b.atLeast}`} b ${b.branching.toFixed(0)} score ${b.score.toFixed(0)} searched ${b.searched} ${(performance.now() - t).toFixed(0)}ms`);
}
