// How often the goal's red block has other blocks on its own track between it and the
// target, with the old ranking (no penalty) and the new one, on the same boards; with an
// example board of each kind. Writes JSON for reports/blocks-on-track.html.
//   scripts/capped.sh 2000 900 bun test/experiments/blocks-on-track.ts > out.json
import { Board } from "../../src/board";
import { makeGoalHard, onTrack, tradeoff } from "../../src/goal-search";
import { randomLayout, type Layout } from "../../src/layout";

const DENSITIES = [4, 7, 12, 20, 28], SEEDS = 8;

/** The cells round a goal (its red block's lane, from start to target, with a margin): every
 * block there, marked red, on the track, or other. */
function snapshot(layout: Layout, id: string, target: { x: number; y: number }) {
  const board = new Board(layout);
  const red = board.block(id), horizontal = red.w > red.h;
  const x0 = Math.min(red.x, target.x) - 2, x1 = Math.max(red.x, target.x) + red.w + 2;
  const y0 = Math.min(red.y, target.y) - 2, y1 = Math.max(red.y, target.y) + red.h + 2;
  const blocks = layout.blocksIn({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).map((b) => {
    const track = b.id !== id && (horizontal ? b.w > b.h && b.y === red.y && b.x + b.w > Math.min(red.x, target.x) && b.x < Math.max(red.x, target.x) + red.w : b.h > b.w && b.x === red.x && b.y + b.h > Math.min(red.y, target.y) && b.y < Math.max(red.y, target.y) + red.h);
    return { x: b.x, y: b.y, w: b.w, h: b.h, kind: b.id === id ? "red" : b.wall || b.ui ? "wall" : track ? "track" : "block" };
  });
  return { area: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, target: { ...target, w: red.w, h: red.h }, blocks };
}

const rows: unknown[] = [];
const examples: Record<string, unknown> = {};
for (const level of [0, 2]) for (const tries of DENSITIES) for (let seed = 1; seed <= SEEDS; seed++) {
  const layout = randomLayout(seed * 101 + tries, { tries });
  const near = { x: seed * 9, y: -seed * 5 };
  const run = (train: number) => {
    tradeoff.train = train;
    const t = performance.now();
    const g = makeGoalHard(layout, near, {}, level);
    const ms = performance.now() - t;
    if (!g) return null;
    return { g, ms, train: onTrack(new Board(layout), g.id, g.target), fewest: g.difficulty.moves ?? g.difficulty.atLeast, distance: g.distance };
  };
  const old = run(1), now = run(0.5);
  if (!old || !now) continue;
  rows.push({ level, tries, seed, old: { train: old.train, fewest: old.fewest, distance: old.distance, ms: Math.round(old.ms) }, now: { train: now.train, fewest: now.fewest, distance: now.distance, ms: Math.round(now.ms) } });
  // Examples: a board where the old goal had the most blocks on its track and the new one none.
  if (level === 2 && now.train === 0 && old.train >= ((examples.score as number) ?? 1)) {
    examples.score = old.train;
    examples.bad = { tries, ...snapshot(layout, old.g.id, old.g.target), train: old.train, fewest: old.fewest, distance: old.distance };
    examples.good = { tries, ...snapshot(layout, now.g.id, now.g.target), train: now.train, fewest: now.fewest, distance: now.distance };
  }
  console.error(level, tries, seed, old.train, now.train);
}
console.log(JSON.stringify({ rows, examples }));
