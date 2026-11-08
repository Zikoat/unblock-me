// The Referee (src/referee.ts) against an independent check, on goals from a Bench run and
// mutants of them (a move dropped, two swapped, a move or the target off by one, a move
// doubled, a stray move added, another red block): the independent check replays with the
// game's own drag rule (src/frozen.ts replay, src/rules.ts slide) instead of the Board, and
// says legal or not and which rule. Prints every disagreement.
//   bun test/experiments/referee-fuzz.ts [bench/results/<maker>-<set>.json ...]
import { movedMap, worldLayout, type Goal, type Move, type Request } from "../../src/contract";
import { replay } from "../../src/frozen";
import { referee } from "../../src/referee";
import type { Case } from "../../bench/cases";

const files = process.argv.slice(2);
const cases: Case[] = await Bun.file(new URL("../../bench/cases-full.json", import.meta.url).pathname).json();
const byName = new Map(cases.map((c) => [c.name, c.request]));

/** Legal or not, and the rule broken, by replaying with the game's drag rule. */
function oracle(request: Request, goal: Goal): number {
  const layout = worldLayout(request.world), start = movedMap(request.moved);
  const red = layout.byId(goal.red);
  if (!red || red.wall || red.ui) return 1;
  if (goal.moves.length > 100) return 5;
  const game = (moves: Move[]) => moves.map((m) => ({ id: m.block, from: m.from, to: m.to }));
  const ends = (moves: Move[]) => {
    const after = replay(layout, game(moves), start);
    const at = after && (after.moved.get(goal.red) ?? red);
    return after === null ? null : at!.x === goal.target.x && at!.y === goal.target.y;
  };
  for (let i = 0; i < goal.moves.length; i++) {
    const m = goal.moves[i]!;
    if (m.from.x === m.to.x && m.from.y === m.to.y) return 2;
    // (replay finds the block by a cell of it, so check it is exactly at `from`.)
    const before = replay(layout, game(goal.moves.slice(0, i)), start)!, home = layout.byId(m.block);
    const at = before.moved.get(m.block) ?? home;
    if (!at || at.x !== m.from.x || at.y !== m.from.y) return 2;
    if (replay(layout, game(goal.moves.slice(0, i + 1)), start) === null) return 2;
  }
  if (!ends(goal.moves)) return 3;
  const home = start.get(goal.red) ?? red;
  if (home.x === goal.target.x && home.y === goal.target.y) return 3;
  for (let i = 1; i < goal.moves.length; i++) if (goal.moves[i]!.block === goal.moves[i - 1]!.block) return 4;
  for (let i = 0; i < goal.moves.length; i++) if (ends(goal.moves.filter((_, k) => k !== i))) return 4;
  return 0;
}

let seed = 1;
const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
const shift = (m: Move, d: number): Move => (m.from.x !== m.to.x ? { ...m, to: { x: m.to.x + d, y: m.to.y } } : { ...m, to: { x: m.to.x, y: m.to.y + d } });
function mutants(goal: Goal): Goal[] {
  const n = goal.moves.length, out: Goal[] = [goal];
  if (!n) return out;
  const i = rand(n), j = Math.min(n - 1, i + 1);
  out.push({ ...goal, moves: goal.moves.filter((_, k) => k !== i) });
  const swapped = [...goal.moves];
  [swapped[i], swapped[j]] = [swapped[j]!, swapped[i]!];
  out.push({ ...goal, moves: swapped });
  out.push({ ...goal, moves: goal.moves.map((m, k) => (k === i ? shift(m, rand(2) ? 1 : -1) : m)) });
  out.push({ ...goal, target: { x: goal.target.x + (rand(2) ? 1 : -1), y: goal.target.y } });
  out.push({ ...goal, moves: [...goal.moves.slice(0, i + 1), goal.moves[i]!, ...goal.moves.slice(i + 1)] });
  const m = goal.moves[i]!;
  out.push({ ...goal, moves: [...goal.moves.slice(0, i), { block: m.block, from: m.from, to: m.from }, ...goal.moves.slice(i)] });
  out.push({ ...goal, moves: [...goal.moves, { block: m.block, from: m.to, to: m.from }, { ...m }] });
  out.push({ ...goal, red: goal.moves[0]!.block });
  return out;
}

let checked = 0, illegal = 0, disagree = 0;
for (const file of files) {
  const { results } = await Bun.file(file).json();
  for (const r of results as { name: string; goal: Goal | null }[]) {
    if (!r.goal) continue;
    const request = byName.get(r.name)!;
    for (const g of mutants(r.goal)) {
      const v = referee(request, g), o = oracle(request, g);
      checked++;
      if (o) illegal++;
      if ((v.ok ? 0 : v.rule) !== o) {
        disagree++;
        console.log(`${r.name}: referee ${v.ok ? "ok" : `rule ${v.rule} (${v.why})`}, independent ${o || "ok"}`);
      }
    }
  }
}
console.log(`${checked} goals checked (${illegal} illegal by the independent check), ${disagree} disagreements`);
