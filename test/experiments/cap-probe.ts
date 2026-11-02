// One board's finalists under the measure at given caps: window size, states, expansions,
// time, and what the greedy phase and A* each found. For looking into hard cases.
//   GREEDY_SHARE=.. GREEDY=.. scripts/capped.sh 2500 600 bun test/experiments/cap-probe.ts <tries> <seed> <level> <cap...>
import { Board } from "../../src/board";
import { measure, tuning } from "../../src/difficulty";
import { pushes, simplifyFast } from "../../src/goal-fast";
import { balance, LEVELS_OF_EFFORT, type Ranked } from "../../src/goal-search";
import { randomLayout } from "../../src/layout";

if (process.env.GREEDY_SHARE) tuning.greedyShare = Number(process.env.GREEDY_SHARE);
if (process.env.GREEDY) tuning.greedy = Number(process.env.GREEDY);
const [tries, seed, level, ...caps] = process.argv.slice(2).map(Number) as number[];
const effort = LEVELS_OF_EFFORT[level!]!;
const rank = (a: Ranked, b: Ranked) => balance(b) - balance(a) || a.solution.length - b.solution.length || a.distance - b.distance;
const layout = randomLayout(seed! * 7919, { tries: tries! });
const near = { x: (seed! % 5) * 7, y: 6 + (seed! % 3) * 5 };
const board = new Board(layout, new Map());
const all = pushes(board, layout, near, { perCell: effort.perCell ?? 6 }, effort.tuning);
const candidates: Ranked[] = [];
const stride = effort.stride ?? 1;
for (const p of all) {
  for (let k = p.steps.length - 1; k >= 0; k--) {
    if ((k + 1) % stride !== 0 && k !== p.steps.length - 1) continue;
    const step = p.steps[k]!;
    const solution = simplifyFast(board, p.raw.slice(0, step.moves));
    const goal = { id: p.id, target: step.at, solution };
    candidates.push({ ...goal, difficulty: measure(board, goal, { limit: effort.rough }), distance: k + 1 });
  }
}
candidates.sort(rank);
for (const c of candidates.slice(0, effort.finalists)) {
  console.log(`finalist ${c.id} -> ${c.target.x},${c.target.y} distance ${c.distance} proof ${c.solution.length} moves`);
  for (const cap of caps) {
    const t = performance.now();
    const d = measure(board, c, { limit: cap });
    console.log(`  cap ${String(cap).padStart(8)}: ${d.moves ?? `>=${d.atLeast}`} known ${d.solution?.length ?? "-"} expanded ${d.searched} branching ${d.branching.toFixed(1)} ${(performance.now() - t).toFixed(0)}ms`);
  }
}
