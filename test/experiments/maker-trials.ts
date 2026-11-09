// Blind trial pairs of the maker before and after it weighed extra moves
// (reports/extra-maker.html): on boards extra-maker.ts ran both makers on (the same seed, aim
// and walls), a pair where both goals need about 12 moves and the after one has more extra
// moves. The board is cut out round each goal (2 cells past every cell its proof uses, walled
// round, the cells of blocks cut by the edge walls too), and each goal measured on its cut
// again (src/difficulty.ts, as far as the Auditor looks) for their fewest, extra moves and a
// proof the game can replay. Writes src/trials-maker.ts (?trial=M1A etc.) and the pairs as
// JSON for the report:
//   bun test/experiments/maker-trials.ts data/extra-maker/before-e0-w0-a12.jsonl data/extra-maker/after-e0-w0-a12.jsonl [...more before/after pairs] --pairs 3 --out data/extra-maker/trials.json
import { writeFileSync } from "node:fs";
import { Board } from "../../src/board";
import { contractGoal, WISHES, WORLD_VERSION, type Request } from "../../src/contract";
import { decisionStages } from "../../src/decisions";
import { measure } from "../../src/difficulty";
import { extraMoves } from "../../src/judge";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";
import { referee } from "../../src/referee";
import type { Move } from "../../src/rules";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1]! : fallback;
};
const want = Number(opt("pairs", "3")), out = opt("out", "data/extra-maker/trials.json");
const MARGIN = 2;

type Line = { seed: number; walls: number; density: number; aim: number | null; found: boolean; proof: number; extra: number; exact: boolean; goal: { red: string; start: { x: number; y: number }; target: { x: number; y: number }; moves: [string, number, number, number, number][] } };
const read = async (f: string): Promise<Line[]> => (await Bun.file(f).text()).trim().split("\n").map((l) => JSON.parse(l));

// Candidate boards: both found, different goals, the after one about 12 moves, proved, with 2 or more extra moves.
const boards: { before: Line; after: Line }[] = [];
for (let i = 0; i + 1 < args.length; i += 2) {
  const before = await read(args[i]!), after = await read(args[i + 1]!);
  for (const b of before) {
    const a = after.find((x) => x.seed === b.seed);
    if (!a?.found || !b.found || (a.goal.red === b.goal.red && a.goal.target.x === b.goal.target.x && a.goal.target.y === b.goal.target.y)) continue;
    // (The before goal's proof may be far longer than its fewest: measured again below.)
    if (Math.abs(a.proof - 12) > 2 || !a.exact || a.extra < 2) continue;
    boards.push({ before: b, after: a });
  }
}
boards.sort((p, q) => q.after.extra - q.before.extra - (p.after.extra - p.before.extra) || Math.abs(p.after.proof - p.before.proof) - Math.abs(q.after.proof - q.before.proof));

const toMoves = (l: Line): Move[] => l.goal.moves.map(([id, fx, fy, tx, ty]) => ({ id, from: { x: fx, y: fy }, to: { x: tx, y: ty } }));

/** The board cut out round the goals, walled round. */
function cut(...lines: Line[]) {
  const layout = randomLayout(lines[0]!.seed, { tries: lines[0]!.density, walls: lines[0]!.walls, island: false });
  const board = new Board(layout);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, w: number, h: number) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x + w)), (y1 = Math.max(y1, y + h)));
  for (const l of lines) {
    const red = board.block(l.goal.red);
    grow(red.x, red.y, red.w, red.h);
    grow(l.goal.target.x, l.goal.target.y, red.w, red.h);
    for (const m of toMoves(l)) {
      const b = board.block(m.id);
      grow(m.from.x, m.from.y, b.w, b.h);
      grow(m.to.x, m.to.y, b.w, b.h);
    }
  }
  const box = { x: x0 - MARGIN, y: y0 - MARGIN, width: x1 - x0 + 2 * MARGIN, height: y1 - y0 + 2 * MARGIN };
  const inside = (x: number, y: number) => x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height;
  const blocks: Placed[] = [], wall = (x: number, y: number) => blocks.push({ id: `wall ${x},${y}`, x, y, w: 1, h: 1, wall: true });
  for (let x = box.x - 1; x <= box.x + box.width; x++) for (let y = box.y - 1; y <= box.y + box.height; y++) if (!inside(x, y)) wall(x, y);
  for (const b of layout.blocksIn({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 })) {
    if (b.ui) continue;
    const cells: [number, number][] = [];
    for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) if (inside(b.x + i, b.y + j)) cells.push([b.x + i, b.y + j]);
    if (!cells.length) continue;
    if (b.wall || cells.length < b.w * b.h) cells.forEach(([x, y]) => wall(x, y));
    else blocks.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }
  return { box, blocks };
}

