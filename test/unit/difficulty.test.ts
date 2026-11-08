import { describe, expect, test } from "bun:test";
import { difficulty } from "../../src/difficulty";
import { LEVELS_OF_EFFORT } from "../../src/goal-search";
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

  test("a shorter solution through blocks 3 to 4 cells past the old window is found", () => {
    // r has to get past v. Up, v needs t, u and s out of its way (5 moves, the proof). Down,
    // v needs a moved down, and a needs b moved down into row 6: 4 moves, but rows 3 to 6 lie
    // past the 2 cells round red's run that the game searched (and even past a box of 5).
    // b is in the way of a, which is in the way of v, which is in red's way: blocks that
    // matter, found wherever they are.
    const layout = fixedLayout([W(-1, 0), H("r", 0, 0), W(6, 0), V("v", 3, 0), H("t", 1, -1), H("u", 3, -1), W(5, -1), H("s", 3, -2), W(5, -2), V("a", 3, 2), V("b", 3, 4), W(3, 7)]);
    const mv = (id: string, [fx, fy]: number[], [tx, ty]: number[]) => ({ id, from: { x: fx!, y: fy! }, to: { x: tx!, y: ty! } });
    const up = [mv("t", [1, -1], [-1, -1]), mv("u", [3, -1], [1, -1]), mv("s", [3, -2], [1, -2]), mv("v", [3, 0], [3, -2]), mv("r", [0, 0], [4, 0])];
    const goal = { id: "r", target: { x: 4, y: 0 }, solution: up };
    for (const margin of [2, 5]) expect(difficulty(layout, new Map(), goal, { margin, reach: null }).moves).toBe(5);
    const d = difficulty(layout, new Map(), goal);
    expect(d.moves).toBe(4);
    expect(d.solution!.map((m) => m.id)).toEqual(["b", "a", "v", "r"]);
    // The goals made ahead (effort 2) are measured so.
    expect(difficulty(layout, new Map(), goal, { reach: LEVELS_OF_EFFORT[2]!.reach }).moves).toBe(4);
  });
});
