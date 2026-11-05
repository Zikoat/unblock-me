// The first world goals after the island, as a player who plays each goal's proof would get
// them (reports/world-ramp.html): per seed, goal by goal, the fewest moves the game knows
// (quick: its own measure, as shown), a long measure (more boards, a wider window), and the
// red block's distance to its target. Run capped, one seed per process:
//   scripts/capped.sh 2500 3000 bun test/experiments/world-ramp.ts <seed> <goals> <before|after> <out.json> [long limit 1M]
// "before" ranks goals as the game did before the ramp (the best ranked near the last); "after"
// as it does now (src/goal.ts rampTarget).
import { Board } from "../../src/board";
import type { Point, Rect } from "../../src/camera";
import { measure } from "../../src/difficulty";
import { rampTarget } from "../../src/goal";
import { makeGoalHard } from "../../src/goal-search";
import { inIsland, islandGoals } from "../../src/island";
import { ISLAND_LEVELS } from "../../src/island-levels";
import { randomLayout, TRIES } from "../../src/layout";

const [seedArg, goalsArg, mode, out, longArg] = process.argv.slice(2);
const seed = Number(seedArg), count = Number(goalsArg), long = Number(longArg ?? 1_000_000);
const layout = randomLayout(seed, { tries: TRIES, fullscreen: true, island: true });
// The island played through by its proofs: its blocks where they left them.
const moved = new Map<string, Point>(), exclude: string[] = [], avoid: Rect[] = [];
let near: Point = { x: 0, y: 0 };
ISLAND_LEVELS.forEach((_, k) => {
  for (const g of islandGoals(k)) {
    for (const m of g.solution) moved.set(m.id, m.to);
    exclude.push(g.id);
    near = g.target;
  }
});
while (inIsland(near)) near = { x: near.x + 1, y: near.y };
const rows = [];
for (let n = 0; n < count; n++) {
  const t0 = performance.now();
  // The first is made while the player waits (effort 0); the rest ahead (effort 2).
  const goal = makeGoalHard(layout, near, { moved, exclude: new Set(exclude), avoid, ...(mode === "after" ? { target: rampTarget(n) } : {}) }, n === 0 ? 0 : 2);
  const made = performance.now() - t0;
  if (!goal) {
    rows.push({ n, none: true });
    break;
  }
  const board = new Board(layout, moved), red = layout.byId(goal.id)!;
  const start = moved.get(goal.id) ?? { x: red.x, y: red.y };
  const t1 = performance.now();
  const deep = measure(board, goal, { limit: long, margin: 3, levels: 2 });
  const row = {
    n, id: goal.id, distance: Math.abs(goal.target.x - start.x) + Math.abs(goal.target.y - start.y), proof: goal.solution.length,
    quick: goal.difficulty.moves, quickAtLeast: goal.difficulty.atLeast, score: Math.round(goal.difficulty.score * 10) / 10,
    long: deep.moves, longAtLeast: deep.atLeast, longUpper: deep.solution?.length ?? null, target: mode === "after" ? (rampTarget(n) ?? null) : null,
    madeMs: Math.round(made), longMs: Math.round(performance.now() - t1),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  for (const m of goal.solution) moved.set(m.id, m.to);
  exclude.push(goal.id);
  avoid.push({ x: goal.target.x, y: goal.target.y, width: red.w, height: red.h });
  near = goal.target;
}
await Bun.write(out!, JSON.stringify({ seed, mode, rows }));
