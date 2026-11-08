// Decisions, counted several ways, against the Records and against play (reports/goal-spec.md,
// Decisions). Why do goals with no ramp aim win short, and which way of counting decisions,
// with which weights, picks goals that need many moves and predicts what players find hard?
//   bun test/experiments/decisions-variants.ts show <case> [maker]     a case's record (or a maker's goal): board and trees
//   bun test/experiments/decisions-variants.ts pool <out.json> [only]  every goal the makers weigh on the no-aim cases, with terms per variant
//   bun test/experiments/decisions-variants.ts rank <pool.json>        the winners per variant and weights
//   bun test/experiments/decisions-variants.ts play <play.json...> [--out=rows.json]  reached goals in play: extra moves and time against each variant
// Run the slow ones capped (scripts/capped.sh). Play data is read, never copied into the repo.
import { Board } from "../../src/board";
import type { Point } from "../../src/camera";
import { contractGoal, playerCells, requestBoard, type Goal, type Request } from "../../src/contract";
import { boardCells, EDGE, MAX_DEPTH, MAX_NODES, type Cells } from "../../src/decisions";
import { measure } from "../../src/difficulty";
import { judge } from "../../src/judge";
import { randomLayout } from "../../src/layout";
import { audit } from "../../bench/auditor";
import type { Case } from "../../bench/cases";
import { makeCurrent } from "../../bench/current";
import { REFERENCE, referenceGoals } from "../../bench/reference";
import { parse } from "./play-analysis";

/** A way of counting decisions.
 * explore: "all" every way of every block met (today's), "first" depth first, stopping at the
 *   first way that works (a person stops there; what lies behind the other way is never met).
 * order (first only): which way a person tries first: "short" the shorter slide, "free" the one
 *   with fewer blocks in its sweep (a free way first), then the shorter slide; ties: up/left.
 * moved: only blocks the goal's solution moves count.
 * freeFork: a block with a free way still counts (two plausible ways), else only when both
 *   ways need something cleared.
 * stages: "sum" a stage before each red move (today's), "start" the start board only. */
export type Variant = { name: string; explore: "all" | "first"; order?: "short" | "free"; moved?: boolean; freeFork?: boolean; stages?: "sum" | "start" };

export const VARIANTS: Variant[] = [
  { name: "i all", explore: "all", freeFork: true },
  { name: "ii first/short", explore: "first", order: "short", freeFork: true },
  { name: "ii first/free", explore: "first", order: "free", freeFork: true },
  { name: "ii' first/free, no free fork", explore: "first", order: "free", freeFork: false },
  { name: "iii all, moved", explore: "all", moved: true, freeFork: true },
  { name: "iii' first/free, moved", explore: "first", order: "free", moved: true, freeFork: true },
  { name: "i all, start", explore: "all", freeFork: true, stages: "start" },
];

type Way = { dir: -1 | 1; slide: number; out: string | null; blockers: string[]; needs: Node[]; ok: boolean | null };
type Node = { id: string; ways: Way[]; decision: boolean; ok: boolean };
const key = (c: Point) => `${c.x},${c.y}`;

