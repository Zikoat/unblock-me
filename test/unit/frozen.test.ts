// Jams and frozen structures: exact boards for the rules, random boards for the claims.
import { describe, expect, test } from "bun:test";
import { frozen, lockDepths, smallestFrozen } from "../../src/frozen";
import { fixedLayout, randomLayout, type Placed } from "../../src/layout";

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
    expect(Object.fromEntries(lockDepths(layout, AREA).depth)).toEqual({ a: 2, b: 1, c: 0 });
  });

  test("lock depth counts the layers to move first, along the shallower stopper", () => {
    const layout = fixedLayout([W(-1, 0), H("a", 0, 0), H("b", 2, 0), H("c", 4, 0), V("d", 6, 0)]);
    const { depth, next } = lockDepths(layout, AREA);
    expect(Object.fromEntries(depth)).toEqual({ a: 3, b: 2, c: 1, d: 0 });
    expect([next.get("a")?.id, next.get("b")?.id, next.get("c")?.id]).toEqual(["b", "c", "d"]);
  });
});

describe("random boards never freeze", () => {
  test("no block is frozen at any density, though many are stuck several layers deep", () => {
    let deepest = 0;
    for (const tries of [7, 15, 30]) {
      for (const seed of [1, 2]) {
        const layout = randomLayout(seed, { tries });
        const area = { x: 60, y: 60, width: 40, height: 40 };
        expect(frozen(layout, area).size).toBe(0);
        for (const d of lockDepths(layout, area).depth.values()) {
          expect(d).toBeLessThan(Infinity);
          deepest = Math.max(deepest, d);
        }
      }
    }
    expect(deepest).toBeGreaterThanOrEqual(3);
  });
});

describe("smallestFrozen", () => {
  test("with room for one block it is a block between two walls", () => {
    expect(smallestFrozen(4, 1)).toEqual([
      { x: 0, y: 0, w: 1, h: 1, wall: true }, { x: 1, y: 0, w: 2, h: 1 }, { x: 3, y: 0, w: 1, h: 1, wall: true },
    ]);
  });

  test("asked for a chain of two, it puts both in a line between two walls", () => {
    expect(smallestFrozen(6, 1, { minSliders: 2, chained: true })).toEqual([
      { x: 0, y: 0, w: 1, h: 1, wall: true }, { x: 1, y: 0, w: 2, h: 1 }, { x: 3, y: 0, w: 2, h: 1 }, { x: 5, y: 0, w: 1, h: 1, wall: true },
    ]);
    expect(smallestFrozen(5, 1, { minSliders: 2, chained: true })).toBeNull();
  });

  test("every structure it finds is frozen by the game's own rules", () => {
    const found = smallestFrozen(4, 4, { minSliders: 2 })!;
    const placed = found.map((b, i) => ({ ...b, id: String(i) }));
    const sliders = placed.filter((b) => !b.wall).map((b) => b.id).sort();
    expect([...frozen(fixedLayout(placed), AREA)].sort()).toEqual(sliders);
  });
});
