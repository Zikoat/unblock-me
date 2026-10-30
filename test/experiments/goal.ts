// One goal-generation run, run it capped:
//   scripts/capped.sh 500 30 bun test/experiments/goal.ts <tries> <effort> <perCell>
import { replay } from "../../src/frozen";
import { makeGoal } from "../../src/goal";
import { randomLayout } from "../../src/layout";

const [tries, effort, perCell] = process.argv.slice(2, 5).map(Number) as [number, number, number];
const layout = randomLayout(5, { tries });
const t = performance.now();
const goal = makeGoal(layout, { x: 0, y: 2 }, { effort, perCell });
const ms = performance.now() - t;
const ok = goal ? replay(layout, goal.solution) !== null : false;
const red = goal ? layout.byId(goal.id)! : null;
const startAt = red;
console.log(JSON.stringify({ tries, effort, perCell, ms: Math.round(ms), moves: goal?.solution.length, distance: goal && startAt ? Math.abs(goal.target.x - startAt.x) + Math.abs(goal.target.y - startAt.y) : 0, replayOk: ok }));
