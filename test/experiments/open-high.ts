// Library rooms with many real extra moves (6+ at 12 to 16 fewest) for open-gen.ts to open up
// (reports/open-gen.html, the J trials): the few such rooms in extra-moves.ts's library are too
// few, so this climbs for more. Each run starts from a high-extra goal (extra-moves.ts's library,
// walled or not, its walls taken out; extra-gen.ts's rooms; or a random room) and anneals the
// room on the exact solver (extra-gen-core.ts's solve, the room's edge a wall): blocks added,
// removed, moved and slid, the goal's target nudged along red's lane, scored by the least extra
// moves over every shortest solution and the fewest kept in range. No walls inside, as in the H
// rooms. Every room met that fits is written as a library entry (open-gen-make.ts's Lib), one
// line each, JSONL:
//   bun test/experiments/open-high.ts --minutes 15 --seed 1 [--part 0/2] --out data/open-gen/rooms6.jsonl
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { addRandom, cellsAt, clone, free, type Grid, occupancy, randomRoom, removePiece, rng, solve, span } from "./extra-gen-core";
import { type Lib, library } from "./open-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const minutes = Number(arg("minutes", "15")), seed0 = Number(arg("seed", "1")), perRun = Number(arg("run", "90")) * 1000;
const [part, parts] = arg("part", "0/1").split("/").map(Number) as [number, number];
const out = arg("out", "data/open-gen/rooms6.jsonl");
export const AIM = { lo: 12, hi: 16, extra: 6 };
mkdirSync(dirname(out), { recursive: true });

type Seed = { g: Grid; red: number; target: number; from: string };
// Seeds: the library's goals with 4 or more extra at 11 to 18 (walls taken out), most extra first.
const seeds: Seed[] = library()
  .filter((l) => l.fewest >= 11 && l.fewest <= 18 && l.extra.least >= 4)
  .sort((a, b) => b.extra.least - a.extra.least)
  .map((l) => {
    const C = Number(l.size.split("x")[0]);
    return { g: { W: C, H: C, wall: new Uint8Array(C * C), pieces: l.pieces, pos: l.pos }, red: l.red, target: l.target, from: `lib ${l.size} ${l.fewest}/${l.extra.least}${l.walls.length ? ` ${l.walls.length}w` : ""}` };
  });
// extra-gen.ts's B rooms (annealed, red block 0), where the board is still the bare room.
for (const f of ["B-200", "B-1000", "B-5000"]) {
  const p = `data/extra-gen/${f}.jsonl`;
  if (!existsSync(p)) continue;
  for (const l of readFileSync(p, "utf8").trim().split("\n").map((x) => JSON.parse(x))) {
    if (!l.ok || l.extra < 4 || !l.board || l.board.W > 7) continue;
    const g: Grid = { W: l.board.W, H: l.board.H, wall: new Uint8Array(l.board.W * l.board.H), pieces: l.board.pieces, pos: l.board.pos };
    seeds.push({ g, red: l.red, target: l.target, from: `${f} ${l.fewest}/${l.extra}` });
  }
}
console.log(`${seeds.length} seeds`);

const key = (g: Grid, red: number, target: number) => JSON.stringify([g.W, red === 0 ? 0 : 1, target, g.pieces.map((p, i) => [p.h, p.lane, g.pos[i]]).sort()]);
const seen = new Set<string>();
if (existsSync(out)) for (const l of readFileSync(out, "utf8").trim().split("\n").filter(Boolean)) { const x = JSON.parse(l); seen.add(key({ W: Number(x.size.split("x")[0]), H: 0, wall: new Uint8Array(0), pieces: x.pieces, pos: x.pos }, 0, x.target)); }

/** Red first, the walls left out (they are taken out, so every seed starts without). */
function start(s: Seed): Grid {
  const g = clone(s.g);
  g.wall.fill(0);
  const order = [s.red, ...g.pieces.keys()].filter((i, k) => k === 0 || i !== s.red);
  return { W: g.W, H: g.H, wall: g.wall, pieces: order.map((i) => g.pieces[i]!), pos: order.map((i) => g.pos[i]!) };
}