/** decisionTree (src/decisions.ts), counted as `v` says. `moved`: the solution's blocks. */
export function tree(cells: Cells, red: string, target: Point, v: Variant, moved?: Set<string>): { roots: Node[]; decisions: number; met: number } {
  const shape = (id: string) => {
    const b = cells.block(id);
    return { ...b, hz: b.w > b.h };
  };
  const r = shape(red), path: Point[] = [];
  const lo = r.hz ? Math.min(r.x, target.x) : Math.min(r.y, target.y);
  const hi = r.hz ? Math.max(r.x, target.x) + r.w : Math.max(r.y, target.y) + r.h;
  for (let q = lo; q < hi; q++) {
    const c = r.hz ? { x: q, y: r.y } : { x: r.x, y: q };
    if (cells.at(c.x, c.y) !== red) path.push(c);
  }
  let nodes = 0;
  const forks = new Set<string>(), met = new Set<string>();
  const blockersIn = (list: Point[], self: string) => [...new Set(list.map((c) => cells.at(c.x, c.y)).filter((o): o is string => !!o && o !== EDGE && o !== self))];
  const all = v.explore === "all";

  function clear(id: string, region: Set<string>, chain: Set<string>, depth: number): Node {
    const b = shape(id), node: Node = { id, ways: [], decision: false, ok: false };
    nodes++;
    met.add(id);
    const sweeps: Point[][] = [];
    for (const dir of [-1, 1] as const) {
      const sweep: Point[] = [];
      let out: string | null = null, s = 0;
      for (;;) {
        s++;
        const lead = b.hz ? { x: dir > 0 ? b.x + b.w - 1 + s : b.x - s, y: b.y } : { x: b.x, y: dir > 0 ? b.y + b.h - 1 + s : b.y - s };
        if (cells.at(lead.x, lead.y) === EDGE) {
          out = "edge or wall";
          break;
        }
        sweep.push(lead);
        let inRegion = false;
        for (let i = 0; i < b.w; i++) for (let j = 0; j < b.h; j++) if (region.has(key(b.hz ? { x: b.x + dir * s + i, y: b.y + j } : { x: b.x + i, y: b.y + dir * s + j }))) inRegion = true;
        if (!inRegion) break;
        if (s > 12) {
          out = "too far";
          break;
        }
      }
      const blockers = out ? [] : blockersIn(sweep, id), cycle = blockers.find((o) => chain.has(o));
      if (cycle) out = `cycle (${cycle})`;
      node.ways.push({ dir, slide: s, out, blockers, needs: [], ok: out ? false : null });
      sweeps.push(sweep);
    }
    const explore = (k: number) => {
      const way = node.ways[k]!;
      if (all && (depth >= MAX_DEPTH || nodes >= MAX_NODES)) way.out = "too deep";
      else if (!all && way.blockers.length && (depth >= MAX_DEPTH || nodes >= MAX_NODES)) way.out = "too deep";
      if (way.out) return (way.ok = false);
      const region = new Set(sweeps[k]!.map(key));
      for (const o of way.blockers) {
        const n = clear(o, region, new Set([...chain, id]), depth + 1);
        way.needs.push(n);
        if (!all && !n.ok) break; // this way fails: on to the other
      }
      return (way.ok = way.needs.length === way.blockers.length && way.needs.every((n) => n.ok));
    };
    const plausible = [0, 1].filter((k) => !node.ways[k]!.out);
    if (all) {
      plausible.forEach(explore);
      node.decision = node.ways.filter((w) => !w.out).length === 2;
    } else {
      const order = [...plausible].sort((a, c) => {
        const A = node.ways[a]!, C = node.ways[c]!;
        return (v.order === "free" ? A.blockers.length - C.blockers.length : 0) || A.slide - C.slide || a - c;
      });
      node.decision = plausible.length === 2;
      for (const k of order) if (explore(k)) break;
    }
    if (node.decision && !v.freeFork && node.ways.some((w) => !w.out && !w.blockers.length)) node.decision = false;
    if (node.decision && (!moved || moved.has(id))) forks.add(id);
    node.ok = node.ways.some((w) => w.ok);
    return node;
  }

  const roots: Node[] = [];
  for (const o of blockersIn(path, red)) {
    const n = clear(o, new Set(path.map(key)), new Set([red]), 1);
    roots.push(n);
  }
  return { roots, decisions: forks.size, met: met.size };
}

