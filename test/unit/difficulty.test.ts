import { describe, expect, test } from "bun:test";
import { difficulty, starsEarned, starsFor } from "../../src/difficulty";
import { fixedLayout, type Placed } from "../../src/layout";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });

describe("difficulty", () => {
  test("a free run is one move", () => {
    const layout = fixedLayout([W(-1, 0), H("r", 0, 0), W(6, 0)]);
    const d = difficulty(layout, new Map(), { id: "r", target: { x: 4, y: 0 }, solution: [{ id: "r", from: { x: 0, y: 0 }, to: { x: 4, y: 0 } }] });
    expect(d.moves).toBe(1);
  });

  test("finds fewer moves than a roundabout solution", () => {
    // v blocks r's row; it can only go up. The given solution wastes a move on v.
    const layout = fixedLayout([W(-1, 0), H("r", 0, 0), V("v", 3, 0), W(3, 2), W(6, 0)]);
    const solution = [
      { id: "v", from: { x: 3, y: 0 }, to: { x: 3, y: -1 } },
      { id: "v", from: { x: 3, y: -1 }, to: { x: 3, y: -2 } },
      { id: "r", from: { x: 0, y: 0 }, to: { x: 4, y: 0 } },
    ];
    const d = difficulty(layout, new Map(), { id: "r", target: { x: 4, y: 0 }, solution });
    expect(d.moves).toBe(2);
    expect(d.score).toBeGreaterThan(0);
  });
});

describe("stars", () => {
  test("a goal's worth follows the usual range at its density", () => {
    expect(starsFor(12.8, 7)).toBe(0);
    expect(starsFor(31.4, 7)).toBe(10);
    expect(starsFor(22, 7)).toBe(5);
    expect(starsFor(100, 30)).toBe(10);
    expect(starsFor(0, 1)).toBe(0);
    // Between measured densities it blends the two.
    expect(starsFor(30, 12)).toBeGreaterThan(starsFor(30, 15));
  });

  test("all stars in the fewest moves, fewer with more moves", () => {
    expect(starsEarned(8, 4, 4)).toBe(8);
    expect(starsEarned(8, 4, 8)).toBe(4);
    expect(starsEarned(8, 4, 2)).toBe(8);
  });
});
