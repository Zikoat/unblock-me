// One approach on every benchmark case, judged by the difficulty measure: a table of
// difficulty, fewest moves, branching, distance, the solution's length and time. Every
// solution is replayed. Run it capped, one approach per process (peak memory is its own):
//   scripts/capped.sh 800 300 bun test/experiments/goal-table.ts <approach> [cases...]
import { replay } from "../../src/frozen";
import { difficulty } from "../../src/difficulty";
import { makeGoalFast } from "../../src/goal-fast";
import { makeGoalDeep, makeGoalTournament } from "../../src/goal-search";
import type { Goal } from "../../src/goal";
import type { Point } from "../../src/camera";
import type { Layout } from "../../src/layout";
import type { Case } from "./bench-cases";
import { CASES } from "./bench-cases";

type Maker = (c: Case) => Goal | null;
const opts = (c: Case) => ({ moved: c.moved, exclude: c.exclude, avoid: c.avoid });
export const TABLE: Record<string, Maker> = {
  fast: (c) => makeGoalFast(c.layout, c.near, { effort: 12, perCell: 6, ...opts(c) }, { prune: true, lookahead: true, goalBudget: 50_000 }),
  deep5k: (c) => makeGoalDeep(c.layout, c.near, { states: 5_000, ...opts(c) }),
  deep20k: (c) => makeGoalDeep(c.layout, c.near, { states: 20_000, ...opts(c) }),
  deep100k: (c) => makeGoalDeep(c.layout, c.near, { states: 100_000, ...opts(c) }),
  deep20kL2: (c) => makeGoalDeep(c.layout, c.near, { states: 20_000, levels: 2, ...opts(c) }),
  deep100kL2: (c) => makeGoalDeep(c.layout, c.near, { states: 100_000, levels: 2, ...opts(c) }),
  tour1k: (c) => makeGoalTournament(c.layout, c.near, { rough: 1_000, exact: 20_000, finalists: 3, ...opts(c) }),
  tour3k: (c) => makeGoalTournament(c.layout, c.near, { rough: 3_000, exact: 50_000, finalists: 4, ...opts(c) }),
  tour10k: (c) => makeGoalTournament(c.layout, c.near, { rough: 10_000, exact: 100_000, finalists: 6, ...opts(c) }),
  tour3kC12: (c) => makeGoalTournament(c.layout, c.near, { rough: 3_000, exact: 50_000, finalists: 4, tuning: { prune: true, lookahead: true, goalBudget: 100_000, candidates: 12 }, ...opts(c) }),
  tour3kC12P8: (c) => makeGoalTournament(c.layout, c.near, { rough: 3_000, exact: 50_000, finalists: 4, perCell: 8, tuning: { prune: true, lookahead: true, goalBudget: 200_000, candidates: 12 }, ...opts(c) }),
};

const [approach, ...names] = process.argv.slice(2);
const make = TABLE[approach!];
if (!make) throw new Error(`approaches: ${Object.keys(TABLE)}`);
const cases = names.length ? names : Object.keys(CASES);
const check = (layout: Layout, c: Case, goal: Goal): string => {
  const after = replay(layout, goal.solution, c.moved);
  if (!after) return "ILLEGAL";
  const at = after.moved.get(goal.id);
  if (!at || at.x !== goal.target.x || at.y !== goal.target.y) return "MISSES";
  if (c.exclude.has(goal.id)) return "EXCLUDED";
  const red = layout.byId(goal.id)!;
  if (c.avoid.some((a) => goal.target.x < a.x + a.width && goal.target.x + red.w > a.x && goal.target.y < a.y + a.height && goal.target.y + red.h > a.y)) return "AVOID";
  return "ok";
};
console.log(`${approach}: case | score | fewest | branching | distance | found | ms | measure ms | replay`);
let total = 0, score = 0;
for (const name of cases) {
  const c = CASES[name]!();
  const t = performance.now();
  const goal = make(c);
  const ms = performance.now() - t;
  total += ms;
  if (!goal) { console.log(`${name} none`); continue; }
  const t2 = performance.now();
  const d = difficulty(c.layout, c.moved, goal);
  const dms = performance.now() - t2;
  score += d.score;
  const start: Point = c.moved.get(goal.id) ?? c.layout.byId(goal.id)!;
  const distance = Math.abs(goal.target.x - start.x) + Math.abs(goal.target.y - start.y);
  console.log(`${name.padEnd(9)} | ${d.score.toFixed(1).padStart(5)} | ${(d.moves ?? `>=${d.atLeast}`).toString().padStart(4)} | ${d.branching.toFixed(1).padStart(5)} | ${String(distance).padStart(2)} | ${String(goal.solution.length).padStart(3)} | ${ms.toFixed(0).padStart(5)} | ${dms.toFixed(0).padStart(4)} | ${check(c.layout, c, goal)} ${goal.id}${"states" in goal ? ` states ${(goal as { states: number }).states}` : ""}`);
}
console.log(`${approach}: total ${total.toFixed(0)}ms, mean score ${(score / cases.length).toFixed(1)}, heap ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`);
