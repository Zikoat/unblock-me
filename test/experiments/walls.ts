// Walls × block density (reports/walls.html): fresh boards at each wall share and block
// density, today's maker (effort 0 by default) asked for a goal round the origin as the game
// asks its first, and its RAW output per goal as JSONL, so any number can be derived later
// without running it again (walls-report.ts makes the report from these files alone):
//   bun test/experiments/walls.ts --walls 0,0.03,0.06,0.1,0.15 --densities 6,9,12,16 --boards 8 --out data/walls/low.jsonl [--effort 0] [--aim none|<n>] [--jobs <processes>] [--from <first board>]
// A line per board: the world (seed, density, walls), a census of the 16x16 cells round the
// origin, the blocks round the goal (every block the proof moves, red's run, 3 cells more),
// the goal with the maker's proof as its full move list, the maker's own measure (exact
// fewest within its window, or a lower bound), the Referee's verdict, the Judge's terms and
// decision stages, the choices along the proof, and each step's time. The fewest moves are
// the proof's: no other search for a shorter one.
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Board } from "../../src/board";
import { choices } from "../../src/choices";
import { contractGoal, WISHES, WORLD_VERSION, type Request } from "../../src/contract";
import { decisionStages } from "../../src/decisions";
import { makeGoalHard } from "../../src/goal-search";
import { judge } from "../../src/judge";
import { randomLayout } from "../../src/layout";
import { referee } from "../../src/referee";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const list = (s: string) => s.split(",").map(Number);
const walls = list(arg("walls", "0,0.03,0.06,0.1,0.15")), densities = list(arg("densities", "6,9,12,16"));
const boards = Number(arg("boards", "4")), from = Number(arg("from", "0")), effort = Number(arg("effort", "0"));
const aim = arg("aim", "none") === "none" ? null : Number(arg("aim", "none"));
const out = arg("out", "data/walls/run.jsonl"), jobs = Number(arg("jobs", "1")), shard = arg("shard", "");

/** Every case of the sweep, in a fixed order: a board's seed follows from its cell and
 * index, so the same board is made at every wall share (the walls differ, the draws do not). */
const cases = walls.flatMap((w) => densities.flatMap((d) => Array.from({ length: boards }, (_, i) => ({ walls: w, density: d, seed: 100_000 * d + from + i }))));

const CENSUS = { x: -8, y: -8, width: 16, height: 16 };
const MARGIN = 3;
const round = (x: number, k = 1000) => Math.round(x * k) / k;

function run(c: (typeof cases)[number]) {
  const request: Request = {
    version: 1,
    world: { seed: c.seed, density: c.density, ...(c.walls && { walls: c.walls }), ui: { island: false }, version: WORLD_VERSION },
    moved: {}, history: [], rampAim: aim, wishes: WISHES, seed: 1,
  };
  let t = performance.now();
  const layout = randomLayout(c.seed, { tries: c.density, walls: c.walls, island: false });
  // The chunks the maker will look at, made first so their time is the generator's.
  const census = layout.blocksIn({ x: -24, y: -24, width: 48, height: 48 }).filter((b) => !b.ui && b.x >= CENSUS.x && b.y >= CENSUS.y && b.x < CENSUS.x + CENSUS.width && b.y < CENSUS.y + CENSUS.height);
  const genMs = performance.now() - t;
  const cells = (f: (b: (typeof census)[number]) => boolean) => census.filter(f).reduce((a, b) => a + b.w * b.h, 0);
  const base = { walls: c.walls, density: c.density, seed: c.seed, world: request.world, effort, aim, census: { area: CENSUS.width * CENSUS.height, blocks: census.filter((b) => !b.wall).length, blockCells: cells((b) => !b.wall), wallCells: cells((b) => b.wall) } };
  t = performance.now();
  const found = makeGoalHard(layout, { x: 0, y: 0 }, { moved: new Map(), exclude: new Set(), avoid: [], ...(aim !== null && { target: aim }) }, effort);
  const makerMs = performance.now() - t;
  if (!found) return { ...base, found: false, ms: { gen: round(genMs), maker: round(makerMs) } };
  const goal = contractGoal(found), board = new Board(layout);
  const red = board.block(found.id);
  t = performance.now();
  const verdict = referee(request, goal, board);
  const refereeMs = performance.now() - t;
  t = performance.now();
  const terms = judge(request, goal, { board });
  const stages = decisionStages(board, goal);
  const judgeMs = performance.now() - t;
  t = performance.now();
  const choice = choices(layout, new Map(), found);
  const choicesMs = performance.now() - t;
  // The blocks round the goal: red's run and every cell the proof's blocks are in, 3 more.
  const xs = [red.x, found.target.x + red.w - 1], ys = [red.y, found.target.y + red.h - 1];
  for (const m of goal.moves) {
    const b = board.home(m.block)!;
    xs.push(m.from.x, m.to.x + b.w - 1);
    ys.push(m.from.y, m.to.y + b.h - 1);
  }
  const box = { x: Math.min(...xs) - MARGIN, y: Math.min(...ys) - MARGIN, width: Math.max(...xs) - Math.min(...xs) + 1 + 2 * MARGIN, height: Math.max(...ys) - Math.min(...ys) + 1 + 2 * MARGIN };
  const blocks = layout.blocksIn(box).map((b) => [b.id, b.x, b.y, b.w, b.h, b.wall ? 1 : b.ui ? 2 : 0]);
  const d = found.difficulty;
  return {
    ...base, found: true, ok: verdict.ok, ...(!verdict.ok && { verdict }),
    box, blocks,
    goal: { red: goal.red, start: { x: red.x, y: red.y }, size: { w: red.w, h: red.h }, target: goal.target, moves: goal.moves },
    maker: { fewest: d.moves, atLeast: d.atLeast, branching: round(d.branching), score: round(d.score), searched: d.searched, distance: found.distance, track: found.train ?? 0 },
    terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, round(v)])), stages, choices: choice,
    ms: { gen: round(genMs), maker: round(makerMs), referee: round(refereeMs), judge: round(judgeMs), choices: round(choicesMs) },
  };
}

if (shard) {
  // One process's share: every jobs-th case from its index.
  const [i, k] = shard.split("/").map(Number) as [number, number];
  const lines: string[] = [];
  for (let n = i; n < cases.length; n += k) {
    lines.push(JSON.stringify(run(cases[n]!)));
    if (lines.length % 10 === 0) await Bun.write(`${out}.part${i}`, lines.join("\n") + "\n");
  }
  await Bun.write(`${out}.part${i}`, lines.join("\n") + "\n");
} else {
  await mkdir(dirname(out), { recursive: true });
  const t0 = performance.now();
  const args = process.argv.slice(2);
  const procs = Array.from({ length: jobs }, (_, i) => Bun.spawn(["bun", import.meta.path, ...args, "--shard", `${i}/${jobs}`], { stdout: "inherit", stderr: "inherit" }));
  const codes = await Promise.all(procs.map((p) => p.exited));
  if (codes.some((c) => c !== 0)) throw new Error(`a shard failed: ${codes}`);
  const parts = await Promise.all(procs.map((_, i) => Bun.file(`${out}.part${i}`).text()));
  await Bun.write(out, parts.join(""));
  for (let i = 0; i < jobs; i++) await rm(`${out}.part${i}`);
  console.log(`${cases.length} boards in ${Math.round((performance.now() - t0) / 1000)} s with ${jobs} processes: ${out}`);
}
