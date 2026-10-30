// Is Window.lower admissible? Replay each benchmark goal's solution through the window
// model and compare the bound with the moves actually left.
//   scripts/capped.sh 800 120 bun test/experiments/lower-check.ts [approach]
import { Board } from "../../src/board";
import { Window } from "../../src/window";
import { CASES } from "./bench-cases";
import { TABLE } from "./goal-table";

const approach = process.argv[2] ?? "fast";
for (const [name, make] of Object.entries(CASES)) {
  const c = make();
  const goal = TABLE[approach]!(c);
  if (!goal) continue;
  const board = new Board(c.layout, c.moved);
  const red = board.block(goal.id);
  const horizontal = red.w > red.h;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of [...goal.solution, { id: goal.id, from: goal.target, to: goal.target }]) {
    const b = board.home(m.id)!;
    for (const p of [m.from, m.to]) { x0 = Math.min(x0, p.x - 3); y0 = Math.min(y0, p.y - 3); x1 = Math.max(x1, p.x + b.w + 3); y1 = Math.max(y1, p.y + b.h + 3); }
  }
  const win = new Window(board, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).closure(board, [goal.id, ...goal.solution.map((m) => m.id)]);
  const r = win.index(goal.id);
  const want = (horizontal ? goal.target.x : goal.target.y) - (horizontal ? win.x0 : win.y0);
  const state = Uint8Array.from(win.start);
  const n = goal.solution.length;
  let bad = 0;
  for (let k = 0; k <= n; k++) {
    win.fill(state, 0);
    const h = win.lower(state, 0, r, want);
    if (h > n - k) { bad++; console.log(`${name}: after ${k} of ${n} moves, lower ${h} > ${n - k} left`); }
    if (k === n) break;
    const m = goal.solution[k]!;
    const i = win.index(m.id);
    const s = win.sliders[i]!;
    const from = (s.horizontal ? m.from.x - win.x0 : m.from.y - win.y0), to = (s.horizontal ? m.to.x - win.x0 : m.to.y - win.y0);
    let found = false;
    win.moves(state, 0, (j, p) => { if (j === i && p === to) found = true; });
    if (state[i] !== from || !found) console.log(`${name}: move ${k} ${m.id} not legal in the model`);
    state[i] = to;
  }
  console.log(`${name}: ${bad} bad bounds, sliders ${win.sliders.length}`);
}
