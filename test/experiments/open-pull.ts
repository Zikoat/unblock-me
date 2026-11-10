// Pulling world blocks into a finished open room (your idea; reports/trial-mixed.html): a world
// block next to the room slid in, as a player could have, onto empty cells of the room. The puzzle
// then needs it moved out first. Each pull is kept only if open-core.ts's two bounds still agree
// (fewest and extra moves exact in any surroundings) and mixed-core.ts's numbers agree on both
// bounds too. Greedy, up to --pulls pulls a room: of the pulls that stay exact, the one that adds
// the most fewest moves (then mixedness), and again on top of it. --chain 2 or 3: the world may
// first make 1 or 2 moves of its own (a lane opened for the block pulled in); --full: how many
// candidates, best first on the upper bound alone, get the full check. Searches look no further
// than 6 moves past the room's fewest (a pull adding more is not kept).
//   bun test/experiments/open-pull.ts --in data/open-gen/high.jsonl,data/open-gen/high6.jsonl --pulls 2 --chain 2 --out data/open-gen/pulled.jsonl [--part 0/2]
// Each room is written once as it was (pulls 0) and once per pull kept, JSONL.
import { appendFileSync, readFileSync } from "node:fs";
import { cellsAt, clone, type Grid, occupancy, span } from "./extra-gen-core";
import { checkMixed, type Key, over, type Range } from "./mixed-core";
import { solveFramed } from "./open-core";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const files = arg("in", "data/open-gen/high.jsonl,data/open-gen/high6.jsonl").split(",");
const pulls = Number(arg("pulls", "2")), out = arg("out", "data/open-gen/pulled.jsonl"), cap = Number(arg("cap", "1500000"));
const chain = Number(arg("chain", "1")), full = Number(arg("full", "6"));
const [part, parts] = arg("part", "0/1").split("/").map(Number) as [number, number];

export type Board = { W: number; H: number; walls: number[]; pieces: Grid["pieces"]; pos: number[] };
export type Room = { from: string; board: Board; R: number[]; target: number; size: number; margin: number };
export const gridOf = (b: Board): Grid => {
  const g: Grid = { W: b.W, H: b.H, wall: new Uint8Array(b.W * b.H), pieces: b.pieces.map((p) => ({ ...p })), pos: [...b.pos] };
  for (const c of b.walls) g.wall[c] = 1;
  return g;
};
export const boardOf = (g: Grid): Board => ({ W: g.W, H: g.H, walls: [...g.wall.keys()].filter((c) => g.wall[c]), pieces: g.pieces, pos: g.pos });

/** Every pull: a world block's legal slide that ends on at least one empty cell of the room. */
export function pullsOf(g: Grid, R: number[], m: number, S: number) {
  const occ = occupancy(g), inR = new Set(R), res: { i: number; from: number; to: number }[] = [];
  const inRoom = (c: number) => { const x = c % g.W, y = Math.floor(c / g.W); return x >= m && y >= m && x < m + S && y < m + S; };
  g.pieces.forEach((p, i) => {
    if (inR.has(i)) return;
    const at = g.pos[i]!, cell = (k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);
    const go = (to: number) => { if (cellsAt(g, p, to).some(inRoom)) res.push({ i, from: at, to }); };
    for (let j = at - 1; j >= 0 && occ[cell(j)] === 0; j--) go(j);
    for (let j = at + 1; j < span(g, p) && occ[cell(j + 1)] === 0; j++) go(j);
  });
  return res;
}

type Eval = { fewest: number; extra: number; extraMax: number; mix: Record<Key, Range>; solutions: number; states: { up: number; low: number }; used: number[] };
export function evaluate(g: Grid, R: number[], target: number, cap = 600_000, why?: (s: string) => void, bound = Infinity): Eval | null {
  const c = checkMixed(g, R, target, { cap, paths: 20_000, bound });
  if (!c.exact || !c.mixedExact) {
    why?.(c.up.status !== "ok" ? `upper ${c.up.status}` : c.low?.status !== "ok" ? `lower ${c.low?.status}${c.low?.fewest! >= 0 ? ` ${c.low?.fewest}` : ""}` : !c.exact ? `bounds differ (${c.up.fewest}/${c.up.extraMin}-${c.up.extraMax} vs ${c.low!.fewest}/${c.low!.extraMin}-${c.low!.extraMax})` : c.sampled ? "too many solutions" : "mixedness differs");
    return null;
  }
  return { fewest: c.up.fewest, extra: c.up.extraMin, extraMax: c.up.extraMax, mix: c.mixed!, solutions: c.solutions, states: { up: c.up.states, low: c.low!.states }, used: [...c.up.used.keys()].filter((k) => c.up.used[k]) };
}