type S = ReturnType<typeof solve>;
const score = (s: S) => {
  if (s.status !== "ok") return -40;
  const f = s.fewest;
  return 3 * s.extraMin + Math.min(f, AIM.hi) - 3 * Math.max(0, f - AIM.hi) - 2 * Math.max(0, AIM.lo - f);
};
const good = (s: S) => s.status === "ok" && s.fewest >= AIM.lo && s.fewest <= AIM.hi && s.extraMin >= AIM.extra;

function climb(s0: Seed, runSeed: number, budget: number, runId: number) {
  const t0 = performance.now(), next = rng(runSeed * 7349 + 3);
  let g = start(s0), target = s0.target;
  const run = (x: Grid, t: number) => solve(x, 0, t, { cap: 150_000, maxDepth: AIM.hi + 4 });
  let cur = run(g, target), curScore = score(cur);
  let best = { g: clone(g), target, s: cur, score: curScore }, since = 0, evals = 1, found = 0;
  while (performance.now() - t0 < budget) {
    const x = clone(g);
    let t = target;
    const occ = occupancy(x), n = x.pieces.length, r = next();
    if (r < 0.3 || n < 4) addRandom(x, next, occ);
    else if (r < 0.45) removePiece(x, 1 + Math.floor(next() * (n - 1)));
    else if (r < 0.7) { removePiece(x, 1 + Math.floor(next() * (n - 1))); addRandom(x, next); }
    else if (r < 0.92) {
      const i = Math.floor(next() * n), p = x.pieces[i]!;
      cellsAt(x, p, x.pos[i]!).forEach((c) => (occ[c] = 0));
      const at = Math.floor(next() * span(x, p));
      if (free(occ, x, p, at) && !(i === 0 && at === t)) x.pos[i] = at;
    } else {
      const at = Math.floor(next() * span(x, x.pieces[0]!));
      if (at !== x.pos[0]) t = at;
    }
    const s = run(x, t);
    evals++;
    const sc = score(s);
    const T = 2 * (1 - (performance.now() - t0) / budget) + 0.2;
    if (sc >= curScore || next() < Math.exp((sc - curScore) / T)) ((g = x), (target = t), (cur = s), (curScore = sc));
    if (good(s)) {
      const k = key(x, 0, t);
      if (!seen.has(k)) {
        seen.add(k);
        found++;
        const lib: Lib & { from: string; run: number; ms: number } = { size: `${x.W}x${x.H}`, walls: [], pieces: x.pieces, pos: x.pos, red: 0, target: t, fewest: s.fewest, extra: { least: s.extraMin, most: s.extraMax }, from: s0.from, run: runId, ms: Math.round(performance.now() - t0) };
        appendFileSync(out, JSON.stringify(lib) + "\n");
      }
    }
    if (sc > best.score) ((best = { g: clone(x), target: t, s, score: sc }), (since = 0));
    else if (++since > 300) ((g = clone(best.g)), (target = best.target), (cur = best.s), (curScore = best.score), (since = 0));
  }
  return { best, evals, found };
}

const end = performance.now() + minutes * 60_000;
for (let k = part; performance.now() < end; k += parts) {
  // Two runs in three from a seed (the best ones first, then round again), one from a random room.
  let s: Seed;
  if (k % 3 === 2) {
    const next = rng(seed0 * 1009 + k), C = next() < 0.5 ? 6 : 7;
    const g = randomRoom(C, C, C === 6 ? 11 + Math.floor(next() * 4) : 14 + Math.floor(next() * 5), 0, next);
    const p = g.pieces.findIndex((q) => q.h) ;
    s = { g, red: Math.max(0, p), target: 0, from: "random" };
    s.target = g.pos[s.red]! < 2 ? span(g, g.pieces[s.red]!) - 1 : 0;
  } else s = seeds[(k - Math.floor(k / 3)) % seeds.length]!;
  const t0 = performance.now();
  const r = climb(s, seed0 * 100_000 + k, Math.min(perRun, end - performance.now()), seed0 * 100_000 + k);
  const b = r.best.s;
  console.log(`run ${k} (${s.from}): best ${b.fewest} moves ${b.extraMin}-${b.extraMax} extra, ${r.evals} evals, ${r.found} new rooms, ${Math.round((performance.now() - t0) / 1000)} s`);
}
