// State-space analysis of every trial board played so far (research task 3): the full graph of
// the blocks that matter, numbers about getting lost in it, simulated players, and the user's
// own path through it; ranked against the blind verdicts and the play logs.
//   bun lab/statespace.ts            (writes lab/out/statespace.json and prints a table)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { TRIALS, type Trial } from "../src/trials";
import { MAKER_TRIALS } from "../src/trials-maker";
import { GEN_TRIALS } from "../src/trials-gen";
import { OPEN_TRIALS } from "../src/trials-open";
import { OPEN_TRIALS_J } from "../src/trials-open-j";
import { OPEN_TRIALS_K } from "../src/trials-open-k";
import { analyse, cellsAt, clone, occupancy, solve, type Grid } from "../test/experiments/extra-gen-core";
import { gridOf, type Mv } from "../test/experiments/trial-grid";
import { blockers, blockersDeep, buildGraph, findState, type Graph, rng, rollout, stateOf } from "./graph";
import { ORDER_ALL as ORDER, PAIRS, spearman, pairScore } from "./verdicts";

const all: Trial[] = [...TRIALS, ...MAKER_TRIALS, ...GEN_TRIALS, ...OPEN_TRIALS, ...OPEN_TRIALS_J, ...OPEN_TRIALS_K];
const MAX_R = 60;
const CAP = 2_000_000;
/** The region searched: states on some solution of at most fewest + SLACK moves. */
const SLACK = Number(process.env.SLACK ?? 3);

/** The blocks that matter, cut to at most MAX_R like trial-features.ts: the proof's blocks, then
 * those whose reach crosses a cell the proof sweeps, then (if room) those the player moved. */
// The open rooms' rectangles and block ids (trial coordinates), from the files that made them.
const rooms = new Map<string, { x: number; y: number; width: number; height: number }>(), roomIds = new Map<string, string[]>();
for (const f of ["data/open-gen/trials.json", "data/open-gen/trials-j.json", "data/open-gen/trials-k.json"]) {
  if (existsSync(f)) for (const t of JSON.parse(readFileSync(f, "utf8"))) (rooms.set(t.label, t.room), t.roomIds && roomIds.set(t.label, t.roomIds));
}
/** ROOM=1: on the open trials only the room's own blocks move, the world frozen (the "framed"
 * upper bound of open-core.ts; exact where trial-mixed.html says the bounds agree). */
const ROOM = process.env.ROOM === "1";

function pickR(t: Trial, g: Grid, red: number, proof: Mv[], played: Set<string>, index: Map<string, number>, ox = 0, oy = 0): { R: number[]; cut: boolean } {
  const a = analyse(g, red, "wall", occupancy(g));
  const room = rooms.get(t.label);
  if (ROOM && room) {
    const inside = (c: number) => { const x = (c % g.W) + ox, y = Math.floor(c / g.W) + oy; return x >= room.x && y >= room.y && x < room.x + room.width && y < room.y + room.height; };
    const ids = roomIds.get(t.label);
    const R = ids ? ids.map((id) => index.get(id)!) : [red, ...g.pieces.keys()].filter((i, k) => (k === 0 || i !== red) && cellsAt(g, g.pieces[i]!, g.pos[i]!).every(inside));
    return { R: [red, ...R.filter((i) => i !== red && a.relevant.includes(i))], cut: true };
  }
  if (a.relevant.length <= MAX_R) return { R: a.relevant, cut: false };
  const swept = new Set<number>();
  for (const [i, s, e] of proof) for (let k = Math.min(s, e); k <= Math.max(s, e) + 1; k++) swept.add(g.pieces[i]!.h ? g.pieces[i]!.lane * g.W + k : k * g.W + g.pieces[i]!.lane);
  const keep = new Set<number>([red, ...proof.map((m) => m[0])]);
  for (const id of played) { const i = index.get(id); if (i !== undefined && a.relevant.includes(i)) keep.add(i); }
  const touching: number[] = [];
  for (const i of a.relevant) {
    if (keep.has(i)) continue;
    const [lo, hi] = a.extent[i]!, p = g.pieces[i]!;
    for (let k = lo; k <= hi + 1; k++) if (swept.has(p.h ? p.lane * g.W + k : k * g.W + p.lane)) { touching.push(i); break; }
  }
  // Nearest to the proof's cells first.
  for (const i of touching) if (keep.size < MAX_R) keep.add(i);
  const R = [red, ...[...keep].filter((i) => i !== red).sort((x, y) => x - y)];
  return { R, cut: true };
}