/** The decisions of `goal` on `board` counted as `v` says, stage by stage. */
export function stagesOf(board: Board, goal: Goal, v: Variant): number[] {
  const cells = boardCells(board), moved = v.moved ? new Set(goal.moves.map((m) => m.block)) : undefined;
  const stages = [tree(cells, goal.red, goal.target, v, moved).decisions];
  if (v.stages === "start") return stages;
  const mark = board.mark();
  for (const m of goal.moves) {
    board.move(m.block, m.to);
    if (m.block === goal.red && (m.to.x !== goal.target.x || m.to.y !== goal.target.y)) stages.push(tree(cells, goal.red, goal.target, v, moved).decisions);
  }
  board.undo(mark);
  return stages;
}

// ---------- show ----------

/** The cells round red's run as text: R red, + target (when empty), # wall, a letter per block. */
export function ascii(board: Board, goal: Goal, margin = 3): { text: string; letters: Map<string, string> } {
  const r = board.block(goal.red), t = goal.target;
  const x0 = Math.min(r.x, t.x) - margin, x1 = Math.max(r.x, t.x) + r.w + margin, y0 = Math.min(r.y, t.y) - margin, y1 = Math.max(r.y, t.y) + r.h + margin;
  const cells = boardCells(board), letters = new Map<string, string>(), ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQSTUVWXYZ0123456789";
  const rows: string[] = [];
  for (let y = y0; y < y1; y++) {
    let row = "";
    for (let x = x0; x < x1; x++) {
      const o = cells.at(x, y);
      const onTarget = x >= t.x && x < t.x + r.w && y >= t.y && y < t.y + r.h;
      if (o === EDGE) row += "#";
      else if (o === goal.red) row += "R";
      else if (o === null) row += onTarget ? "+" : ".";
      else {
        if (!letters.has(o)) letters.set(o, ABC[letters.size % ABC.length]!);
        row += letters.get(o)!;
      }
    }
    rows.push(row);
  }
  return { text: rows.join("\n"), letters };
}

export function treeText(t: { roots: Node[] }, name: (id: string) => string, isHz: (id: string) => boolean): string {
  const lines: string[] = [];
  const arrow = (id: string, dir: number) => (isHz(id) ? (dir > 0 ? "→" : "←") : dir > 0 ? "↓" : "↑");
  const walk = (n: Node, pad: string) => {
    lines.push(`${pad}${name(n.id)}${n.decision ? " ◆" : ""}${n.ok ? "" : " (stuck)"}`);
    for (const w of n.ways) {
      const what = w.out ? `✗ ${w.out}` : w.ok === null ? `not tried (needs ${w.blockers.map(name).join(", ") || "nothing"})` : w.blockers.length ? `needs ${w.blockers.map(name).join(", ")}${w.ok ? "" : " ✗"}` : "✓ free";
      lines.push(`${pad}  ${arrow(n.id, w.dir)}${w.slide} ${what}`);
      for (const c of w.needs) walk(c, pad + "    ");
    }
  };
  t.roots.forEach((n) => walk(n, ""));
  return lines.join("\n");
}

function showGoal(request: Request, goal: Goal, variants = VARIANTS) {
  const board = requestBoard(request);
  const { text, letters } = ascii(board, goal);
  const name = (id: string) => letters.get(id) ?? id;
  const terms = judge(request, goal, { board });
  console.log(text);
  console.log(`moves ${goal.moves.map((m) => `${m.block === goal.red ? "R" : name(m.block)}${m.to.x - m.from.x ? (m.to.x > m.from.x ? "→" : "←") + Math.abs(m.to.x - m.from.x) : (m.to.y > m.from.y ? "↓" : "↑") + Math.abs(m.to.y - m.from.y)}`).join(" ")}`);
  console.log(`terms: moves ${terms.moves} decisions ${terms.decisions} distance ${terms.distance} track ${terms.track} reach ${terms.reach} fitness ${terms.fitness.toFixed(2)}`);
  for (const v of variants) console.log(`  ${v.name}: ${stagesOf(board, goal, v).join("+")}`);
  const cells = boardCells(board), hz = (id: string) => board.block(id).w > board.block(id).h;
  for (const v of [VARIANTS[0]!, VARIANTS[2]!]) {
    console.log(`-- tree, ${v.name} (start board):`);
    console.log(treeText(tree(cells, goal.red, goal.target, v), name, hz));
  }
}