if (import.meta.main) {
  const rooms: Room[] = files.flatMap((f) => readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l, k) => {
    const x = JSON.parse(l);
    return { from: `${f.split("/").pop()}:${k}`, board: x.board, R: x.R, target: x.target, size: x.size, margin: x.margin };
  }));
  const score = (e: { fewest: number; mix: Record<Key, Range> }) => e.fewest * 10 + e.mix.redBetween.min + e.mix.crossing.min;
  type Step = { i: number; from: number; to: number };
  const start = performance.now();
  process.on("exit", () => console.log(`TOTAL ${Math.round((performance.now() - start) / 1000)}`));
  rooms.forEach((room, n) => {
    if (n % parts !== part) return;
    const t0 = performance.now();
    let g = gridOf(room.board), R = [...room.R];
    let cur = evaluate(g, R, room.target, cap);
    if (!cur) return console.log(`${room.from}: not exact as it was`);
    const write = (k: number, moved: Step[], tried: number, adds = true) =>
      appendFileSync(out, JSON.stringify({ from: room.from, pulls: k, adds, moved, tried, ms: Math.round(performance.now() - t0), ...cur, R, target: room.target, size: room.size, margin: room.margin, board: boardOf(g) }) + "\n");
    write(0, [], 0);
    console.log(`${room.from} as made: ${cur.fewest} moves, ${cur.extra}-${cur.extraMax} extra, red between ${cur.mix.redBetween.min}-${cur.mix.redBetween.max}, crossing ${cur.mix.crossing.min}-${cur.mix.crossing.max}`);
    const moved: Step[] = [];
    for (let k = 1; k <= pulls; k++) {
      // Candidates: up to chain − 1 world moves anywhere in the window, then a pull onto a room
      // cell some shortest solution uses (elsewhere a pulled block is in no one's way).
      const used = new Set(cur.used), seen = new Set<string>(), cands: { x: Grid; steps: Step[]; i: number }[] = [];
      const inR = new Set(R);
      const grow = (x: Grid, steps: Step[], depth: number) => {
        for (const p of pullsOf(x, R, room.margin, room.size)) {
          if (!cellsAt(x, x.pieces[p.i]!, p.to).some((c) => used.has(c))) continue;
          const y = clone(x);
          y.pos[p.i] = p.to;
          const key = y.pos.join(",");
          if (!seen.has(key)) (seen.add(key), cands.push({ x: y, steps: [...steps, p], i: p.i }));
        }
        if (depth + 1 >= chain) return;
        const occ = occupancy(x);
        x.pieces.forEach((pc, i) => {
          if (inR.has(i)) return;
          const at = x.pos[i]!, cell = (q: number) => (pc.h ? pc.lane * x.W + q : q * x.W + pc.lane);
          const go = (to: number) => { const y = clone(x); y.pos[i] = to; grow(y, [...steps, { i, from: at, to }], depth + 1); };
          for (let j = at - 1; j >= 0 && occ[cell(j)] === 0; j--) go(j);
          for (let j = at + 1; j < span(x, pc) && occ[cell(j + 1)] === 0; j++) go(j);
        });
      };
      grow(g, [], 0);
      // A quick look on the upper bound alone (the room's blocks moving, the world frozen); only
      // those that add moves or mixedness there get the full check.
      let capped = 0;
      const quick = cands.map((c) => {
        const u = solveFramed(c.x, [...R, c.i], room.target, { cap, paths: 5_000, bound: cur!.fewest + 6 });
        if (u.status === "cap") capped++;
        return { ...c, u: u.status === "ok" && u.paths ? { fewest: u.fewest, mix: over(u.paths.list.map((q) => q.map((m) => m[0])), R[0]!) } : null };
      }).filter((c) => c.u && (c.u.fewest > cur!.fewest || score(c.u) > score(cur!))).sort((a, b) => score(b.u!) - score(a.u!));
      let best: { e: Eval; c: (typeof cands)[number] } | null = null;
      for (const c of quick.slice(0, full)) {
        const why: string[] = [];
        const e = evaluate(c.x, [...R, c.i], room.target, cap, (w) => why.push(w), cur.fewest + 6);
        console.log(`    ${c.steps.map((q) => `${q.i}:${q.from}->${q.to}`).join(" ")}: ${e ? `${e.fewest} moves, ${e.extra}-${e.extraMax} extra, red between ${e.mix.redBetween.min}, crossing ${e.mix.crossing.min}` : why[0]}`);
        if (e && (!best || score(e) > score(best.e))) best = { e, c };
      }
      const tried = `${cands.length} candidates, ${quick.length} adding on the upper bound, ${capped} too big to search`;
      if (!best || score(best.e) <= score(cur)) {
        console.log(`  pull ${k}: none that adds (${tried})`);
        // Else, once: the first pull that keeps everything exact and as it was, on a cell some
        // shortest solutions use (it closes those ways but adds no move): written with adds false.
        if (k === 1) for (const c of cands.filter((c) => !quick.includes(c as never)).slice(0, 4)) {
          const e = evaluate(c.x, [...R, c.i], room.target, cap, undefined, cur.fewest + 6);
          if (!e || e.fewest !== cur.fewest) continue;
          g = c.x; R = [...R, c.i]; cur = e; moved.push(...c.steps);
          write(k, moved, cands.length, false);
          console.log(`  pull ${k} (adds nothing): ${cur.fewest} moves, ${cur.extra}-${cur.extraMax} extra, red between ${cur.mix.redBetween.min}-${cur.mix.redBetween.max}, crossing ${cur.mix.crossing.min}-${cur.mix.crossing.max}`);
          break;
        }
        break;
      }
      g = best.c.x; R = [...R, best.c.i]; cur = best.e; moved.push(...best.c.steps);
      write(k, moved, cands.length);
      console.log(`  pull ${k}: ${cur.fewest} moves, ${cur.extra}-${cur.extraMax} extra, red between ${cur.mix.redBetween.min}-${cur.mix.redBetween.max}, crossing ${cur.mix.crossing.min}-${cur.mix.crossing.max} (${tried}, ${Math.round((performance.now() - t0) / 1000)} s)`);
    }
  });
}
