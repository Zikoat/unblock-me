// One world goal made step by step, with what each step looked at, for reports/goal-trace.html:
// the tournament (src/goal-search.ts makeGoalTournament) done again here with its parts, the
// push search's moves cell by cell, every candidate's rough measure, and the boards the exact
// measure's A* expanded for each finalist (src/difficulty.ts, through its trace). Checks it
// made the same goal as makeGoalHard.
//   scripts/capped.sh 2000 300 bun test/experiments/goal-trace.ts [seed near.x near.y] > out.json
// (the report's `const DATA = ...;` line is that JSON).
import { Board } from "../../src/board";
import { measure, type Difficulty } from "../../src/difficulty";
import { rampTarget } from "../../src/goal";
import { candidatesNear, clearCellOn, pushes, simplifyFast } from "../../src/goal-fast";
import { balance, LEVELS_OF_EFFORT, makeGoalHard, onTrack, type Ranked } from "../../src/goal-search";
import { randomLayout } from "../../src/layout";
import type { Move } from "../../src/rules";
import type { Window } from "../../src/window";

const SEED = Number(process.argv[2] ?? 7), TRIES = 12, LEVEL = 2, NEAR = { x: Number(process.argv[3] ?? 20), y: Number(process.argv[4] ?? 6) };
const TARGET = rampTarget(15)!;
/** Boards kept of each finalist's search, for the film: the first ones, then evenly spaced. */
const FRAMES = 160, FIRST = 40;

const layout = randomLayout(SEED, { tries: TRIES });
const opts = { ...LEVELS_OF_EFFORT[LEVEL]!, target: TARGET };
const { rough, exact, finalists, tuning } = opts as Required<typeof opts>;
const board = new Board(layout);
const move = (m: Move) => ({ id: m.id, from: [m.from.x, m.from.y], to: [m.to.x, m.to.y] });

// The push search, as the tournament runs it; then each push split into its cells.
const red = candidatesNear(board, layout, NEAR, new Set(), tuning.candidates).map((b) => b.id);
const all = pushes(board, layout, NEAR, { perCell: opts.perCell ?? 6 }, tuning);
const pushLog = all.map((p) => {
  let from = 0;
  const cells = p.steps.map((s) => {
    const plan = p.raw.slice(from, s.moves).map(move);
    from = s.moves;
    return { at: [s.at.x, s.at.y], plan };
  });
  // Why it stopped: the next cell could not be cleared in perCell moves, or its share of
  // the ticks ran out (the cell can be cleared given more).
  const mark = board.mark();
  for (const m of p.raw) board.move(m.id, m.to);
  const b = board.block(p.id), h = b.w > b.h;
  const ahead = h ? { x: p.dir > 0 ? b.x + b.w : b.x - 1, y: b.y } : { x: b.x, y: p.dir > 0 ? b.y + b.h : b.y - 1 };
  const more = clearCellOn(board, ahead, new Set([p.id]), { maxMoves: opts.perCell ?? 6, prune: true, lookahead: true });
  board.undo(mark);
  return { id: p.id, dir: p.dir, cells, stop: more ? "ticks" : "stuck", ahead: [ahead.x, ahead.y] };
});

// Every cell a candidate, measured roughly (as makeGoalTournament does).
const diff = (d: Difficulty) => ({ moves: d.moves, atLeast: d.atLeast, branching: +d.branching.toFixed(2), score: +d.score.toFixed(1), searched: d.searched });
const candidates: (Ranked & { push: number; k: number; proof: number })[] = [];
all.forEach((p, pi) => {
  for (let k = p.steps.length - 1; k >= 0; k--) {
    const step = p.steps[k]!;
    const solution = simplifyFast(board, p.raw.slice(0, step.moves));
    const goal = { id: p.id, target: step.at, solution };
    candidates.push({ ...goal, difficulty: measure(board, goal, { limit: rough }), distance: k + 1, train: onTrack(board, p.id, step.at), push: pi, k, proof: solution.length });
  }
});
const off = (c: Ranked) => Math.abs((c.difficulty.moves ?? c.difficulty.atLeast) - TARGET);
const rank = (a: Ranked, b: Ranked) => off(a) - off(b) || balance(b) - balance(a) || a.solution.length - b.solution.length || a.distance - b.distance;
const order = [...candidates].sort(rank);
const roughOf = new Map(candidates.map((c) => [c, diff(c.difficulty)]));

