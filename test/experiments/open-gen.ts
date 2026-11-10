// Rooms with real extra moves and an open edge (reports/open-gen.html): library rooms
// (extra-moves.ts's walled squares, no walls inside) put in the world with a ring of walls, then
// opened up by open-gen-make.ts's makeOpenUp, every step verified exactly in any surroundings by
// open-core.ts's two bounds; a line per room as JSONL (data/ is not kept in git).
//   bun test/experiments/open-gen.ts --side high|low --rooms 12 --budget 240000 --seed 1 [--part 0/2] --out data/open-gen/high.jsonl
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { library, makeOpenUp, WANT } from "./open-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const side = arg("side", "high") as "high" | "low", rooms = Number(arg("rooms", "6")), budget = Number(arg("budget", "240000"));
const seed0 = Number(arg("seed", "1")), [part, parts] = arg("part", "0/1").split("/").map(Number) as [number, number];
const out = arg("out", `data/open-gen/${side}.jsonl`);
mkdirSync(dirname(out), { recursive: true });
// One goal per room (the library lists every goal of a room; the first that fits).
const seen = new Set<string>();
const lib = library().filter((l) => {
  if (l.walls.length || l.fewest < WANT.lo || l.fewest > WANT.hi) return false;
  if (side === "high" ? l.extra.least < WANT.extra : l.extra.most !== 0) return false;
  const k = JSON.stringify([l.size, l.pieces, l.pos]);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
console.log(`${side}: ${lib.length} library rooms`);
for (let b = 0; b < rooms; b++) {
  if (b % parts !== part) continue;
  const seed = seed0 * 1000 + b;
  const l = lib[(seed * 2654435761) % lib.length]!;
  const m = makeOpenUp(l, seed, budget, WANT, { side });
  const { g, ...rest } = m;
  appendFileSync(out, JSON.stringify({ side, budget, seed, lib: { size: l.size, fewest: l.fewest, extra: l.extra }, ...rest, board: { W: g.W, H: g.H, walls: [...g.wall.keys()].filter((c) => g.wall[c]), pieces: g.pieces, pos: g.pos } }) + "\n");
  const o = m.open;
  console.log(`${side} ${b}: ${m.fewest} moves, ${m.extra}-${m.extraMax} extra, ${Math.round(m.ms / 1000)} s, ${m.evals} checks; edge ${o.boundary.movable}/${o.boundary.blocks} movable, ${o.boundary.walls} walls; ring ${o.ring.movable}/${o.ring.blocks}, ${o.ring.walls} walls`);
}
