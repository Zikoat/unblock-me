// Extra moves in the maker's goals (reports/extra-moves.html, "The maker"): fresh boards at
// the game's density, today's maker asked for a goal round the origin with a ramp aim (or
// none), and per board the goal it picks with its extra moves (Σ over moved blocks of (times
// moved − 1), red counting), fewest moves, decisions and time, and the candidate pool it
// picked from (goal-search.ts Watch): how many candidates near the aim, and their extra moves
// on their push proofs. Self-contained (its own extra count), so the same file runs on an
// older checkout for a before and after on the same seeds:
//   bun test/experiments/extra-maker.ts --walls 0.04 --boards 60 --aim 12 --out data/extra-maker/after-w4-a12.jsonl [--density 12] [--effort 0] [--from 0]
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Board } from "../../src/board";
import { contractGoal, WISHES, WORLD_VERSION, type Request } from "../../src/contract";
import { decisionStages } from "../../src/decisions";
import { LEVELS_OF_EFFORT, makeGoalHard, type Ranked } from "../../src/goal-search";
import { judge } from "../../src/judge";
import { randomLayout } from "../../src/layout";
import type { Move } from "../../src/rules";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const walls = Number(arg("walls", "0")), density = Number(arg("density", "12")), boards = Number(arg("boards", "20"));
const from = Number(arg("from", "0")), effort = Number(arg("effort", "0")), out = arg("out", "data/extra-maker/run.jsonl");
const aim = arg("aim", "12") === "none" ? null : Number(arg("aim", "12"));
mkdirSync(dirname(out), { recursive: true });
// (EXTRA=<power> tries another weight for the extra moves.)
if (process.env.EXTRA) (WISHES as { extra?: number }).extra = Number(process.env.EXTRA);
// (FINALISTS, EXACT: more finalists, measured further, as the maker would with time to spare.)
if (process.env.FINALISTS) LEVELS_OF_EFFORT[effort]!.finalists = Number(process.env.FINALISTS);
if (process.env.EXACT) Object.assign(LEVELS_OF_EFFORT[effort]!, { exact: Number(process.env.EXACT), reach: { depth: 8, most: 60 } });

const extra = (moves: { id: string }[]) => moves.length - new Set(moves.map((m) => m.id)).size;
const round = (x: number, k = 1000) => Math.round(x * k) / k;
const compact = (moves: Move[]) => moves.map((m) => [m.id, m.from.x, m.from.y, m.to.x, m.to.y]);

const lines: string[] = [];
for (let i = 0; i < boards; i++) {
  const seed = 100_000 * density + from + i;
  const request: Request = {
    version: 1, world: { seed, density, ...(walls && { walls }), ui: { island: false }, version: WORLD_VERSION },
    moved: {}, history: [], rampAim: aim, wishes: WISHES, seed: 1,
  };
  const layout = randomLayout(seed, { tries: density, walls, island: false });
  layout.blocksIn({ x: -24, y: -24, width: 48, height: 48 }); // generated before the clock starts
  const board = new Board(layout);
  let pool: { n: number; nearAim: number; nearAimExtra2: number; maxExtraNearAim: number; finalistsExtra: number[] } = { n: 0, nearAim: 0, nearAimExtra2: 0, maxExtraNearAim: 0, finalistsExtra: [] };
  const t0 = performance.now();
  let paused = 0;
  const found = makeGoalHard(layout, { x: 0, y: 0 }, {
    moved: new Map(), exclude: new Set(), avoid: [], ...(aim !== null && { target: aim }),
    watch: {
      ranked(cands: readonly Ranked[], finalists: number) {
        const t = performance.now();
        const near = cands.filter((c) => aim === null || Math.abs((c.difficulty.moves ?? c.difficulty.atLeast) - aim) <= 1);
        const ex = near.map((c) => extra(c.difficulty.solution && c.difficulty.solution.length < c.solution.length ? c.difficulty.solution : c.solution));
        pool = { n: cands.length, nearAim: near.length, nearAimExtra2: ex.filter((e) => e >= 2).length, maxExtraNearAim: Math.max(0, ...ex), finalistsExtra: cands.slice(0, finalists).map((c) => extra(c.solution)) };
        paused += performance.now() - t;
      },
    },
  }, effort);
  const ms = performance.now() - t0 - paused;
  if (!found) {
    lines.push(JSON.stringify({ seed, walls, density, aim, effort, found: false, ms: round(ms), pool }));
    continue;
  }
  const goal = contractGoal(found), red = board.block(found.id);
  const terms = judge(request, goal, { board });
  const d = found.difficulty, proof = found.solution;
  lines.push(JSON.stringify({
    seed, walls, density, aim, effort, found: true, ms: round(ms), pool,
    fewest: d.moves, atLeast: d.atLeast, exact: d.moves !== null && d.moves === proof.length, proof: proof.length,
    extra: extra(proof), extraNoRed: extra(proof.filter((m) => m.id !== found.id)), redMoves: proof.filter((m) => m.id === found.id).length,
    blocks: new Set(proof.map((m) => m.id)).size, decisions: decisionStages(board, goal).reduce((a, b) => a + b, 0),
    distance: found.distance, fitness: round(terms.fitness),
    goal: { red: found.id, start: { x: red.x, y: red.y }, target: found.target, moves: compact(proof) },
  }));
  if (process.stderr.isTTY) process.stderr.write(`\r${i + 1}/${boards}`);
}
await Bun.write(out, lines.join("\n") + "\n");
console.log(`${boards} boards: ${out}`);
