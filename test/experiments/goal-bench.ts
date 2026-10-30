// One benchmark case with one goal maker; run it capped, or all of them with
// scripts/goal-bench.sh:
//   scripts/capped.sh 800 60 bun test/experiments/goal-bench.ts <approach> <case>
import { replay } from "../../src/frozen";
import { intersects, type Layout } from "../../src/layout";
import { isHorizontal } from "../../src/rules";
import { CASES } from "./bench-cases";
import { APPROACHES } from "./approaches";

const [approach, name, effortArg, perCellArg] = process.argv.slice(2);
const make = APPROACHES[approach!];
const build = CASES[name!];
if (!make || !build) throw new Error(`approaches: ${Object.keys(APPROACHES)}; cases: ${Object.keys(CASES)}`);
const c = build();
const effort = Number(effortArg ?? 12);
const perCell = Number(perCellArg ?? 4);
const run = () => make(c.layout, c.near, { effort, perCell, moved: c.moved, exclude: c.exclude, avoid: c.avoid });
let t = performance.now();
const goal = run();
const ms = performance.now() - t;
// Warm runs (the worker has made goals before): the median of REPEAT more.
const warm: number[] = [];
for (let i = 0; i < Number(process.env.REPEAT ?? 0); i++) {
  t = performance.now();
  run();
  warm.push(performance.now() - t);
}
warm.sort((a, b) => a - b);

function check(layout: Layout): string {
  if (!goal) return "none";
  const after = replay(layout, goal.solution, c.moved);
  if (!after) return "illegal";
  const at = after.moved.get(goal.id);
  if (!at || at.x !== goal.target.x || at.y !== goal.target.y) return "misses target";
  if (c.exclude.has(goal.id)) return "excluded";
  const red = layout.byId(goal.id)!;
  const track = (b: typeof red) => `${isHorizontal(b) ? "r" : "c"}${isHorizontal(b) ? b.y : b.x}`;
  if ([...c.exclude].some((id) => track(layout.byId(id)!) === track(red))) return "excluded track";
  if (c.avoid.some((a) => intersects({ ...goal.target, w: red.w, h: red.h }, a))) return "avoid";
  return "ok";
}
const start = goal ? (c.moved.get(goal.id) ?? c.layout.byId(goal.id)!) : null;
const distance = goal && start ? Math.abs(goal.target.x - start.x) + Math.abs(goal.target.y - start.y) : 0;
console.log(JSON.stringify({ approach, case: name, effort, perCell, moved: c.moved.size, ms: Math.round(ms), warm: warm.length ? +warm[warm.length >> 1]!.toFixed(1) : undefined, heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), distance, moves: goal?.solution.length ?? 0, id: goal?.id, target: goal?.target, check: check(c.layout) }));
