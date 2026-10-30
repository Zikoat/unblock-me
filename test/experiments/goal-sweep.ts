// Many boards in one process, for worst cases and goal quality: per density, the max and
// median time, how often the goal reached full effort, and mean solution length.
//   scripts/capped.sh 800 120 bun test/experiments/goal-sweep.ts <approach> <boards> [effort] [perCell]
import { replay } from "../../src/frozen";
import { randomLayout } from "../../src/layout";
import { APPROACHES } from "./approaches";

const [approach, boardsArg, effortArg, perCellArg] = process.argv.slice(2);
const make = APPROACHES[approach!]!;
const boards = Number(boardsArg ?? 20), effort = Number(effortArg ?? 12), perCell = Number(perCellArg ?? 4);
for (const tries of (process.env.TRIES ?? "7,15,25,30").split(",").map(Number)) {
  const times: number[] = [];
  let full = 0, moves = 0, distance = 0, bad = 0, trivial = 0;
  for (let seed = 1; seed <= boards; seed++) {
    const layout = randomLayout(seed * 7919, { tries });
    const near = { x: (seed * 37) % 200 - 100, y: (seed * 53) % 200 - 100 };
    const t = performance.now();
    const goal = make(layout, near, { effort, perCell });
    times.push(performance.now() - t);
    if (process.env.VERBOSE) console.log(seed, Math.round(times.at(-1)!));
    if (!goal) continue;
    const red = layout.byId(goal.id)!;
    const d = Math.abs(goal.target.x - red.x) + Math.abs(goal.target.y - red.y);
    distance += d;
    if (d >= effort) full++;
    moves += goal.solution.length;
    if (goal.solution.length === 1) trivial++;
    const after = replay(layout, goal.solution);
    if (!after || after.moved.get(goal.id)?.x !== goal.target.x || after.moved.get(goal.id)?.y !== goal.target.y) bad++;
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ approach, tries, effort, perCell, boards, maxMs: Math.round(times.at(-1)!), medianMs: +times[times.length >> 1]!.toFixed(1), fullEffort: full, meanDistance: +(distance / boards).toFixed(1), meanMoves: +(moves / boards).toFixed(1), oneMove: trivial, bad }));
}
