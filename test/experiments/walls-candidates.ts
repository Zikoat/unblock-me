// Every candidate goal today's maker weighs, not only the one it picks (reports/walls.html,
// "Candidates or selection"): fresh boards at a few wall shares, the maker watched
// (goal-search.ts Watch) through its steps. A line per board, kind "candidates": the goal it
// picked, each candidate in rank order (red, target, its push proof, the rough measure and
// its shortest solution if it found one, whether it went on to the finals) with the Judge's
// terms on its proof, the finalists after their exact measure with the fitness that picked
// one, and each step's time. Run it per wall share (with --cpu-prof to see where the
// maker's time goes, summed up by walls-profile.ts):
//   bun test/experiments/walls-candidates.ts --walls 0.04 --density 12 --boards 40 --out data/walls/cand-0.04.jsonl [--effort 0] [--from 0]
import { Board } from "../../src/board";
import { contractGoal, WISHES, WORLD_VERSION, type Request } from "../../src/contract";
import { makeGoalHard, type Ranked } from "../../src/goal-search";
import { judge } from "../../src/judge";
import { randomLayout } from "../../src/layout";
import type { Move } from "../../src/rules";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const walls = Number(arg("walls", "0")), density = Number(arg("density", "12")), boards = Number(arg("boards", "20"));
const from = Number(arg("from", "0")), effort = Number(arg("effort", "0")), out = arg("out", "data/walls/cand.jsonl");
const round = (x: number, k = 1000) => Math.round(x * k) / k;
/** A move as [block, from x, from y, to x, to y]. */
const compact = (moves: Move[]) => moves.map((m) => [m.id, m.from.x, m.from.y, m.to.x, m.to.y]);
const brief = (t: ReturnType<typeof judge>) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, round(v)]));

/** The Judge's terms on every candidate's proof (the experiment's own work, kept apart in the
 * profile by its name). */
function recordCandidates(request: Request, board: Board, ranked: readonly Ranked[], finalists: number) {
  return ranked.map((c, i) => {
    const d = c.difficulty;
    return {
      rank: i, finalist: i < finalists, red: c.id, target: c.target, distance: c.distance, track: c.train ?? 0,
      proof: compact(c.solution),
      rough: { fewest: d.moves, atLeast: d.atLeast, score: round(d.score), branching: round(d.branching) },
      ...(d.solution && d.solution.length < c.solution.length && { shortest: compact(d.solution) }),
      terms: brief(judge(request, contractGoal(c), { board })),
    };
  });
}

const lines: string[] = [];
for (let i = 0; i < boards; i++) {
  const seed = 100_000 * density + from + i;
  const request: Request = {
    version: 1, world: { seed, density, ...(walls && { walls }), ui: { island: false }, version: WORLD_VERSION },
    moved: {}, history: [], rampAim: null, wishes: WISHES, seed: 1,
  };
  const layout = randomLayout(seed, { tries: density, walls, island: false });
  layout.blocksIn({ x: -24, y: -24, width: 48, height: 48 });
  const board = new Board(layout);
  const steps: Record<string, number> = {};
  let candidates: ReturnType<typeof recordCandidates> = [];
  let finals: { red: string; target: unknown; proof: unknown; fewest: number | null; atLeast: number; fitness: number | null }[] = [];
  let paused = 0, last = performance.now();
  const t0 = last;
  const found = makeGoalHard(layout, { x: 0, y: 0 }, {
    moved: new Map(), exclude: new Set(), avoid: [],
    watch: {
      step(name) {
        const now = performance.now();
        steps[name] = round(now - last);
        last = now;
      },
      ranked(list, n) {
        const t = performance.now();
        candidates = recordCandidates(request, board, list, n);
        paused += performance.now() - t;
        last = performance.now();
      },
      picked(list, fitness) {
        finals = list.map((c) => ({ red: c.id, target: c.target, proof: compact(c.solution), fewest: c.difficulty.moves, atLeast: c.difficulty.atLeast, fitness: fitness ? round(fitness.get(c)!) : null }));
      },
    },
  }, effort);
  const makerMs = performance.now() - t0 - paused;
  lines.push(JSON.stringify({
    kind: "candidates", walls, density, seed, effort, makerMs: round(makerMs), ownMs: round(paused), steps,
    chosen: found && { red: found.id, target: found.target, proof: compact(found.solution), terms: brief(judge(request, contractGoal(found), { board })) },
    finals, candidates,
  }));
}
await Bun.write(out, lines.join("\n") + "\n");
console.log(`${boards} boards at ${walls} walls: ${out}`);
