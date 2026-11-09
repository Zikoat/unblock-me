// The goals in extra-maker.ts's files audited (bench/auditor.ts: boxes 5 and 8 cells round
// red's run and the blocks that matter, up to --limit boards each): a goal's extra moves are
// its proof's, and a proof the maker's measure did not prove shortest may move blocks again
// that a shortest one would not. Adds "audit": { fewest, exact, extra, redMoves } to each
// found line, the shorter solution's when one turns up, in place:
//   bun test/experiments/extra-audit.ts data/extra-maker/after-e0-w0-a12.jsonl [...] [--limit 100000]
import { Board } from "../../src/board";
import { measure } from "../../src/difficulty";
import { tidy } from "../../src/goal-fast";
import { extraMoves } from "../../src/judge";
import { randomLayout } from "../../src/layout";
import type { Move } from "../../src/rules";
import { AUDITS } from "../../bench/auditor";

const args = process.argv.slice(2);
const li = args.indexOf("--limit"), limit = li >= 0 ? Number(args.splice(li, 2)[1]) : 100_000;
for (const file of args) {
  const lines = (await Bun.file(file).text()).trim().split("\n").map((l) => JSON.parse(l));
  for (const l of lines) {
    if (!l.found || l.audit) continue;
    const board = new Board(randomLayout(l.seed, { tries: l.density, walls: l.walls, island: false }));
    const proof: Move[] = l.goal.moves.map(([id, fx, fy, tx, ty]: [string, number, number, number, number]) => ({ id, from: { x: fx, y: fy }, to: { x: tx, y: ty } }));
    const goal = { id: l.goal.red, target: l.goal.target, solution: proof };
    const runs = AUDITS.map((a) => measure(board, goal, { limit, ...a }));
    const best = runs.reduce((a, b) => ((b.solution?.length ?? Infinity) < (a.solution?.length ?? Infinity) ? b : a));
    const solution = best.solution && best.solution.length < proof.length ? tidy(board, goal.id, goal.target, best.solution) : proof;
    l.audit = { fewest: solution.length, exact: runs.some((r) => r.moves !== null && r.moves === solution.length), extra: extraMoves(solution.map((m) => m.id)), redMoves: solution.filter((m) => m.id === goal.id).length };
  }
  await Bun.write(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(file);
}
