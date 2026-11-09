// Generating boards with real extra moves (reports/extra-gen.html): runs one generator of
// extra-gen-make.ts on fresh seeds within a time budget each, a line per board as JSONL (data/ is
// not kept in git). A board succeeds when its goal needs 10 to 16 moves with 3 or more extra
// moves on every shortest solution, verified exactly; one that runs out of time would fall back
// to today's random placement.
//   bun test/experiments/extra-gen.ts --method A|Alib|B|Bopen --budget 1000 --boards 30 --seed 1 [--edge open|wall] --out data/extra-gen/A-1000.jsonl
// A: random walled rooms searched whole until one has such a goal, then opened up into the world.
// Alib: the room from a library made ahead (extra-moves.ts's goals), then opened up.
// B: simulated annealing from an empty region; Bopen: B, then opened up.
// --edge: the opening keeps the board exact in the endless world ("open": sealed) or only on the
// window framed by walls ("wall", a trial board).
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Edge, Grid } from "./extra-gen-core";
import { makeA, makeB, type Made, openUp, WANT } from "./extra-gen-make";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const method = arg("method", "B"), budget = Number(arg("budget", "1000")), boards = Number(arg("boards", "10"));
const seed0 = Number(arg("seed", "1")), edge = arg("edge", "open") as Edge, out = arg("out", `data/extra-gen/${method}-${budget}.jsonl`);
mkdirSync(dirname(out), { recursive: true });

type Lib = { size: string; walls: number[]; pieces: Grid["pieces"]; pos: number[]; red: number; target: number; fewest: number; states: number; extra: { least: number; most: number } };
const library: Lib[] = method === "Alib"
  ? ["6x6", "7x7", "7x7-dense"].flatMap((f) => readFileSync(`data/extra/${f}.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Lib))
      .filter((l) => l.fewest >= WANT.lo && l.fewest <= WANT.hi && l.extra.least >= WANT.extra)
  : [];
if (method === "Alib") console.log(`library: ${library.length} goals`);

for (let b = 0; b < boards; b++) {
  const seed = seed0 * 100_000 + b;
  const t0 = performance.now();
  let m: Made;
  if (method === "A") m = makeA(seed, budget, WANT, true, edge);
  else if (method === "B") m = makeB(seed, budget);
  else if (method === "Bopen") {
    m = makeB(seed, budget);
    if (m.ok) Object.assign(m, openUp(m, seed, t0 + budget, edge));
  } else {
    const l = library[(seed * 2654435761) % library.length]!;
    const [W, H] = l.size.split("x").map(Number) as [number, number];
    const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: l.pieces, pos: l.pos };
    for (const c of l.walls) g.wall[c] = 1;
    m = { ok: true, ms: 0, g, red: l.red, target: l.target, fewest: l.fewest, extra: l.extra.least, extraMax: l.extra.most, states: l.states, tries: 0, evals: 0 };
    Object.assign(m, openUp(m, seed, t0 + budget, edge));
  }
  m.ms = performance.now() - t0;
  const { g, ...rest } = m;
  const line = { method, budget, edge, seed, ...rest, board: g && { W: g.W, H: g.H, walls: [...g.wall.keys()].filter((c) => g.wall[c]), pieces: g.pieces, pos: g.pos } };
  appendFileSync(out, JSON.stringify(line) + "\n");
  console.log(`${method} ${budget} ms, board ${b}: ${m.ok ? "ok" : "fallback"} ${Math.round(m.ms)} ms, ${m.fewest} moves, ${m.extra} extra${m.open ? `, opened ${m.open.opened}/${m.open.ring}, ${m.open.distractors} distractors, ${m.open.sealed ? "sealed" : "unsealed"}` : ""}`);
}
