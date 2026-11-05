// The island's squares: each level's solution is legal by the game's own rules and lands the
// red block on its target; nothing random is generated inside the island.
import { describe, expect, test } from "bun:test";
import { bayReached, ISLAND_AREA, ISLAND_RECTS, islandGoal, nextIslandGoal, redId, SIDE, squareAt } from "../../src/island";
import { ISLAND_LEVELS } from "../../src/island-levels";
import { intersects, randomLayout } from "../../src/layout";
import { slideRange } from "../../src/rules";
import { goalSolved, newScene, record, whereIs } from "../../src/scene";

describe("island", () => {
  test("each square's solution is legal, takes its fewest moves, and solves it", () => {
    const scene = newScene(800, 800, { layout: randomLayout(7, { island: true }) });
    ISLAND_LEVELS.forEach((level, k) => {
      const goal = islandGoal(k);
      scene.goal = goal;
      // (The last square's: two more, the blocker and on past the bay to its target.)
      expect(goal.solution.length).toBe(level.fewest + (k === ISLAND_LEVELS.length - 1 ? 2 : 0));
      for (const move of goal.solution) {
        const home = scene.layout.byId(move.id)!, at = whereIs(scene, move.id)!;
        expect(at).toEqual(move.from);
        const { lo, hi } = slideRange(scene.layout, { ...home, ...at }, scene);
        const along = home.w > home.h ? move.to.x : move.to.y;
        expect(along >= lo && along <= hi).toBe(true);
        record(scene, move);
      }
      expect(goalSolved(scene)).toBe(true);
    });
  });

  test("the last square's bay is reached with one cell of the red block in it, and only the last's", () => {
    const last = ISLAND_LEVELS.length - 1, o = squareAt(last);
    expect(bayReached(last, { x: o.x + SIDE - 2 })).toBe(false);
    expect(bayReached(last, { x: o.x + SIDE - 1 })).toBe(true);
    expect(bayReached(last, { x: o.x + SIDE })).toBe(true);
    expect(bayReached(0, { x: squareAt(0).x + SIDE })).toBe(false);
    expect(ISLAND_LEVELS[last]!.blocks[0]![0]).toBeLessThan(SIDE - 1); // it doesn't start there
  });

  test("the random blocks keep out of the island, and its goals come in turn", () => {
    for (const seed of [1, 2, 3]) {
      const blocks = randomLayout(seed, { island: true }).blocksIn(ISLAND_AREA);
      // Random blocks fill up to the island's footprints, never into them.
      expect(blocks.every((b) => b.wall || b.id.startsWith("isle ") || !ISLAND_RECTS.some((r) => intersects(b, r)))).toBe(true);
    }
    const done = [islandGoal(0), islandGoal(1)];
    expect(nextIslandGoal(done)?.id).toBe(redId(2));
    expect(nextIslandGoal(ISLAND_LEVELS.map((_, k) => islandGoal(k)))).toBeNull();
    expect(ISLAND_RECTS.some((r) => intersects({ x: -1, y: 0, w: 3, h: 5 }, r))).toBe(false); // clear of the debug UI
  });
});
