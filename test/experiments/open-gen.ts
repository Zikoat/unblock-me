// Rooms with real extra moves and an open edge (reports/open-gen.html): library rooms
// (extra-moves.ts's walled squares, no walls inside) put in the world with a ring of walls, then
// opened up by open-gen-make.ts's makeOpenUp, every step verified exactly in any surroundings by
// open-core.ts's two bounds; a line per room as JSONL (data/ is not kept in git).
//   bun test/experiments/open-gen.ts --side high|low --rooms 12 --budget 240000 --seed 1 [--part 0/2] --out data/open-gen/high.jsonl
// --lib: rooms from open-high.ts's climbs instead (JSONL, two per climb),
// with --lo, --hi and --extra for the goals wanted (the J trials: 12, 16 and 6).
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { type Lib, library, makeOpenUp, WANT } from "./open-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const side = arg("side", "high") as "high" | "low", rooms = Number(arg("rooms", "6")), budget = Number(arg("budget", "240000"));
const seed0 = Number(arg("seed", "1")), [part, parts] = arg("part", "0/1").split("/").map(Number) as [number, number];
const out = arg("out", `data/open-gen/${side}.jsonl`), libFiles = arg("lib", "");
const want = { lo: Number(arg("lo", String(WANT.lo))), hi: Number(arg("hi", String(WANT.hi))), extra: Number(arg("extra", String(WANT.extra))) };
mkdirSync(dirname(out), { recursive: true });
// One goal per room (the library lists every goal of a room; the first that fits).
const seen = new Set<string>();
const climbed = (): Lib[] => {
  const all = libFiles.split(",").flatMap((f) => readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Lib & { run: number }));
  // Per climb two rooms, the one with the most extra moves and the one with the fewest (still
  // enough; fewer to protect, so likelier to open), one climb's pair after another.
  const most = new Map<number, Lib & { run: number }>(), least = new Map<number, Lib & { run: number }>();
  for (const l of all) {
    const a = most.get(l.run), b = least.get(l.run);
    if (!a || l.extra.least > a.extra.least) most.set(l.run, l);
    if (!b || l.extra.least < b.extra.least || (l.extra.least === b.extra.least && Math.abs(l.fewest - 14) < Math.abs(b.fewest - 14))) least.set(l.run, l);
  }
  return [...most.keys()].sort((a, b) => a - b).flatMap((r) => [least.get(r)!, most.get(r)!]);
};
const lib = (libFiles ? climbed() : library()).filter((l) => {
  if (l.walls.length || l.fewest < want.lo || l.fewest > want.hi) return false;
  if (side === "high" ? l.extra.least < want.extra : l.extra.most !== 0) return false;
  const k = JSON.stringify([l.size, l.pieces, l.pos]);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
console.log(`${side}: ${lib.length} library rooms`);
for (let b = 0; b < rooms; b++) {
  if (b % parts !== part) continue;
  const seed = seed0 * 1000 + b;
  const l = libFiles ? lib[b % lib.length]! : lib[(seed * 2654435761) % lib.length]!;
  const m = makeOpenUp(l, seed, budget, want, { side });
  const { g, ...rest } = m;
  appendFileSync(out, JSON.stringify({ side, budget, seed, lib: { size: l.size, fewest: l.fewest, extra: l.extra }, ...rest, board: { W: g.W, H: g.H, walls: [...g.wall.keys()].filter((c) => g.wall[c]), pieces: g.pieces, pos: g.pos } }) + "\n");
  const o = m.open;
  console.log(`${side} ${b}: ${m.fewest} moves, ${m.extra}-${m.extraMax} extra, ${Math.round(m.ms / 1000)} s, ${m.evals} checks; edge ${o.boundary.movable}/${o.boundary.blocks} movable, ${o.boundary.walls} walls; ring ${o.ring.movable}/${o.ring.blocks}, ${o.ring.walls} walls`);
}
