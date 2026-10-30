// Jams and frozen structures: exact boards for the rules, random boards for the claims.
import { describe, expect, test } from "bun:test";
import { frozen, replay, type Move } from "../../src/frozen";
import { fixedLayout, randomLayout, type Layout, type Placed } from "../../src/layout";
import { blocksIn, slide } from "../../src/rules";

const H = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 2, h: 1 });
const V = (id: string, x: number, y: number): Placed => ({ id, x, y, w: 1, h: 2 });
const W = (x: number, y: number): Placed => ({ id: `wall ${x},${y}`, x, y, w: 1, h: 1, wall: true });
const AREA = { x: -20, y: -20, width: 40, height: 40 };

// Four sliding blocks around an empty middle cell, each touching the next end-on, with a
// wall at each outer end: a cycle of blocking.
//   # A A .
//   . . . B        (rows -1..3, the wall above B, beside C and below D)
const PINWHEEL = [
  H("a", 0, 0), V("b", 2, 0), H("c", 1, 2), V("d", 0, 1),
  W(-1, 0), W(2, -1), W(3, 2), W(0, 3),
];

describe("frozen", () => {
  test("a block between two walls is frozen; with one wall gone it is not", () => {
    expect([...frozen(fixedLayout([W(-1, 0), H("a", 0, 0), W(2, 0)]), AREA)]).toEqual(["a"]);
    expect(frozen(fixedLayout([W(-1, 0), H("a", 0, 0)]), AREA).size).toBe(0);
  });

  test("a line of blocks between two walls is frozen as a whole", () => {
    expect([...frozen(fixedLayout([W(-1, 0), H("a", 0, 0), H("b", 2, 0), H("c", 4, 0), W(6, 0)]), AREA)].sort()).toEqual(["a", "b", "c"]);
  });

  test("the pinwheel is frozen, and taking away any one of its walls frees all of it", () => {
    expect([...frozen(fixedLayout(PINWHEEL), AREA)].sort()).toEqual(["a", "b", "c", "d"]);
    for (const wall of PINWHEEL.filter((p) => p.wall)) {
      expect(frozen(fixedLayout(PINWHEEL.filter((p) => p !== wall)), AREA).size).toBe(0);
    }
  });

  test("stuck is not frozen: blocks that are all stuck but held by a movable block", () => {
    // a and b are stuck against each other, between a wall and c; c can move up and down.
    const layout = fixedLayout([W(-1, 0), H("a", 0, 0), H("b", 2, 0), V("c", 4, 0)]);
    expect(frozen(layout, AREA).size).toBe(0);
  });
});

describe("random boards never freeze", () => {
  test("no block is frozen at any density", () => {
    for (const tries of [7, 15, 30]) {
      for (const seed of [1, 2]) {
        expect(frozen(randomLayout(seed, { tries }), { x: 60, y: 60, width: 40, height: 40 }).size).toBe(0);
      }
    }
  });
});
