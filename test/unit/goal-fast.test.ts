// The push search: how far a push gets, which blocks it may push, and the tick budget.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import { candidatesNear, pushes, simplifyFast } from "../../src/goal-fast";
import { makeGoalHard } from "../../src/goal-search";
import { fixedLayout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
const FAST = { prune: true, lookahead: true };
const push = (board: Board, all: ReturnType<typeof pushes>, id: string, dir: number) => {
  const p = all.find((q) => q.id === id && q.dir === dir)!;
  return { to: p.steps.at(-1)?.at, solution: simplifyFast(board, p.raw) };
};

describe("pushes", () => {
  test("a push clears the blockers it can and stops at a wall", () => {
    // v blocks r at x 3 but can drop one cell (walls above and below it); a wall at x 7.
    const layout = fixedLayout([H("r", 0, 0), V("v", 3, 0), W(3, -1), W(3, 3), W(7, 0), W(-1, 0)]);
    const board = new Board(layout);
    expect(push(board, pushes(board, layout, { x: 0, y: 0 }, {}, FAST), "r", 1)).toEqual({
      to: { x: 5, y: 0 },
      solution: [
        { id: "v", from: { x: 3, y: 0 }, to: { x: 3, y: 1 } },
        { id: "r", from: { x: 0, y: 0 }, to: { x: 5, y: 0 } },
      ],
    });
  });

  test("no cell cap: in open space a push stops when its share of the ticks is spent", () => {
    const layout = fixedLayout([H("r", 0, 0), W(-1, 0)]);
    const board = new Board(layout);
    // One candidate, two pushes: the right one (first) gets half the ticks.
    expect(push(board, pushes(board, layout, { x: 0, y: 0 }, {}, { goalBudget: 100, cellCost: 1 }), "r", 1).to).toEqual({ x: 50, y: 0 });
    expect(push(board, pushes(board, layout, { x: 0, y: 0 }, {}, { goalBudget: 100, cellCost: 10 }), "r", 1).to).toEqual({ x: 5, y: 0 });
  });

  test("it starts from the board as it is, moved blocks included", () => {
    const layout = fixedLayout([H("r", 0, 0), W(-1, 0), W(7, 0)]);
    const board = new Board(layout, new Map([["r", { x: 4, y: 0 }]]));
    expect(push(board, pushes(board, layout, { x: 4, y: 0 }, {}, FAST), "r", 1).to).toEqual({ x: 5, y: 0 });
  });
});

describe("the red block", () => {
  test("excluded blocks are never candidates, nor blocks on an excluded block's track", () => {
    // s shares r's row; v crosses it but runs on its own column; t has its own row.
    const layout = fixedLayout([H("r", 0, 0), H("s", 3, 0), V("v", 2, 1), H("t", 0, 4)]);
    const ids = (exclude: string[]) => candidatesNear(new Board(layout), layout, { x: 2, y: 1 }, new Set(exclude)).map((b) => b.id).sort();
    expect(ids([])).toEqual(["r", "s", "t", "v"]);
    expect(ids(["r"])).toEqual(["t", "v"]);
    expect(ids(["r", "v", "t"])).toEqual([]);
  });

  test("no goal when nothing nearby can move", () => {
    expect(makeGoalHard(fixedLayout([W(-1, 0), H("r", 0, 0), W(2, 0)]), { x: 0, y: 0 }, {}, 0)).toBeNull();
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
