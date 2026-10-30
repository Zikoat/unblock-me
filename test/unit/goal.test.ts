// Goals made by pushing one block as far as it goes.
import { describe, expect, test } from "bun:test";
import { replay } from "../../src/frozen";
import { makeGoal, merge, simplify, solved } from "../../src/goal";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });

describe("makeGoal", () => {
  test("it pushes the block past blockers it can clear, and stops at a wall", () => {
    // r in row 0; v blocks it at x 3 but can drop one cell (walls above and below it); a
    // wall at x 7. v itself can only move 1, so r is the block that goes furthest.
    const layout = fixedLayout([H("r", 0, 0), V("v", 3, 0), W(3, -1), W(3, 3), W(7, 0), W(-1, 0)]);
    const goal = makeGoal(layout, { x: 0, y: 0 }, { effort: 10 })!;
    expect(goal.id).toBe("r");
    expect(goal.target).toEqual({ x: 5, y: 0 });
    expect(goal.solution).toEqual([
      { id: "v", from: { x: 3, y: 0 }, to: { x: 3, y: 1 } },
      { id: "r", from: { x: 0, y: 0 }, to: { x: 5, y: 0 } },
    ]);
  });

  test("effort caps the distance", () => {
    const layout = fixedLayout([H("r", 0, 0)]);
    expect(makeGoal(layout, { x: 0, y: 0 }, { effort: 3 })!.target).toEqual({ x: 3, y: 0 });
  });

  test("no goal when nothing nearby can move", () => {
    expect(makeGoal(fixedLayout([W(-1, 0), H("r", 0, 0), W(2, 0)]), { x: 0, y: 0 })).toBeNull();
  });

  test("on random boards the goal is the same every time, far away, and its solution replays legally", () => {
    const layout = randomLayout(5, { tries: 7 });
    const goal = makeGoal(layout, { x: 0, y: 2 }, { effort: 8 })!;
    expect(makeGoal(randomLayout(5, { tries: 7 }), { x: 0, y: 2 }, { effort: 8 })).toEqual(goal);
    const red = layout.byId(goal.id)!;
    expect(Math.abs(goal.target.x - red.x) + Math.abs(goal.target.y - red.y)).toBe(8);
    const after = replay(layout, goal.solution)!;
    expect(after.moved.get(goal.id)).toEqual(goal.target);
  });
});

describe("merge, simplify and solved", () => {
  test("simplify folds a block's early step into its later move when that still plays", () => {
    const layout = fixedLayout([H("r", 0, 0), V("v", 3, 0), W(3, -1), W(3, 3)]);
    expect(simplify(layout, [
      { id: "r", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { id: "v", from: { x: 3, y: 0 }, to: { x: 3, y: 1 } },
      { id: "r", from: { x: 1, y: 0 }, to: { x: 4, y: 0 } },
    ])).toEqual([
      { id: "v", from: { x: 3, y: 0 }, to: { x: 3, y: 1 } },
      { id: "r", from: { x: 0, y: 0 }, to: { x: 4, y: 0 } },
    ]);
  });

  test("simplify keeps an early step the rules need", () => {
    // r (row 0, walls at x -1 and 4) must step right first so v can drop into (0,0);
    // only then can r go on. Moving r 0 -> 2 after v is illegal: v cannot drop yet.
    const layout = fixedLayout([W(-1, 0), H("r", 0, 0), W(4, 0), V("v", 0, -2), W(0, -3)]);
    const moves = [
      { id: "r", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { id: "v", from: { x: 0, y: -2 }, to: { x: 0, y: -1 } },
      { id: "r", from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
    ];
    expect(replay(layout, moves)).not.toBeNull();
    expect(simplify(layout, moves)).toEqual(moves);
  });

  test("back-to-back moves of one block count as one drag", () => {
    expect(merge([
      { id: "a", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
      { id: "a", from: { x: 1, y: 0 }, to: { x: 2, y: 0 } },
      { id: "b", from: { x: 5, y: 0 }, to: { x: 5, y: 1 } },
      { id: "a", from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
    ])).toEqual([
      { id: "a", from: { x: 0, y: 0 }, to: { x: 2, y: 0 } },
      { id: "b", from: { x: 5, y: 0 }, to: { x: 5, y: 1 } },
      { id: "a", from: { x: 2, y: 0 }, to: { x: 3, y: 0 } },
    ]);
  });

  test("solved when the red block's top-left is on the target", () => {
    const goal = { id: "r", target: { x: 4, y: 0 }, solution: [] };
    const block = { id: "r", x: 4, y: 0, w: 2, h: 1, ui: null, wall: false, moved: true };
    expect(solved(goal, [block])).toBe(true);
    expect(solved(goal, [{ ...block, x: 3 }])).toBe(false);
  });
});

describe("the next goal", () => {
  test("excluded blocks are never picked as the red block", () => {
    const layout = fixedLayout([H("r", 0, 0), H("s", 0, 2)]);
    expect(makeGoal(layout, { x: 0, y: 0 }, { effort: 3 })!.id).toBe("r");
    expect(makeGoal(layout, { x: 0, y: 0 }, { effort: 3, exclude: new Set(["r"]) })!.id).toBe("s");
  });

  test("it starts from the board as it is, moved blocks included", () => {
    // r has been moved onto x 4; a goal made near there finds it at x 4.
    const layout = fixedLayout([H("r", 0, 0), W(-1, 0)]);
    const goal = makeGoal(layout, { x: 4, y: 0 }, { effort: 2, moved: new Map([["r", { x: 4, y: 0 }]]) })!;
    expect(goal.id).toBe("r");
    expect(goal.target).toEqual({ x: 6, y: 0 });
  });
});