/** The user's play on a trial: every session that reached the goal, as grid moves. */
function plays(t: Trial, index: Map<string, number>, g: Grid, ox: number, oy: number) {
  const out: { session: string; moves: Mv[]; ids: string[]; seconds: number; first: number }[] = [];
  if (!existsSync("play-data")) return out;
  for (const f of readdirSync("play-data").filter((f) => f.startsWith(`trial-${t.label}-`))) {
    const log = JSON.parse(readFileSync(`play-data/${f}`, "utf8")).log as { t: number; e: string; id?: string; from?: { x: number; y: number }; to?: { x: number; y: number } }[];
    const reached = log.find((e) => e.e === "reached");
    if (!reached) continue;
    const goal = log.find((e) => e.e === "goal")!;
    const moves: Mv[] = [], ids: string[] = [];
    for (const e of log) {
      if (e.e !== "move" || e.t > reached.t) continue;
      const i = index.get(e.id!);
      if (i === undefined) { ids.push(e.id!); moves.push([-1, 0, 0]); continue; }
      const p = g.pieces[i]!;
      moves.push([i, p.h ? e.from!.x - ox : e.from!.y - oy, p.h ? e.to!.x - ox : e.to!.y - oy]);
      ids.push(e.id!);
    }
    const firstMove = log.find((e) => e.e === "move");
    out.push({ session: f.split("-").pop()!.replace(".json", ""), moves, ids, seconds: (reached.t - goal.t) / 1000, first: firstMove ? (firstMove.t - goal.t) / 1000 : 0 });
  }
  return out;
}

type Row = Record<string, number | string | boolean | null>;

