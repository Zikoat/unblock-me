// The island's squares: each level's solution is legal by the game's own rules and lands the
// red block on its target, in the fewest moves there are (a search of its own); nothing
// random is generated inside the island.
import { describe, expect, test } from "bun:test";
import { bayReached, GATE, GATE_GONE, ISLAND_AREA, ISLAND_RECTS, islandGoals, isLast, nextIslandGoal, opensGate, redId, sideOf, squareAt, worldNumbers } from "../../src/island";
import { ISLAND_LEVELS, type IslandLevel } from "../../src/island-levels";
import { intersects, randomLayout } from "../../src/layout";
import { slideRange } from "../../src/rules";
import { goalSolved, newScene, record, whereIs } from "../../src/scene";

/** The fewest moves for a square's goals in turn, each counting as its block lands on its
 * target (the next may then be met already): breadth first over (blocks, goal) states. In
 * the last square the exit is shut until its goals inside are done. */
function fewest(level: IslandLevel, last: boolean): number | null {
  const n = level.side ?? 6, row = level.blocks[0]![1];
  const horizontal = level.blocks.map(([, , h]) => h === 1);
  const inside = (level.goals ?? []).map((g) => ({ block: g.block, at: g.at[0] * 100 + g.at[1] }));
  const bay = { block: 0, at: n * 100 + row };
  const goals = last ? [...inside, bay] : [bay, ...inside];
  const shutUntil = last ? goals.length - 1 : 0;
  const cells = (i: number, p: number) => (horizontal[i] ? [p, p + 100] : [p, p + 1]);
  const free = (c: number, shut: boolean) => {
    const x = Math.floor(c / 100), y = c - 100 * x;
    return x >= 0 && y >= 0 && y < n && (x < n || (!shut && y === row && x <= n + 1));
  };
  const start = level.blocks.map(([x, y]) => x * 100 + y);
  const seen = new Set([`${start}|0`]);
  let frontier: [number[], number][] = [[start, 0]];
  for (let depth = 1; frontier.length; depth++) {
    const next: [number[], number][] = [];
    for (const [pos, g] of frontier) {
      const taken = new Map<number, number>();
      pos.forEach((p, i) => cells(i, p).forEach((c) => taken.set(c, i)));
      for (let i = 0; i < pos.length; i++)
        for (const d of horizontal[i] ? [-100, 100] : [-1, 1])
          for (let p = pos[i]! + d; cells(i, p).every((c) => free(c, g < shutUntil) && (taken.get(c) ?? i) === i); p += d) {
            const moved = pos.slice();
            moved[i] = p;
            let h = g;
            if (moved[goals[h]!.block] === goals[h]!.at) while (h < goals.length && moved[goals[h]!.block] === goals[h]!.at) h++;
            if (h === goals.length) return depth;
            const key = `${moved}|${h}`;
            if (!seen.has(key)) seen.add(key), next.push([moved, h]);
          }
    }
    frontier = next;
  }
  return null;
}

describe("island", () => {
  test("each square's fewest moves are the fewest there are (all its goals together)", () => {
    ISLAND_LEVELS.forEach((level, k) => expect([k, fewest(level, isLast(k))]).toEqual([k, level.fewest]));
  });

  test("each square's goals' solutions are legal, take their fewest moves, and solve them in turn", () => {
    const scene = newScene(800, 800, { layout: randomLayout(7, { island: true }) });
    ISLAND_LEVELS.forEach((level, k) => {
      const goals = islandGoals(k), goal = goals.at(-1)!;
      // The red block into the bay first (in the last square last, out to the world); the last
      // goal is scored for the whole square.
      expect((isLast(k) ? goal : goals[0]!).id).toBe(redId(k));
      expect(goals.slice(0, -1).every((g) => g.step && g.unrated) && !goal.step).toBe(true);
      // (The last square's: two more, the blocker and on past the bay to its target.)
      const total = goals.reduce((n, g) => n + g.solution.length, 0);
      expect(total).toBe(level.fewest + (k === ISLAND_LEVELS.length - 1 ? 2 : 0));
      expect(goal.difficulty?.moves).toBe(total);
      // (The last square's red block can't get out while its exit is shut.)
      if (GATE && isLast(k)) {
        const red = scene.layout.byId(redId(k))!;
        expect(slideRange(scene.layout, { ...red, ...whereIs(scene, red.id)! }, scene).hi).toBeLessThan(GATE.x - 1);
      }
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
        if (GATE && opensGate(g)) scene.moved.set(GATE.id, GATE_GONE);
      }
      expect(GATE !== null && isLast(k) ? scene.moved.get(GATE.id) : GATE_GONE).toEqual(GATE_GONE);
    });
  });

  test("the last square's bay is reached with one cell of the red block in it, and only the last's", () => {
    const last = ISLAND_LEVELS.length - 1, o = squareAt(last);
    const side = sideOf(last);
    const red = { id: redId(last) };
    expect(bayReached(last, red, { x: o.x + side - 2 })).toBe(false);
    expect(bayReached(last, red, { x: o.x + side - 1 })).toBe(true);
    expect(bayReached(last, red, { x: o.x + side })).toBe(true);
    expect(bayReached(last, { id: `isle ${last} 1` }, { x: o.x + side - 1 })).toBe(false); // another block in the last column
    expect(bayReached(0, { id: redId(0) }, { x: squareAt(0).x + sideOf(0) })).toBe(false);
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

describe("world goals' numbers", () => {
  test("count reached goals off the island, travel goals left out, in the order reached", () => {
    const done = [
      { id: "isle 0 0" }, { id: "isle 9 2" }, // the island's
      { id: "a" }, { id: "b", travel: { k: 1, room: "spike", left: 3 } }, { id: "c" }, { id: "d" },
    ];
    expect([...worldNumbers(done)]).toEqual([["a", 11], ["c", 12], ["d", 13]]); // on from the 10 island levels
    expect(worldNumbers([]).size).toBe(0);
  });
});
