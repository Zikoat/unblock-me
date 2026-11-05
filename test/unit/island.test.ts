// The island's squares: each level's solution is legal by the game's own rules and lands the
// red block on its target; nothing random is generated inside the island.
import { describe, expect, test } from "bun:test";
import { bayReached, ISLAND_AREA, ISLAND_RECTS, islandGoals, nextIslandGoal, redId, sideOf, squareAt } from "../../src/island";
import { ISLAND_LEVELS } from "../../src/island-levels";
import { intersects, randomLayout } from "../../src/layout";
import { slideRange } from "../../src/rules";
import { goalSolved, newScene, record, whereIs } from "../../src/scene";

describe("island", () => {
  test("each square's goals' solutions are legal, take their fewest moves, and solve them in turn", () => {
    const scene = newScene(800, 800, { layout: randomLayout(7, { island: true }) });
    ISLAND_LEVELS.forEach((level, k) => {
      const goals = islandGoals(k), goal = goals.at(-1)!;
      // The red block into the bay first; the last goal is scored for the whole square.
      expect(goals[0]!.id).toBe(redId(k));
      expect(goals.slice(0, -1).every((g) => g.step && g.unrated) && !goal.step).toBe(true);
      // (The last square's: two more, the blocker and on past the bay to its target.)
      const total = goals.reduce((n, g) => n + g.solution.length, 0);
      expect(total).toBe(level.fewest + (k === ISLAND_LEVELS.length - 1 ? 2 : 0));
      expect(goal.difficulty?.moves).toBe(total);
      for (const g of goals) {
        scene.goal = g;
        for (const move of g.solution) {
          const home = scene.layout.byId(move.id)!, at = whereIs(scene, move.id)!;
          expect(at).toEqual(move.from);
          const { lo, hi } = slideRange(scene.layout, { ...home, ...at }, scene);
          const along = home.w > home.h ? move.to.x : move.to.y;
          expect(along >= lo && along <= hi).toBe(true);
          record(scene, move);
        }
        expect(goalSolved(scene)).toBe(true);
      }
    });
  });

  test("the last square's bay is reached with one cell of the red block in it, and only the last's", () => {
    const last = ISLAND_LEVELS.length - 1, o = squareAt(last);
    const side = sideOf(last);
    expect(bayReached(last, { x: o.x + side - 2 })).toBe(false);
    expect(bayReached(last, { x: o.x + side - 1 })).toBe(true);
    expect(bayReached(last, { x: o.x + side })).toBe(true);
    expect(bayReached(0, { x: squareAt(0).x + sideOf(0) })).toBe(false);
    expect(ISLAND_LEVELS[last]!.blocks[0]![0]).toBeLessThan(side - 1); // it doesn't start there
  });

  test("the random blocks keep out of the island, and its goals come in turn", () => {
    for (const seed of [1, 2, 3]) {
      const blocks = randomLayout(seed, { island: true }).blocksIn(ISLAND_AREA);
      // Random blocks fill up to the island's footprints, never into them.
      expect(blocks.every((b) => b.wall || b.id.startsWith("isle ") || !ISLAND_RECTS.some((r) => intersects(b, r)))).toBe(true);
    }
    const several = ISLAND_LEVELS.findIndex((l) => l.goals);
    const before = ISLAND_LEVELS.slice(0, several).flatMap((_, k) => islandGoals(k));
    expect(nextIslandGoal(before)?.id).toBe(redId(several)); // its bay first,
    expect(nextIslandGoal([...before, islandGoals(several)[0]!])?.id).toBe(`isle ${several} ${ISLAND_LEVELS[several]!.goals![0]!.block}`); // then inside
    expect(nextIslandGoal(ISLAND_LEVELS.flatMap((_, k) => islandGoals(k)))).toBeNull();
    expect(ISLAND_RECTS.some((r) => intersects({ x: -1, y: 0, w: 3, h: 5 }, r))).toBe(false); // clear of the debug UI
  });
});