// ---------- pool and rank ----------

type Row = { maker: string; red: string; target: Point; moves: number; distance: number; track: number; reach: number; clashes: number; dec: number[] };
type PoolCase = { name: string; rampAim: number | null; rows: Row[] };

const casesFile = new URL("../../bench/cases-full.json", import.meta.url).pathname;

async function pool(outFile: string, only = "", withAim = false) {
  const cases: Case[] = (await Bun.file(casesFile).json()).filter((c: Case) => c.name.includes(only) && (withAim || c.request.rampAim === null));
  const out: PoolCase[] = [];
  for (const c of cases) {
    const t0 = performance.now(), board = requestBoard(c.request), rows: Row[] = [];
    const add = (maker: string, goal: Goal, fewest?: number) => {
      const t = judge(c.request, goal, { board, fewest });
      rows.push({ maker, red: goal.red, target: goal.target, moves: t.moves, distance: t.distance, track: t.track, reach: t.reach, clashes: t.clashes, dec: VARIANTS.map((v) => stagesOf(board, goal, v).reduce((a, b) => a + b, 0)) });
    };
    const seen = new Set<string>();
    for (const goal of referenceGoals(c.request, board, REFERENCE)) {
      const k = `${goal.red} ${goal.target.x},${goal.target.y}`;
      if (seen.has(k)) continue; // the deeper search found it too; its first (fewest) is kept
      seen.add(k);
      add("reference", goal);
    }
    for (const level of [0, 2]) {
      const goal = makeCurrent(c.request, level);
      if (goal) add(level ? "current2" : "current", goal, audit(c.request, goal).fewest);
    }
    out.push({ name: c.name, rampAim: c.request.rampAim, rows });
    console.log(`${c.name}: ${rows.length} goals, ${Math.round(performance.now() - t0)} ms`);
    await Bun.write(outFile, JSON.stringify(out));
  }
}