/** A goal measured again on the cut board, as far as the Auditor looks. */
function remeasure(blocks: Placed[], l: Line) {
  const board = new Board(fixedLayout(blocks));
  const goal = { id: l.goal.red, target: l.goal.target, solution: toMoves(l) };
  if (!board.replays(goal.solution)) throw new Error(`board ${l.seed}: the proof does not replay on the cut board`);
  const runs = [{ margin: 5, reach: null }, { margin: 8, reach: { depth: 16, most: 200 } }].map((a) => measure(board, goal, { limit: 200_000, ...a }));
  const best = runs.reduce((a, b) => ((b.solution?.length ?? Infinity) < (a.solution?.length ?? Infinity) ? b : a));
  const solution = best.solution && best.solution.length < goal.solution.length ? best.solution : goal.solution;
  const exact = runs.some((r) => r.moves !== null && r.moves === solution.length);
  const request: Request = { version: 1, world: { seed: 0, density: 0, ui: {}, version: WORLD_VERSION, placed: blocks }, moved: {}, history: [], rampAim: null, wishes: WISHES, seed: 1 };
  const verdict = referee(request, contractGoal({ ...goal, solution }), board);
  if (!verdict.ok) throw new Error(`board ${l.seed}: rule ${verdict.rule}: ${verdict.why}`);
  return {
    red: l.goal.red, target: l.goal.target, fewest: solution.length, exact, extra: extraMoves(solution.map((m) => m.id)),
    redMoves: solution.filter((m) => m.id === l.goal.red).length, decisions: decisionStages(board, contractGoal({ ...goal, solution })).reduce((a, b) => a + b, 0),
    solution, endless: { proof: l.proof, extra: l.extra, exact: l.exact },
  };
}

const picked: { label: string; seed: number; walls: number; aim: number | null; sides: { label: string; side: "before" | "after"; box: ReturnType<typeof cut>["box"]; blocks: Placed[]; goal: ReturnType<typeof remeasure> }[] }[] = [];
for (const { before, after } of boards) {
  if (picked.length >= want) break;
  if (picked.some((p) => p.seed === before.seed)) continue;
  // Each goal on its own cut of the board (both together can be too wide for a phone).
  const cb = cut(before), ca = cut(after);
  const b = remeasure(cb.blocks, before), a = remeasure(ca.blocks, after);
  // Still about 12 moves each on the cut board, as close as the pair allows, the after one with more extra moves.
  if (Math.abs(a.fewest - 12) > 2 || Math.abs(b.fewest - 12) > 2 || Math.abs(a.fewest - b.fewest) > 2 || a.extra - b.extra < 2) {
    console.log(`board ${before.seed}: before ${b.fewest} moves ${b.extra} extra, after ${a.fewest} moves ${a.extra} extra on the cut board: not a pair`);
    continue;
  }
  const k = picked.length + 1, afterFirst = k % 2 === 1;
  const sides = [{ side: "after" as const, goal: a, ...ca }, { side: "before" as const, goal: b, ...cb }];
  if (!afterFirst) sides.reverse();
  picked.push({ label: `M${k}`, seed: before.seed, walls: before.walls, aim: before.aim, sides: sides.map((s, i) => ({ label: `M${k}${i ? "B" : "A"}`, ...s })) });
  console.log(`M${k}: seed ${before.seed} walls ${before.walls}: ${sides.map((s, i) => `${i ? "B" : "A"} ${s.side} ${s.goal.fewest}${s.goal.exact ? "" : "?"} moves, ${s.goal.extra} extra, red ${s.goal.redMoves}x`).join("; ")}`);
}

const ts = `// Blind trial pairs of the maker before and after it weighed extra moves (reports/extra-maker.html,
// made by test/experiments/maker-trials.ts): on one board each pair, the goal the maker picked
// before and the one it picks now, both about 12 moves; ?trial=M1A etc. Which is which is only
// in the report.
import type { Trial } from "./trials";

export const MAKER_TRIALS: Trial[] = [
${picked.flatMap((p) => p.sides.map((s) => `  {
    label: ${JSON.stringify(s.label)}, red: ${JSON.stringify(s.goal.red)}, target: ${JSON.stringify(s.goal.target)}, fewest: ${s.goal.fewest},
    blocks: ${JSON.stringify(s.blocks)},
    solution: ${JSON.stringify(s.goal.solution)},
  },`)).join("\n")}
];
`;
writeFileSync("src/trials-maker.ts", ts.replace(/"(\w+)":/g, "$1:"));
writeFileSync(out, JSON.stringify(picked));
console.log(`${picked.length} pairs of ${boards.length} boards: src/trials-maker.ts, ${out}`);
