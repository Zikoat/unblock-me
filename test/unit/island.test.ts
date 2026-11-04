// The island's squares: each level's solution is legal by the game's own rules and lands the
// red block on its target; nothing random is generated inside the island.
import { describe, expect, test } from "bun:test";
import { ISLAND_AREA, islandGoal, nextIslandGoal, redId } from "../../src/island";
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
      expect(goal.solution.length).toBe(level.fewest);
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

  test("the random blocks keep out of the island, and its goals come in turn", () => {
    for (const seed of [1, 2, 3]) {
      const blocks = randomLayout(seed, { island: true }).blocksIn(ISLAND_AREA);
      expect(blocks.every((b) => b.wall || b.id.startsWith("isle "))).toBe(true);
    }
    const done = [islandGoal(0), islandGoal(1)];
    expect(nextIslandGoal(done)?.id).toBe(redId(2));
    expect(nextIslandGoal(ISLAND_LEVELS.map((_, k) => islandGoal(k)))).toBeNull();
    expect(intersects({ x: -1, y: 0, w: 3, h: 5 }, ISLAND_AREA)).toBe(false); // clear of the debug UI
  });
});
