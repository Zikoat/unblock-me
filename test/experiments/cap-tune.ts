// Tune the measure's cap (src/difficulty.ts, `limit`; src/goal-search.ts, LEVELS_OF_EFFORT
// `exact`): at which cap does the number the game shows as the fewest moves (the measure's
// M when exact, else the best known solution's length) match the true fewest in 95% of
// goals? For each board the tournament's rough stage runs once; then for each cap the
// finalists are measured at that cap and the goal chosen as in makeGoalTournament; a
// reference measure with a far larger cap on each chosen goal says whether a shorter
// solution exists. Run it capped, one density at a time:
//   scripts/capped.sh 2500 1800 bun test/experiments/cap-tune.ts <tries> <seeds> <level> <ref> <cap...> [--offset n] [--out file]
// Prints one line per cap and appends per-goal JSON lines to --out for the bootstrap
// (test/experiments/cap-bootstrap.ts).
import { appendFileSync } from "node:fs";
import { Board } from "../../src/board";
import { measure } from "../../src/difficulty";
import { pushes, simplifyFast } from "../../src/goal-fast";
import { balance, LEVELS_OF_EFFORT, type Ranked } from "../../src/goal-search";
import { randomLayout } from "../../src/layout";

const args = process.argv.slice(2);
const take = (flag: string, d: string): string => {
  const i = args.indexOf(flag);
  if (i < 0) return d;
  const [, v] = args.splice(i, 2);
  return v!;
};
const offset = Number(take("--offset", "0"));
const out = take("--out", "");
const [tries, seeds, level, ref, ...caps] = args.map(Number) as number[];
const effort = LEVELS_OF_EFFORT[level!]!;
const rank = (a: Ranked, b: Ranked) => balance(b) - balance(a) || a.solution.length - b.solution.length || a.distance - b.distance;

type Row = { cap: number; shown: number; exact: boolean; ms: number; searched: number; refMoves: number | null; refAtLeast: number; refMs: number };
const rows: Row[] = [];
const refCache = new Map<string, { moves: number | null; atLeast: number; ms: number; searched: number }>();
let roughMs = 0;
for (let s = 1; s <= seeds!; s++) {
  const seed = s + offset;
  const layout = randomLayout(seed * 7919, { tries: tries! });
  const near = { x: (seed % 5) * 7, y: 6 + (seed % 3) * 5 };
  const board = new Board(layout, new Map());
  // The rough stage, as makeGoalTournament.
  const t0 = performance.now();
  const all = pushes(board, layout, near, { perCell: effort.perCell ?? 6 }, effort.tuning);
  const candidates: Ranked[] = [];
  const stride = effort.stride ?? 1;
  for (const p of all) {
    for (let k = p.steps.length - 1; k >= 0; k--) {
      if ((k + 1) % stride !== 0 && k !== p.steps.length - 1) continue;
      const step = p.steps[k]!;
      const solution = simplifyFast(board, p.raw.slice(0, step.moves));
      const goal = { id: p.id, target: step.at, solution };
      candidates.push({ ...goal, difficulty: measure(board, goal, { limit: effort.rough }), distance: k + 1 });
    }
  }
  candidates.sort(rank);
  const top = candidates.slice(0, effort.finalists);
  roughMs += performance.now() - t0;
  if (!top.length) continue;
  for (const cap of caps) {
    const t = performance.now();
    let searched = 0;
    const measured = top.map((c) => {
      const d = measure(board, c, { limit: cap });
      searched += d.searched;
      return { ...c, difficulty: d, solution: d.solution && d.solution.length < c.solution.length ? d.solution : c.solution };
    });
    measured.sort(rank);
    const best = measured[0]!;
    const ms = performance.now() - t;
    const shown = best.difficulty.moves ?? best.solution.length;
    const key = `${best.id}@${best.target.x},${best.target.y}`;
    let r = refCache.get(key);
    if (!r) {
      const tr = performance.now();
      const d = measure(board, best, { limit: ref });
      r = { moves: d.moves, atLeast: d.atLeast, ms: performance.now() - tr, searched: d.searched };
      refCache.set(key, r);
    }
    const row: Row = { cap, shown, exact: best.difficulty.moves !== null, ms, searched, refMoves: r.moves, refAtLeast: r.atLeast, refMs: r.ms };
    rows.push(row);
    if (out) appendFileSync(out, JSON.stringify({ tries, level, seed, ...row, refSearched: r.searched }) + "\n");
  }
}
console.log(`tries ${tries} level ${level} seeds ${seeds} (offset ${offset}): rough stage ${(roughMs / seeds!).toFixed(0)}ms/goal, reference cap ${ref}`);
for (const cap of caps) {
  const at = rows.filter((r) => r.cap === cap);
  const shorter = at.filter((r) => r.refMoves !== null && r.refMoves < r.shown).length;
  const unknown = at.filter((r) => r.refMoves === null && r.refAtLeast < r.shown).length;
  const exact = at.filter((r) => r.exact).length;
  const ms = at.reduce((a, r) => a + r.ms, 0) / at.length;
  const worst = Math.max(...at.map((r) => r.ms));
  const refMs = at.reduce((a, r) => a + r.refMs, 0) / at.length;
  console.log(`cap ${String(cap).padStart(8)}: shorter ${shorter}/${at.length} (${((100 * shorter) / at.length).toFixed(1)}%), unresolved ${unknown}, exact ${exact}, ${ms.toFixed(0)}ms/goal (worst ${worst.toFixed(0)}), ref ${refMs.toFixed(0)}ms`);
}