function measure(t: Trial): Row {
  const t0 = performance.now();
  const { g, red, target, proof, index, ox, oy } = gridOf(t);
  const sessions = plays(t, index, g, ox, oy);
  const played = new Set(sessions.flatMap((s) => s.ids));
  const { R, cut } = pickR(t, g, red, proof as Mv[], played, index, ox, oy);
  const G = buildGraph(g, R, target, CAP, SLACK >= 99 ? Infinity : t.fewest + SLACK);
  const N = G.count, fewest = G.dist[G.start]!;
  const row: Row = { label: t.label, fewest, relevant: R.length, cut, states: N, capped: G.capped, slack: SLACK };
  if (fewest !== t.fewest) row.note = `fewest ${fewest} on this R, trial says ${t.fewest}`;
  // Only states on some solution within the bound are exact; the rest are the bound's slop.
  let valid = 0;
  for (let s = 0; s < N; s++) if (G.dist[s]! >= 0 && G.fromStart[s]! + G.dist[s]! <= t.fewest + SLACK) valid++;
  row.validStates = valid;

  // --- The shape of the space around the solution.
  let maxD = 0, far = 0, near = 0;
  for (let s = 0; s < N; s++) { const d = G.dist[s]!; if (d < 0) continue; if (d > maxD) maxD = d; if (d > fewest) far++; else near++; }
  row.maxDist = maxD;             // how far from the goal one can get at all
  row.farShare = far / N;         // share of states farther from the goal than the start
  row.nearStates = near;          // states no farther than the start: where a sensible player roams

  // Heuristics per state (only for states within fewest+2 of the goal, the roaming region).
  const H = new Int16Array(N).fill(-1), HD = new Int16Array(N).fill(-1);
  const roam = (s: number) => G.dist[s]! >= 0 && G.fromStart[s]! + G.dist[s]! <= fewest + SLACK;
  for (let s = 0; s < N; s++) if (roam(s)) { H[s] = blockers(G, s, target); HD[s] = blockersDeep(G, s, target); }

  // Moves in the roaming region: downhill (d* - 1), level, uphill; and misleading ones: the
  // blocker count drops (looks like progress) but d* rises or stays.
  let edges = 0, down = 0, up = 0, misleading = 0, lookGood = 0;
  let localMin = 0, roamStates = 0;
  for (let s = 0; s < N; s++) {
    if (!roam(s) || G.dist[s] === 0) continue;
    roamStates++;
    let bestH = Infinity;
    for (let e = G.off[s]!; e < G.off[s + 1]!; e++) {
      const tt = G.adj[e]!;
      edges++;
      const dd = G.dist[tt]! - G.dist[s]!;
      if (dd < 0) down++; else if (dd > 0) up++;
      if (roam(tt)) {
        if (H[tt]! < H[s]!) { lookGood++; if (dd >= 0) misleading++; }
        bestH = Math.min(bestH, HD[tt]!);
      }
    }
    if (bestH >= HD[s]!) localMin++; // no move improves the deep blocker bound: greedy is stuck
  }
  row.roamStates = roamStates;
  row.downShare = down / edges;           // share of moves that make progress
  row.misleadingShare = lookGood ? misleading / lookGood : 0; // of moves that drop a blocker, how many don't help
  row.misleadingPerState = misleading / roamStates;
  row.localMinShare = localMin / roamStates; // states where the blocker bound can't be improved by one move

  // The optimal corridor: states on some shortest solution.
  const onOpt = new Uint8Array(N);
  let optStates = 0;
  for (let s = 0; s < N; s++) if (G.dist[s]! >= 0 && G.fromStart[s]! >= 0 && G.dist[s]! + G.fromStart[s]! === fewest) ((onOpt[s] = 1), optStates++);
  row.optStates = optStates;
  // Bits to find the way: along the easiest shortest solution, sum of log2(moves available /
  // moves that stay on a shortest solution) (Chen 2023's idea, with every legal move "sensible").
  const bits = new Float64Array(N).fill(Infinity);
  for (const gl of G.goals) if (onOpt[gl]) bits[gl] = 0;
  for (let d = 1; d <= fewest; d++) for (let s = 0; s < N; s++) {
    if (!onOpt[s] || G.dist[s] !== d) continue;
    let total = 0, stay = 0, best = Infinity;
    for (let e = G.off[s]!; e < G.off[s + 1]!; e++) { const tt = G.adj[e]!; total++; if (onOpt[tt] && G.dist[tt] === d - 1) { stay++; best = Math.min(best, bits[tt]!); } }
    bits[s] = best + Math.log2(total / stay);
  }
  row.bits = bits[G.start]!;
  // Blocks that look relevant (roadmap 4.2): free blocks (of the whole board, world included)
  // whose reach crosses a cell some shortest solution sweeps; decoys are those no shortest
  // solution moves. Red's own path cells count as swept.
  {
    const usedCells = new Set<number>(), movedBlocks = new Set<number>();
    const redP = g.pieces[red]!;
    for (let j = Math.min(g.pos[red]!, target); j <= Math.max(g.pos[red]!, target) + 1; j++) usedCells.add(redP.h ? redP.lane * g.W + j : j * g.W + redP.lane);
    for (let s = 0; s < N; s++) {
      if (!onOpt[s]) continue;
      for (let e = G.off[s]!; e < G.off[s + 1]!; e++) {
        const tt = G.adj[e]!;
        if (!onOpt[tt] || G.dist[tt] !== G.dist[s]! - 1) continue;
        const k = G.who[e]!, i = R[k]!, p = g.pieces[i]!, a = stateOf(G, s)[k]!, b = stateOf(G, tt)[k]!;
        movedBlocks.add(i);
        for (let j = Math.min(a, b); j <= Math.max(a, b) + 1; j++) usedCells.add(p.h ? p.lane * g.W + j : j * g.W + p.lane);
      }
    }
    const a0 = analyse(g, red, "wall", occupancy(g));
    let looks = 0, decoys = 0, decoysWorld = 0;
    g.pieces.forEach((p, i) => {
      if (a0.locked[i] || i === red) return;
      const [lo, hi] = a0.extent[i]!;
      let touches = false;
      for (let j = lo; j <= hi + 1 && !touches; j++) if (usedCells.has(p.h ? p.lane * g.W + j : j * g.W + p.lane)) touches = true;
      if (!touches) return;
      looks++;
      if (!movedBlocks.has(i)) { decoys++; if (!R.includes(i)) decoysWorld++; }
    });
    row.looksRelevant = looks; row.decoys = decoys; row.decoysWorld = decoysWorld; row.solutionBlocks = movedBlocks.size;
  }
  // Moves from the start that stay optimal, out of all; and the first wrong-looking steps: the
  // fraction of 2-move sequences from the start that make no progress.
  let total0 = 0, stay0 = 0;
  for (let e = G.off[G.start]!; e < G.off[G.start + 1]!; e++) { total0++; if (G.dist[G.adj[e]!]! < fewest) stay0++; }
  row.firstMoves = total0; row.firstGood = stay0;

  // --- Simulated players (seeded, 200 runs each, cap 400 moves).
  const CAP_MOVES = 400, RUNS = 200;
  const sim = (name: string, pick: (s: number, a: number, b: number, prev: number, r: () => number) => number) => {
    const r = rng(7);
    const res: number[] = [];
    for (let k = 0; k < RUNS; k++) res.push(rollout(G, (s, a, b, prev) => pick(s, a, b, prev, r), CAP_MOVES));
    res.sort((x, y) => x - y);
    row[`${name}Mean`] = res.reduce((x, y) => x + y, 0) / RUNS;
    row[`${name}Med`] = res[RUNS >> 1]!;
    row[`${name}GiveUp`] = res.filter((x) => x >= CAP_MOVES).length / RUNS;
  };
  // 1. random walk, no take-backs
  sim("walk", (s, a, b, prev, r) => {
    const es: number[] = [];
    for (let e = a; e < b; e++) if (G.adj[e] !== prev) es.push(e);
    return es.length ? es[Math.floor(r() * es.length)]! : a;
  });
  // 2. greedy on the blocker count with noise: with p 0.25 a random move, else the move with the
  // lowest deep blocker bound (random among ties), never straight back.
  const hOf = (s: number) => (HD[s] >= 0 ? HD[s]! : blockersDeep(G, s, target));
  sim("greedy", (s, a, b, prev, r) => {
    const es: number[] = [];
    for (let e = a; e < b; e++) if (G.adj[e] !== prev) es.push(e);
    if (!es.length) return a;
    if (r() < 0.25) return es[Math.floor(r() * es.length)]!;
    let best = Infinity, pickd: number[] = [];
    for (const e of es) { const h = hOf(G.adj[e]!); if (h < best) ((best = h), (pickd = [e])); else if (h === best) pickd.push(e); }
    return pickd[Math.floor(r() * pickd.length)]!;
  });
  // 3. a player who knows the distance but errs: a softmax on d* (Jarusek-like, bonus for
  // progress), temperature 1: p ∝ exp(-(d*(s')-d*(s))).
  sim("soft", (s, a, b, prev, r) => {
    const ws: number[] = [], es: number[] = [];
    let sum = 0;
    for (let e = a; e < b; e++) { if (G.adj[e] === prev) continue; const w = Math.exp(-(G.dist[G.adj[e]!]! - G.dist[s]!)); ws.push(w); es.push(e); sum += w; }
    let x = r() * sum;
    for (let i = 0; i < es.length; i++) { x -= ws[i]!; if (x <= 0) return es[i]!; }
    return es[es.length - 1] ?? a;
  });

  // --- The user's path through the graph.
  if (sessions.length) {
    const s0 = sessions[0]!; // the first session that reached the goal
    const pos = Uint8Array.from(R.map((i) => g.pos[i]!));
    const gg = clone(g);
    let regret = 0, uphill = 0, maxOff = 0, offGraph = 0, lastKnown = fewest, unknown = 0, wander = 0, atStart = 0;
    const memo = new Map<string, number>();
    /** d* of the board as it is now (gg), exactly, by a bounded search; -1 when past the bounds. */
    const distNow = () => {
      const key = gg.pos.join(",");
      if (memo.has(key)) return memo.get(key)!;
      let d = -1;
      for (const b of [fewest + 2, fewest + 5, fewest + 9]) {
        const r = solve(gg, red, target, { bound: b, cap: 3_000_000, quick: true });
        if (r.status === "ok") { d = r.fewest; break; }
        if (r.status === "cap") break;
      }
      memo.set(key, d);
      return d;
    };
    const trail: number[] = [];
    for (const [i, , to] of s0.moves) {
      if (i < 0) { offGraph++; unknown++; continue; }
      gg.pos[i] = to;
      const k = R.indexOf(i);
      let s = -1;
      if (k >= 0) { pos[k] = to; s = findState(G, pos); }
      let d = s >= 0 && G.fromStart[s]! + G.dist[s]! <= t.fewest + SLACK ? G.dist[s]! : distNow();
      trail.push(d);
      if (d < 0) { unknown++; continue; }
      if (d > lastKnown) uphill++;
      regret += 1 + d - lastKnown;
      if (d > fewest) wander++;
      if (gg.pos.every((p, i) => p === g.pos[i])) atStart++;
      maxOff = Math.max(maxOff, d - fewest);
      lastKnown = d;
    }
    row.userMoves = s0.moves.length; row.userSeconds = s0.seconds; row.userThink = s0.first;
    row.userRatio = s0.moves.length / fewest;
    row.userRegret = regret; row.userUphill = uphill; row.userMaxOff = maxOff; row.userWander = wander;
    row.userOffGraph = offGraph; row.userUnknown = unknown; row.userBackToStart = atStart;
    row.sessions = sessions.length;
    row.userTrail = trail.join(" ");
  }
  row.ms = Math.round(performance.now() - t0);
  return row;
}

