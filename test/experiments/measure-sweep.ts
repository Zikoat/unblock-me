// The measure's settings on the benchmark goals: how often the fewest moves are exact,
// and the time, per (margin, closure levels, limit).
//   scripts/capped.sh 800 300 bun test/experiments/measure-sweep.ts "3,inf,50000 2,1,50000 ..."
import { difficulty } from "../../src/difficulty";
import { makeGoalFast } from "../../src/goal-fast";
import { CASES } from "./bench-cases";

const settings = (process.argv[2] ?? "3,inf,50000").split(" ").map((s) => s.split(",")).map(([m, l, n]) => ({ margin: Number(m), levels: l === "inf" ? Infinity : Number(l), limit: Number(n) }));
const goals = Object.entries(CASES).map(([name, make]) => {
  const c = make();
  return { name, c, goal: makeGoalFast(c.layout, c.near, { effort: 12, perCell: 6, moved: c.moved, exclude: c.exclude, avoid: c.avoid }, { prune: true, lookahead: true, goalBudget: 50_000 })! };
});
for (const s of settings) {
  let exact = 0, ms = 0;
  const row: string[] = [];
  for (const { name, c, goal } of goals) {
    const t = performance.now();
    const d = difficulty(c.layout, c.moved, goal, s);
    ms += performance.now() - t;
    if (d.moves !== null) exact++;
    row.push(`${name}:${d.moves ?? `>=${d.atLeast}`}/${d.branching.toFixed(0)}/${d.score.toFixed(0)}`);
  }
  console.log(`margin ${s.margin} levels ${s.levels} limit ${s.limit}: exact ${exact}/${goals.length} ${ms.toFixed(0)}ms`);
  console.log("  " + row.join(" "));
}
