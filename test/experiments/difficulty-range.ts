// The usual difficulty per density, for mapping difficulty to stars. Run it capped:
//   scripts/capped.sh 1000 600 bun test/experiments/difficulty-range.ts <tries> <boards> [level]
import { makeGoalHard } from "../../src/goal-search";
import { randomLayout } from "../../src/layout";

const tries = Number(process.argv[2]);
const boards = Number(process.argv[3] ?? 30);
const level = Number(process.argv[4] ?? 2); // goals made ahead, as the game mostly plays them
const scores: number[] = [];
let capped = 0, slowest = 0;
for (let seed = 1; seed <= boards; seed++) {
  const layout = randomLayout(seed * 7919, { tries });
  const near = { x: (seed % 5) * 7, y: 6 + (seed % 3) * 5 };
  const t = performance.now();
  const goal = makeGoalHard(layout, near, { effort: 12 }, level);
  slowest = Math.max(slowest, performance.now() - t);
  if (!goal) continue;
  const d = goal.difficulty;
  if (d.moves === null) capped++;
  scores.push(d.score);
}
scores.sort((a, b) => a - b);
const q = (p: number) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))]!.toFixed(1);
console.log(`tries ${tries}: ${scores.length} goals, p5 ${q(0.05)} p25 ${q(0.25)} p50 ${q(0.5)} p75 ${q(0.75)} p95 ${q(0.95)}, ${capped} capped, slowest ${slowest.toFixed(0)}ms`);
