// open-core.ts's two bounds against a plain exact search: on small walled boards with every block
// movable, R the blocks of the inner square and the rest the world, the lower bound never exceeds
// the true fewest, the upper never falls below it, and where they agree (fewest, least and most
// extra moves) they equal the truth.
import { expect, test } from "bun:test";
import { cellsAt, randomRoom, rng, solve } from "../../src/extra-gen-core";
import { checkOpen } from "../../src/open-core";

test("the open bounds hold the true fewest and extra moves between them", () => {
  const next = rng(11);
  let agreed = 0, checked = 0;
  for (let t = 0; t < 120; t++) {
    const g = randomRoom(6, 6, 9 + Math.floor(next() * 5), Math.floor(next() * 2), next);
    const inner = (c: number) => { const x = c % 6, y = Math.floor(c / 6); return x >= 1 && y >= 1 && x <= 4 && y <= 4; };
    const R = [...g.pieces.keys()].filter((i) => cellsAt(g, g.pieces[i]!, g.pos[i]!).every(inner));
    if (!R.length) continue;
    for (const target of [0, 3]) {
      if (target === g.pos[R[0]!]) continue;
      const truth = solve(g, R[0]!, target, { cap: 300_000 });
      const c = checkOpen(g, R, target, 300_000);
      if (truth.status !== "ok" || c.up.status !== "ok" || !c.low) continue;
      checked++;
      expect(truth.fewest).toBeLessThanOrEqual(c.up.fewest);
      if (c.low.status === "ok") expect(c.low.fewest).toBeLessThanOrEqual(truth.fewest);
      if (c.exact) {
        agreed++;
        expect([truth.fewest, truth.extraMin, truth.extraMax]).toEqual([c.up.fewest, c.up.extraMin, c.up.extraMax]);
      }
    }
  }
  expect(checked).toBeGreaterThan(50);
  expect(agreed).toBeGreaterThan(10);
});