const rows: Row[] = [];
for (const t of all) {
  const r = measure(t);
  rows.push(r);
  console.log(JSON.stringify(r));
}
mkdirSync("lab/out", { recursive: true });
writeFileSync(`lab/out/statespace${ROOM ? "-room" : ""}-s${SLACK}.json`, JSON.stringify(rows, null, 1));

// Rank against the verdicts.
const keys = Object.keys(rows[0]!).filter((k) => rows.every((r) => typeof r[k] === "number"));
const byLabel = new Map(rows.map((r) => [r.label as string, r]));
console.log("\nmeasure  rho(verdict)  pairs right/wrong/tied  rho(user seconds)  rho(user moves/fewest)");
const logged = rows.filter((r) => typeof r.userSeconds === "number");
for (const k of keys) {
  const v = (l: string) => byLabel.get(l)![k] as number;
  const rho = spearman(ORDER.map(v), ORDER.map((_, i) => ORDER.length - i));
  const ps = pairScore(PAIRS, v);
  const rs = spearman(logged.map((r) => r[k] as number), logged.map((r) => r.userSeconds as number));
  const rm = spearman(logged.map((r) => r[k] as number), logged.map((r) => r.userRatio as number));
  console.log(`${k.padEnd(20)} ${rho.toFixed(2).padStart(6)}  ${ps.right}/${ps.wrong}/${ps.tied}  ${rs.toFixed(2).padStart(6)}  ${rm.toFixed(2).padStart(6)}`);
}
