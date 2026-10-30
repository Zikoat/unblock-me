// The difficulty-first goal searches: their solutions replay and end on the target, they
// honour exclude and avoid, they are deterministic, and the tournament's goals measure
// harder than the push search's.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import { difficulty } from "../../src/difficulty";
import { replay } from "../../src/frozen";
import { makeGoalFast } from "../../src/goal-fast";
import { makeGoalDeep, makeGoalHard, makeGoalTournament } from "../../src/goal-search";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";
import { isHorizontal } from "../../src/rules";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });

describe("goal search", () => {
  test("deepest: the target furthest in moves, with a shortest solution", () => {
    // r can slide to 1 freely; to get to 4 it needs v out of the way, which needs u out of v's way.
    const layout = fixedLayout([W(-1, 0), H("r", 0, 0), V("v", 3, 0), V("u", 3, -2), W(3, 2), W(6, 0)]);
    const goal = makeGoalDeep(layout, { x: 0, y: 0 }, { states: 10_000, candidates: 1 })!;
    expect(goal.id).toBe("r");
    expect(goal.target).toEqual({ x: 4, y: 0 });
    expect(goal.depth).toBe(3);
    expect(goal.solution.length).toBe(3);
    expect(replay(layout, goal.solution)!.moved.get("r")).toEqual({ x: 4, y: 0 });
  });

  test("random boards: solutions replay onto the target, exclude and avoid hold, the same input gives the same goal", () => {
    for (const tries of [3, 7, 15, 25]) {
      const layout = randomLayout(tries * 11, { tries });
      const near = { x: tries, y: -tries };
      const board = new Board(layout);
      const first = board.block(board.at(near.x, near.y) ?? board.at(near.x + 1, near.y) ?? "");
      const exclude = new Set(first ? [first.id] : []);
      const avoid = [{ x: near.x - 2, y: near.y - 2, width: 4, height: 4 }];
      for (const make of [
        () => makeGoalTournament(layout, near, { rough: 300, exact: 3_000, finalists: 2, exclude, avoid }),
        () => makeGoalDeep(layout, near, { states: 3_000, exclude, avoid }),
      ]) {
        const goal = make()!;
        expect(goal).not.toBeNull();
        expect(JSON.stringify(make())).toBe(JSON.stringify(goal));
        const after = replay(layout, goal.solution)!;
        expect(after).not.toBeNull();
        expect(after.moved.get(goal.id)).toEqual(goal.target);
        expect(exclude.has(goal.id)).toBe(false);
        const red = layout.byId(goal.id)!;
        for (const id of exclude) {
          const b = layout.byId(id)!;
          expect(isHorizontal(b) === isHorizontal(red) && (isHorizontal(b) ? b.y === red.y : b.x === red.x)).toBe(false);
        }
        for (const a of avoid) expect(goal.target.x < a.x + a.width && goal.target.x + red.w > a.x && goal.target.y < a.y + a.height && goal.target.y + red.h > a.y).toBe(false);
      }
    }
  }, 30_000);

  test("the tournament's goals measure at least as hard as the push search's", () => {
    let harder = 0;
    for (const tries of [7, 15]) {
      const layout = randomLayout(tries, { tries });
      const near = { x: 20, y: 20 };
      const fast = makeGoalFast(layout, near, { effort: 12, perCell: 6 }, { prune: true, lookahead: true, goalBudget: 50_000 })!;
      const hard = makeGoalHard(layout, near, {}, 0)!;
      const a = difficulty(layout, new Map(), fast, { limit: 5_000 });
      expect(hard.difficulty.score).toBeGreaterThanOrEqual(a.score);
      if (hard.difficulty.score > a.score) harder++;
    }
    expect(harder).toBeGreaterThan(0);
  }, 30_000);
});
