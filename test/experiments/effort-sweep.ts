// Difficulty against the push cap (effort), at one density. Run it capped:
//   scripts/capped.sh 1000 600 bun test/experiments/effort-sweep.ts <tries> <boards> <level> <effort...>
//   ALPHA=<a> sets the distance trade-off (goal-search.ts, tradeoff).
import { makeGoalHard, tradeoff } from "../../src/goal-search";
import { randomLayout } from "../../src/layout";

if (process.env.ALPHA) tradeoff.alpha = Number(process.env.ALPHA);

const [tries, boards, level, ...efforts] = process.argv.slice(2).map(Number) as number[];
for (const effort of efforts) {
  const scores: number[] = [], distances: number[] = [], moves: number[] = [];
  let slowest = 0;
  for (let seed = 1; seed <= boards!; seed++) {
    const layout = randomLayout(seed * 7919, { tries: tries! });
    const t = performance.now();
    const goal = makeGoalHard(layout, { x: (seed % 5) * 7, y: 6 + (seed % 3) * 5 }, { effort }, level);
    slowest = Math.max(slowest, performance.now() - t);
    if (!goal) continue;
    scores.push(goal.difficulty.score);
    distances.push(goal.distance);
    moves.push(goal.difficulty.moves ?? goal.difficulty.atLeast);
  }
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  const spread = [...distances].sort((a, b) => a - b);
  console.log(`alpha ${tradeoff.alpha} effort ${String(effort).padStart(2)}: difficulty median ${median(scores).toFixed(1)}, fewest moves median ${median(moves)}, distances p10 ${spread[Math.floor(spread.length * 0.1)]} median ${median(distances)} p90 ${spread[Math.floor(spread.length * 0.9)]}, slowest ${slowest.toFixed(0)}ms`);
}