// The finalists measured exactly, every board the A* expanded noted.
const top = order.slice(0, finalists);
const finals = top.map((c) => {
  let win: Window | null = null, r = 0, want = 0;
  const expansions: { greedy: boolean; g: number; f: number; state: number[] }[] = [];
  const pushSolution = c.solution;
  c.difficulty = measure(board, c, {
    limit: exact,
    trace: {
      window: (w, ri, wi) => ((win = w), (r = ri), (want = wi)),
      expand: (greedy, g, f, state) => expansions.push({ greedy, g, f, state: [...state] }),
    },
  });
  if (c.difficulty.solution && c.difficulty.solution.length < c.solution.length) c.solution = c.difficulty.solution;
  const w = win!;
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(FIRST, expansions.length); i++) keep.add(i);
  for (let i = 0; i < FRAMES - FIRST; i++) keep.add(Math.floor((i * (expansions.length - 1)) / (FRAMES - FIRST - 1)));
  // Where the red block stood on the boards expanded, and how many boards per bucket.
  const heat: Record<number, number> = {}, buckets: Record<string, number> = {};
  for (const e of expansions) {
    heat[e.state[r]!] = (heat[e.state[r]!] ?? 0) + 1;
    const key = `${e.greedy ? "greedy" : "exact"} ${e.f}`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return {
    candidate: candidates.indexOf(c),
    window: { x0: w.x0, y0: w.y0, W: w.W, H: w.H, sliders: w.sliders, start: [...w.start], r, want },
    expanded: expansions.length,
    greedy: expansions.filter((e) => e.greedy).length,
    frames: [...keep].sort((a, b) => a - b).map((i) => ({ i, ...expansions[i]! })),
    heat,
    buckets,
    pushSolution: pushSolution.map(move),
    solution: c.solution.map(move),
    difficulty: diff(c.difficulty),
  };
});
top.sort(rank);
const best = top[0]!;
const check = makeGoalHard(layout, NEAR, { target: TARGET }, LEVEL)!;
if (check.id !== best.id || check.target.x !== best.target.x || check.target.y !== best.target.y) throw new Error(`not the game's goal: ${check.id} ${JSON.stringify(check.target)}`);

// The blocks round everything touched.
let x0 = NEAR.x - 4, y0 = NEAR.y - 4, x1 = NEAR.x + 4, y1 = NEAR.y + 4;
const touch = (x: number, y: number, w = 2, h = 2) => ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x + w)), (y1 = Math.max(y1, y + h)));
for (const p of pushLog) for (const c of p.cells) for (const m of c.plan) touch(m.to[0]!, m.to[1]!), touch(m.from[0]!, m.from[1]!);
for (const f of finals) touch(f.window.x0, f.window.y0, f.window.W, f.window.H);
x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
const blocks = layout.blocksIn({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, fixed: !!(b.wall || b.ui) }));

console.log(JSON.stringify({
  seed: SEED, tries: TRIES, level: LEVEL, near: NEAR, target: TARGET, settings: { rough, exact, finalists, perCell: opts.perCell ?? 6, goalBudget: tuning.goalBudget, cellCost: tuning.cellCost, candidates: tuning.candidates },
  area: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, blocks, red,
  pushes: pushLog,
  candidates: candidates.map((c) => ({ id: c.id, target: [c.target.x, c.target.y], push: c.push, k: c.k, distance: c.distance, train: c.train, proof: c.proof, rough: roughOf.get(c), off: off(c), balance: +balance({ ...c, difficulty: roughOf.get(c) as Difficulty }).toFixed(3) })),
  order: order.map((c) => candidates.indexOf(c)),
  finals,
  winner: candidates.indexOf(best),
}));
console.error(`goal ${best.id} -> ${JSON.stringify(best.target)}: ${best.difficulty.moves ?? best.difficulty.atLeast} moves; ${candidates.length} candidates, ${all.length} pushes; finalists expanded ${finals.map((f) => f.expanded).join(", ")}`);
