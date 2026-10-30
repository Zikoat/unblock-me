// The density report's numbers, on an exact board and on random ones.
import { describe, expect, test } from "bun:test";
import { fixedLayout, randomLayout } from "../../src/layout";
import { NO_CHANGES, slide } from "../../src/rules";
import { summarize } from "../../src/stats";

describe("summarize", () => {
  // Row 0, cells 0..5: wall | a a | b b | . | wall. The walls are vertical blocks sticking
  // out of the row, so only a and b are measured.
  const layout = fixedLayout([
    { id: "wallL", x: -1, y: -1, w: 1, h: 2 },
    { id: "a", x: 0, y: 0, w: 2, h: 1 },
    { id: "b", x: 2, y: 0, w: 2, h: 1 },
    { id: "wallR", x: 5, y: 0, w: 1, h: 2 },
  ]);
  const area = { x: 0, y: 0, width: 6, height: 1 };

  test("slide reports what stops a block on each side", () => {
    const a = layout.byId("a")!;
    const s = slide(layout, a, NO_CHANGES);
    expect([s.lo, s.hi, s.before?.id, s.after?.id]).toEqual([0, 0, "wallL", "b"]);
    const t = slide(layout, layout.byId("b")!, NO_CHANGES);
    expect([t.lo, t.hi, t.before?.id, t.after?.id]).toEqual([2, 3, "a", "wallR"]);
  });

  test("counts, shares of stuck and one-step blocks, median steps and blocking", () => {
    expect(summarize(layout, area)).toEqual({
      blocks: 2,
      coverage: 4 / 6,
      blocksPer100Cells: 200 / 6,
      stuck: 0.5, // a
      oneStep: 0.5, // b can move one cell right
      twoSteps: 0,
      threePlus: 0,
      medianSteps: 1,
      // a is blocked by wallL and b (2), b by a (1): 3 blocking pairs over 2 blocks.
      meanBlocking: 1.5,
    });
  });
});

describe("density", () => {
  const area = { x: 20, y: 20, width: 80, height: 80 };

  test("more tries per chunk give a denser, more stuck board", () => {
    const at = [1, 3, 7, 14].map((tries) => summarize(randomLayout(5, { tries }), area));
    for (let i = 1; i < at.length; i++) {
      expect(at[i]!.coverage).toBeGreaterThan(at[i - 1]!.coverage);
      expect(at[i]!.stuck).toBeGreaterThanOrEqual(at[i - 1]!.stuck);
      expect(at[i]!.meanBlocking).toBeGreaterThan(at[i - 1]!.meanBlocking);
    }
  });

  test("the shares of how far blocks can move add up to all blocks", () => {
    const s = summarize(randomLayout(8), area);
    expect(s.stuck + s.oneStep + s.twoSteps + s.threePlus).toBeCloseTo(1);
    expect(s.blocks).toBeGreaterThan(500);
  });
});
