import { describe, expect, test } from "bun:test";
import { choices } from "../../src/choices";
import { fixedLayout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });


describe("choices a move", () => {
  test("the movable blocks in the red block's chain, averaged along the solution", () => {
    // v stands in r's way and can go down; a block far off does not count.
    const layout = fixedLayout([H("r", 0, 0), V("v", 2, 0), H("far", 20, 5)]);
    const goal = {
      id: "r", target: { x: 4, y: 0 },
      solution: [{ id: "v", from: { x: 2, y: 0 }, to: { x: 2, y: 1 } }, { id: "r", from: { x: 0, y: 0 }, to: { x: 4, y: 0 } }],
    };
    // First board: r and v; then the way is clear, only r.
    expect(choices(layout, new Map(), goal)).toBe(1.5);
  });
});
