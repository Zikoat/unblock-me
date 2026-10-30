// Goals: simplifying a proof, solved, and medals.
import { describe, expect, test } from "bun:test";
import { Board } from "../../src/board";
import { replay, type Move } from "../../src/frozen";
import { medal, merge, solved } from "../../src/goal";
import { simplifyFast } from "../../src/goal-fast";
import { fixedLayout, type Layout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
const simplify = (layout: Layout, moves: Move[]) => simplifyFast(new Board(layout, new Map()), moves);

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

describe("medal", () => {
  const d = (moves: number | null, atLeast: number) => ({ moves, atLeast, searched: 0, branching: 0, score: 0 });
  const move = { id: "r", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } };
  test("fewer moves than the game knew: beating its solution when the search stopped early", () => {
    const goal = { id: "r", target: { x: 1, y: 0 }, solution: [move, move, move, move], difficulty: d(null, 2) };
    expect(medal({ ...goal, used: 3 })).toBe(true);
    expect(medal({ ...goal, used: 4 })).toBe(false);
    expect(medal({ ...goal, difficulty: d(3, 3), used: 3 })).toBe(false); // the exact fewest, matched
    expect(medal({ ...goal })).toBe(false); // not reached yet
  });
});
