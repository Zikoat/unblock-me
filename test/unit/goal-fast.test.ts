// The indexed, pruned goal search makes the same goals as makeGoal.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import { replay } from "../../src/frozen";
import { makeGoal } from "../../src/goal";
import { makeGoalFast } from "../../src/goal-fast";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
const FAST = { prune: true, lookahead: true };

describe("makeGoalFast", () => {
  test("small boards: the same goals as makeGoal, exclude, avoid and moved blocks included", () => {
    const boards = [
      { layout: fixedLayout([H("r", 0, 0), V("v", 3, 0), W(3, -1), W(3, 3), W(7, 0), W(-1, 0)]), near: { x: 0, y: 0 }, options: { effort: 10 } },
      { layout: fixedLayout([W(-1, 0), H("r", 0, 0), W(9, 0)]), near: { x: 0, y: 0 }, options: { effort: 3, avoid: [{ x: 4, y: 0, width: 2, height: 1 }] } },
      { layout: fixedLayout([H("r", 0, 0), H("s", 3, 0), V("v", 2, 1), H("t", 0, 4)]), near: { x: 2, y: 1 }, options: { effort: 3, exclude: new Set(["r"]) } },
      { layout: fixedLayout([H("r", 0, 0), W(-1, 0)]), near: { x: 4, y: 0 }, options: { effort: 2, moved: new Map([["r", { x: 4, y: 0 }]]) } },
      { layout: fixedLayout([W(-1, 0), H("r", 0, 0), W(2, 0)]), near: { x: 0, y: 0 }, options: {} },
    ];
    for (const { layout, near, options } of boards) expect(makeGoalFast(layout, near, options, FAST)).toEqual(makeGoal(layout, near, options));
  });

  test("random boards: the same goals as makeGoal, and they replay", () => {
    for (const tries of [7, 25]) {
      for (const seed of [1, 2]) {
        const layout = randomLayout(seed, { tries });
        const near = { x: seed * 13, y: -seed * 7 };
        const goal = makeGoalFast(layout, near, { effort: 6 }, FAST);
        expect(goal).toEqual(makeGoal(layout, near, { effort: 6 }));
        expect(replay(layout, goal!.solution)!.moved.get(goal!.id)).toEqual(goal!.target);
      }
    }
  });
});

describe("Board", () => {
  test("finds moved blocks by cell, and undo puts them back", () => {
    const layout = fixedLayout([H("a", 0, 0), V("b", 5, 0)]);
    const board = new Board(layout, new Map([["a", { x: 2, y: 0 }]]));
    expect([board.at(0, 0), board.at(2, 0), board.at(3, 0), board.at(5, 1)]).toEqual([null, "a", "a", "b"]);
    const mark = board.mark();
    expect(board.legal({ id: "a", from: { x: 2, y: 0 }, to: { x: 4, y: 0 } })).toBe(false);
    board.move("a", { x: 3, y: 0 });
    expect([board.at(2, 0), board.at(4, 0)]).toEqual([null, "a"]);
    board.undo(mark);
    expect([board.at(2, 0), board.at(4, 0)]).toEqual(["a", null]);
  });
});