export type Weights = { variant: number; decision: number; distance: number };
const W = { track: 0.5, aim: 0.5, reach: 0.8, reachFree: 4, clash: 0.5 };
export function fitnessOf(r: Row, rampAim: number | null, w: Weights): number {
  const difficulty = r.moves + w.decision * r.dec[w.variant]!;
  const balance = (difficulty / Math.pow(Math.max(r.distance, 1), w.distance)) * Math.pow(W.track, r.track);
  return balance * Math.pow(W.aim, rampAim === null ? 0 : Math.abs(r.moves - rampAim)) * Math.pow(W.reach, Math.max(0, r.reach - W.reachFree)) * Math.pow(W.clash, r.clashes);
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;

async function rank(file: string) {
  const data: PoolCase[] = await Bun.file(file).json();
  const best = (c: PoolCase, w: Weights) => c.rows.reduce((a, b) => (fitnessOf(b, c.rampAim, w) > fitnessOf(a, c.rampAim, w) ? b : a));
  console.log(`${data.length} cases, ${data.reduce((a, c) => a + c.rows.length, 0)} goals`);
  // Each case's longest goal (most moves), as a ceiling for what a winner could need.
  console.log(`most moves of any goal per case: median ${median(data.map((c) => Math.max(...c.rows.map((r) => r.moves))))}`);
  const line = (label: string, w: Weights) => {
    const win = data.map((c) => best(c, w));
    const m = win.map((r) => r.moves), d = win.map((r) => r.distance), k = win.map((r) => r.dec[w.variant]!);
    const makers: Record<string, number> = {};
    for (const r of win) makers[r.maker] = (makers[r.maker] ?? 0) + 1;
    console.log(`${label.padEnd(44)} moves med ${median(m)} p25 ${q(m, 0.25)} min ${Math.min(...m)} | ≤4 moves ${m.filter((x) => x <= 4).length} | dist med ${median(d)} | dec med ${median(k)} | ${Object.entries(makers).map(([a, b]) => `${a} ${b}`).join(", ")}`);
  };
  for (const [vi, v] of VARIANTS.entries()) for (const dw of [2, 1, 0.5, 0]) for (const p of [0.6, 0.3, 0]) line(`${v.name} w${dw} p${p}`, { variant: vi, decision: dw, distance: p });
}

// ---------- play ----------

async function play(files: string[], out?: string) {
  type P = { file: string; n: number; tries: number; fewest: number; used: number; extra: number; active: number; distance: number; dec: number[]; undos: number };
  const rows: P[] = [];
  const UIS = [{}, { island: true }, { debug: true }, { island: true, debug: true }, { fullscreen: false }, { island: true, fullscreen: false }];
  let skipped = 0, unsolved = 0;
  for (const file of files) {
    const data = await Bun.file(file).json();
    const log = data.stored?.["unblock-me:log"];
    if (!log) continue;
    const goals = parse(log), events = log.filter((e: any) => e.e === "goal");
    for (const p of goals) {
      if (p.outcome !== "reached") continue;
      // The log has no UI shown: the first that puts red where the log says and replays the
      // player's moves (or at least puts red there) is taken.
      const moved = new Map((events[p.n].moved as [string, number, number][]).map(([id, x, y]) => [id, { x, y }] as [string, Point]));
      const boards = UIS.map((ui) => new Board(randomLayout(p.seed, { tries: p.tries, ...ui }), moved)).filter((b) => {
        const red = b.home(p.id) && b.block(p.id);
        return red && red.x === p.start.x && red.y === p.start.y;
      });
      const board = boards.find((b) => b.replays(p.moves)) ?? boards[0];
      if (!board) {
        skipped++;
        continue;
      }
      const d = measure(board, { id: p.id, target: p.target, solution: p.moves }, { limit: 100_000 });
      if (d.moves === null || !d.solution) {
        unsolved++;
        continue;
      }
      const goal = contractGoal({ id: p.id, target: p.target, solution: d.solution });
      rows.push({ file: file.split("/").pop()!, n: p.n, tries: p.tries, fewest: d.moves, used: p.used, extra: Math.max(0, p.used - d.moves), active: p.active / 1000, distance: p.distance, undos: p.undos, dec: VARIANTS.map((v) => stagesOf(board, goal, v).reduce((a, b) => a + b, 0)) });
    }
  }
  const players = new Set(rows.map((r) => r.file));
  console.log(`${rows.length} reached goals with an exact fewest (A* 100k), from ${players.size} files (skipped: ${skipped} not on today's layout, ${unsolved} not solved exactly); by file: ${[...players].map((f) => rows.filter((r) => r.file === f).length).join(" ")}`);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pearson = (a: number[], b: number[]) => {
    const ma = mean(a), mb = mean(b);
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) (s += (a[i]! - ma) * (b[i]! - mb)), (sa += (a[i]! - ma) ** 2), (sb += (b[i]! - mb) ** 2);
    return s / Math.sqrt(sa * sb);
  };
  const ranks = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
  // Least squares y = a + b·x1 + c·x2 (normal equations), with R².
  const fit2 = (y: number[], x1: number[], x2: number[]) => {
    const n = y.length, X = y.map((_, i) => [1, x1[i]!, x2[i]!]);
    const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => X.reduce((s, x) => s + x[r]! * x[c]!, 0))), B = [0, 1, 2].map((r) => X.reduce((s, x, i) => s + x[r]! * y[i]!, 0));
    // Gaussian elimination.
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const f = A[j]![i]! / A[i]![i]!;
      for (let k = i; k < 3; k++) A[j]![k]! -= f * A[i]![k]!;
      B[j]! -= f * B[i]!;
    }
    const c = [0, 0, 0];
    for (let i = 2; i >= 0; i--) c[i] = (B[i]! - [0, 1, 2].slice(i + 1).reduce((s, k) => s + A[i]![k]! * c[k]!, 0)) / A[i]![i]!;
    const my = mean(y), ss = y.reduce((s, v) => s + (v - my) ** 2, 0), res = y.reduce((s, v, i) => s + (v - X[i]!.reduce((t, x, k) => t + x * c[k]!, 0)) ** 2, 0);
    return { c, r2: 1 - res / ss, n };
  };
  const extra = rows.map((r) => r.extra), time = rows.map((r) => Math.log(1 + r.active)), fewest = rows.map((r) => r.fewest);
  console.log(`fewest: median ${median(fewest)}, max ${Math.max(...fewest)}; extra moves: median ${median(extra)}, mean ${mean(extra).toFixed(1)}; active time median ${median(rows.map((r) => r.active)).toFixed(0)} s`);
  console.log(`fewest alone: extra ρ ${spearman(fewest, extra).toFixed(2)} r ${pearson(fewest, extra).toFixed(2)}; log time ρ ${spearman(fewest, time).toFixed(2)} r ${pearson(fewest, time).toFixed(2)}`);
  const dist = rows.map((r) => r.distance);
  console.log(`distance alone: extra ρ ${spearman(dist, extra).toFixed(2)}; log time ρ ${spearman(dist, time).toFixed(2)}`);
  for (const [vi, v] of VARIANTS.entries()) {
    const k = rows.map((r) => r.dec[vi]!);
    const e = fit2(extra, fewest, k), t = fit2(time, fewest, k);
    console.log(`${v.name.padEnd(32)} dec med ${median(k)} | alone: extra ρ ${spearman(k, extra).toFixed(2)}, log time ρ ${spearman(k, time).toFixed(2)} | with fewest: extra = ${e.c.map((x) => x.toFixed(2)).join(" + ")}·(1, M, D) R² ${e.r2.toFixed(2)}; log time R² ${t.r2.toFixed(2)} (D coef ${t.c[2]!.toFixed(3)}, M coef ${t.c[1]!.toFixed(3)}) | M + 2D: extra ρ ${spearman(fewest.map((m, i) => m + 2 * k[i]!), extra).toFixed(2)}, M + 1D ρ ${spearman(fewest.map((m, i) => m + k[i]!), extra).toFixed(2)}`);
  }
  const mt = fit2(time, fewest, dist);
  console.log(`log time ~ fewest + distance: R² ${mt.r2.toFixed(2)}, coefs ${mt.c.map((x) => x.toFixed(3)).join(", ")}`);
  if (out) await Bun.write(out, JSON.stringify(rows));
}

if (import.meta.main) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "show") {
    const cases: Case[] = await Bun.file(casesFile).json();
    const c = cases.find((x) => x.name === args[0])!;
    let goal: Goal;
    if (args[1]) {
      const results = (await Bun.file(new URL(`../../bench/results/${args[1]}-full.json`, import.meta.url).pathname).json()).results;
      goal = results.find((r: any) => r.name === c.name).goal;
    } else goal = (await Bun.file(new URL("../../bench/records.json", import.meta.url).pathname).json())[c.name].goal;
    showGoal(c.request, goal);
    console.log(`player at ${JSON.stringify(playerCells(c.request, requestBoard(c.request)))}`);
  } else if (cmd === "pool") await pool(args[0]!, args[1] ?? "", args[2] === "aim");
  else if (cmd === "rank") await rank(args[0]!);
  else if (cmd === "play") await play(args.filter((a) => !a.startsWith("--out=")), args.find((a) => a.startsWith("--out="))?.slice(6));
  else console.log("show | pool | rank | play");
}
