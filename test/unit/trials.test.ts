// The trial boards (src/trials.ts, src/trials-maker.ts): every one's proof is a legal goal of
// its stated fewest moves on its board, and every label is unique.
import { expect, test } from "bun:test";
import { contractGoal, WISHES, WORLD_VERSION } from "../../src/contract";
import { referee } from "../../src/referee";
import { TRIALS } from "../../src/trials";
import { MAKER_TRIALS } from "../../src/trials-maker";

const all = [...TRIALS, ...MAKER_TRIALS];
test("every trial's proof is legal and as long as its fewest", () => {
  for (const t of all) {
    const request = { version: 1, world: { seed: 0, density: 0, ui: {}, version: WORLD_VERSION, placed: t.blocks }, moved: {}, history: [], rampAim: null, wishes: WISHES, seed: 1 };
    expect([t.label, referee(request, contractGoal({ id: t.red, target: t.target, solution: t.solution }))]).toEqual([t.label, { ok: true }]);
    expect([t.label, t.solution.length]).toEqual([t.label, t.fewest]);
  }
  expect(new Set(all.map((t) => t.label)).size).toBe(all.length);
});
