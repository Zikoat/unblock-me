// Real play against the difficulty measure: every goal in a play-data file, re-measured with
// the current code, next to how it was played (reports/play-analysis.html). Run capped, one step at
// a time (copy the play data somewhere first: the game keeps uploading over it):
//   scripts/capped.sh 1500 1500 bun test/experiments/play-analysis.ts regen <play.json> <regen.json>
//   scripts/capped.sh 2500 3000 bun test/experiments/play-analysis.ts measure <play.json> <regen.json> <out.json> [limit 1M] [good limit 20k] [goals]
//   bun test/experiments/play-analysis.ts report <out.json>
//
// regen: makes each goal again with the request the game sent and the generators it used that
// day; the first that gives the same red block and target supplies the game's own proof and
// the difficulty the game showed.
// measure: rebuilds each goal's board (randomLayout(seed, {tries}) plus the logged snapshot)
// and runs A* (a copy of src/difficulty.ts shortest, with extra counts) in two windows:
//   run    - the game's window (its proof, made again), or the red block's run alone
//   player - with the blocks the player moved as the "proof" (seeds and extent)
// When A* stops at the limit, a known solution (the game's proof and the player's moves,
// shortened by local search) bounds the fewest moves from above. Along a shortest path (or
// that known solution) it counts per board: slides, movable blocks, movable blocks in the red
// block's chain (blockers in its way and the blocks in their lanes), and, when exact, the
// "good" slides and blocks: those after which the rest still takes the fewest moves.
import { Board } from "../../src/board";
import type { Point } from "../../src/camera";
import { MARGIN, LEVELS, measure, starsEarned, starsFor } from "../../src/difficulty";
import { randomLayout } from "../../src/layout";
import type { Move } from "../../src/rules";
import { Pool, runWindow, Window } from "../../src/window";
import { makeGoalHard, tradeoff } from "../../src/goal-search";
import { makeGoalFast } from "../../src/goal-fast";

type Ev = { t: number; e: string; [k: string]: any };

export type Played = {
  n: number; t: number; id: string; seed: number; tries: number; target: Point; start: Point;
  proofLength: number; distance: number; phase: string;
  moves: Move[]; used: number; usedLog: number; usedLogged: number | null; raw: number; undos: number; blocksTouched: number;
  outcome: "reached" | "abandoned" | "open"; shownToEnd: number; active: number; think: number;
  replayOk: boolean;
};

export type Search = {
  moves: number | null; atLeast: number; /** A solution's length: exact, or weighted A*'s. */ upper: number | null; expanded: number; pooled: number; sliders: number;
  bSlides: number; bBlocks: number;
  path?: { slides: number; blocks: number; chainBlocks: number; chainSlides: number; goodSlides: number | null; goodBlocks: number | null }[];
  solutionBlocks?: number; ms: number;
};

const STEP = 60_000; // gaps longer than this (a minute without a move) count as a minute

// The game's code, by commit time (git log): before 12:45:26 goals came from the push search
// (makeGoalFast, distance first); after it, the ranked search (makeGoalHard, difficulty
// first); from 13:38:35 ranked by difficulty / distance^0.67.
function phaseOf(t: number): string {
  const d = new Date(t).toISOString().slice(11, 19);
  return d < "12:45:26" ? "push" : d < "13:38:35" ? "hard" : "hard-a";
}

export function parse(log: Ev[]): Played[] {
  const out: Played[] = [];
  let cur: (Played & { events: number[]; history: Move[] }) | null = null;
  const close = (outcome: Played["outcome"], t: number, used: number | null) => {
    if (!cur) return;
    const h = cur.history;
    let merged = 0;
    for (let i = 0; i < h.length; i++) if (i === 0 || h[i]!.id !== h[i - 1]!.id) merged++;
    const times = [cur.t, ...cur.events, t];
    let active = 0;
    for (let i = 1; i < times.length; i++) active += Math.min(STEP, times[i]! - times[i - 1]!);
    Object.assign(cur, { outcome, moves: h, used: used ?? merged, usedLog: merged, usedLogged: used, raw: h.length, blocksTouched: new Set(h.map((m) => m.id)).size, shownToEnd: t - cur.t, active, think: cur.events.length ? Math.min(STEP, cur.events[0]! - cur.t) : NaN });
    const { events: _e, history: _h, snapshot: _s, ...p } = cur as any;
    out.push(p);
    cur = null;
  };
  for (const ev of log) {
    if (ev.e === "goal") {
      close("abandoned", ev.t, null);
      const start = ev.start as Point;
      cur = {
        n: out.length, t: ev.t, id: ev.id, seed: ev.seed, tries: ev.tries, target: ev.target, start,
        proofLength: ev.solution, distance: Math.abs(ev.target.x - start.x) + Math.abs(ev.target.y - start.y), phase: phaseOf(ev.t),
        moves: [], used: 0, usedLog: 0, usedLogged: null, raw: 0, undos: 0, blocksTouched: 0, outcome: "open", shownToEnd: 0, active: 0, think: 0, replayOk: false,
        events: [], history: [], snapshot: ev.moved,
      } as any;
    } else if (!cur) continue;
    else if (ev.e === "move") { cur.history.push({ id: ev.id, from: ev.from, to: ev.to }); cur.events.push(ev.t); }
    else if (ev.e === "undo") { cur.history.pop(); cur.undos++; cur.events.push(ev.t); }
    else if (ev.e === "reached") { if (ev.id === cur.id) close("reached", ev.t, ev.used); }
    else if (ev.e === "reset" || (ev.e === "density" && ev.goal)) close("abandoned", ev.t, null);
  }
  if (cur) close("open", log[log.length - 1]!.t, null);
  return out;
}

/** A* as in src/difficulty.ts shortest, from `start`, giving up past f = maxF (null: not within). */
function astar(win: Window, start: Uint8Array, r: number, want: number, limit: number, maxF = Infinity, keep = false, w = 1) {
  const pool = new Pool(win.sliders.length);
  const buckets: number[][] = [];
  const best: number[] = [];
  let refinedAt = new Uint8Array(1024);
  let f = 0;
  const push = (i: number, g: number, h: number) => {
    const at = Math.max(g + Math.ceil(w * h), f);
    if (at === Infinity || at > maxF) return;
    (buckets[at] ??= []).push(i, g);
  };
  const root = pool.add(start, 0, -1, 0);
  best[root] = 0;
  win.fill(start, 0);
  push(root, 0, win.lowerCheap(start, 0, r, want));
  let expanded = 0, choices = 0, blockChoices = 0;
  const child = new Uint8Array(win.sliders.length);
  const res = (g: number | null, atLeast: number, i: number | null) => ({ g, atLeast, expanded, pooled: pool.count, choices, blockChoices, pool: keep ? pool : null, end: i });
  for (f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    while (bucket?.length) {
      const g = bucket.pop()!;
      const i = bucket.pop()!;
      if (best[i] !== g) continue;
      const at = pool.offset(i);
      if (pool.data[at + r] === want) return res(g, g, i);
      if (pool.count > limit) return res(null, f, null);
      win.fill(pool.data, at);
      if (i >= refinedAt.length) {
        const bigger = new Uint8Array(Math.max(1024, refinedAt.length * 2, i + 1));
        bigger.set(refinedAt);
        refinedAt = bigger;
      }
      if (!refinedAt[i]) {
        refinedAt[i] = 1;
        const full = g + Math.ceil(w * win.lower(pool.data, at, r, want));
        if (full > f) {
          if (full < Infinity && full <= maxF) (buckets[full] ??= []).push(i, g);
          continue;
        }
      }
      expanded++;
      const slides: number[] = [];
      const movers = new Set<number>();
      choices += win.moves(pool.data, at, (k, to) => { slides.push(k, to); movers.add(k); });
      blockChoices += movers.size;
      for (let m = 0; m < slides.length; m += 2) {
        const k = slides[m]!, to = slides[m + 1]!;
        child.set(pool.data.subarray(at, at + pool.n));
        child[k] = to;
        let j = pool.find(child, 0);
        if (j === undefined) j = pool.add(child, 0, i, g + 1);
        else if (best[j]! <= g + 1) continue;
        else pool.parent[j] = i;
        best[j] = g + 1;
        const from = pool.data[at + k]!;
        win.patch(k, from, to);
        push(j, g + 1, win.lowerCheap(child, 0, r, want));
        win.patch(k, to, from);
        if (j < refinedAt.length) refinedAt[j] = 0;
      }
    }
  }
  return res(null, f, null);
}

/** The window measure() would use, with `proof` as the goal's solution. */
function windowFor(board: Board, id: string, target: Point, proof: Move[]): { win: Window; r: number; want: number } {
  const red = board.block(id);
  const horizontal = red.w > red.h;
  const rect = runWindow(red, { from: horizontal ? red.x : red.y, to: horizontal ? target.x : target.y }, MARGIN, MARGIN);
  let x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.width, y1 = rect.y + rect.height;
  for (const m of proof) {
    const b = board.home(m.id)!;
    for (const p of [m.from, m.to]) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + b.w); y1 = Math.max(y1, p.y + b.h);
    }
  }
  const win = new Window(board, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }).closure(board, [id, ...proof.map((m) => m.id)], LEVELS);
  return { win, r: win.index(id), want: (horizontal ? target.x : target.y) - (horizontal ? win.x0 : win.y0) };
}

/** Blocks in the red block's chain on the board on the grid: the red block, those in the
 * cells it still has to cross, and the blocks in their lanes. */
function chain(win: Window, state: Uint8Array, r: number, want: number): Set<number> {
  const red = win.sliders[r]!;
  const pos = state[r]!;
  const set = new Set<number>([r]);
  const blockers = new Set<number>();
  for (let p = Math.min(pos, want); p < Math.max(pos, want) + red.size; p++) {
    const o = win.grid[win.cell(red, p, 0)]!;
    if (o && o !== 0xffff && o - 1 !== r) blockers.add(o - 1);
  }
  for (const b of blockers) {
    set.add(b);
    const s = win.sliders[b]!;
    for (let p = 0; p < win.length(s); p++) {
      const o = win.grid[win.cell(s, p, 0)]!;
      if (o && o !== 0xffff) set.add(o - 1);
    }
  }
  return set;
}

type Step = { id: string; to: Point };

/** Play steps from the board as it is; the moves, or null when one is illegal. Leaves the board as it was. */
function play(board: Board, steps: Step[], id: string, target: Point): Move[] | null {
  const mark = board.mark();
  const moves: Move[] = [];
  let ok = true;
  for (const s of steps) {
    const b = board.block(s.id);
    const m = { id: s.id, from: { x: b.x, y: b.y }, to: s.to };
    if (!board.legal(m)) { ok = false; break; }
    board.move(s.id, s.to);
    moves.push(m);
  }
  const r = board.block(id);
  ok &&= r.x === target.x && r.y === target.y;
  board.undo(mark);
  return ok ? moves : null;
}

/** Consecutive slides of one block as one. */
const merged = (steps: Step[]): Step[] => steps.filter((s, i) => i === steps.length - 1 || steps[i + 1]!.id !== s.id);

/** A shorter solution from a known one, by local search: drop a move, or move a block's later
 * slide up next to its earlier one (one slide instead of two), while it still replays. */
export function shorten(board: Board, moves: Move[], id: string, target: Point): Move[] | null {
  let best = merged(moves.map((m) => ({ id: m.id, to: m.to })));
  if (!play(board, best, id, target)) return null;
  for (let improved = true; improved;) {
    improved = false;
    const tries: Step[][] = [];
    for (let i = 0; i < best.length; i++) tries.push(best.filter((_, k) => k !== i));
    for (let i = 0; i < best.length; i++) for (let j = i + 1; j < best.length; j++) {
      if (best[j]!.id !== best[i]!.id) continue;
      tries.push([...best.slice(0, i), best[j]!, ...best.slice(i + 1, j), ...best.slice(j + 1)]);
      tries.push([...best.slice(0, i), ...best.slice(i + 1, j), best[j]!, ...best.slice(j + 1)]);
    }
    for (const t of tries) {
      const m = merged(t);
      if (m.length < best.length && play(board, m, id, target)) { best = m; improved = true; break; }
    }
  }
  return play(board, best, id, target);
}

function search(board: Board, p: Played, proof: Move[], limit: number, goodLimit: number, known: Move[] | null): Search {
  const t0 = performance.now();
  let { win, r, want } = windowFor(board, p.id, p.target, proof);
  if (r < 0) return { moves: null, atLeast: 0, upper: null, expanded: 0, pooled: 0, sliders: win.sliders.length, bSlides: 0, bBlocks: 0, ms: 0 };
  let a = astar(win, win.start, r, want, limit, Infinity, true);
  const exact = a;
  // Not solved within the limit: the path stats go along the shortest known solution (in its
  // own window), an upper bound.
  let knownStates: Uint8Array[] | null = null;
  if (a.g === null && known) {
    ({ win, r, want } = windowFor(board, p.id, p.target, known));
    const st = win.start.slice();
    knownStates = [st.slice()];
    for (const m of known) {
      const k = win.index(m.id);
      if (k < 0) { knownStates = null; break; }
      st[k] = win.sliders[k]!.horizontal ? m.to.x - win.x0 : m.to.y - win.y0;
      knownStates.push(st.slice());
    }
  }
  const out: Search = {
    moves: exact.g, atLeast: exact.atLeast, upper: exact.g ?? (knownStates ? known!.length : null), expanded: a.expanded, pooled: a.pooled, sliders: win.sliders.length,
    bSlides: a.expanded ? a.choices / a.expanded : 1, bBlocks: a.expanded ? a.blockChoices / a.expanded : 1, ms: 0,
  };
  if ((a.g !== null && a.pool) || knownStates) {
    const isExact = exact.g !== null;
    const states: Uint8Array[] = [];
    if (isExact) {
      const pool = a.pool!;
      for (let i: number = a.end!; i >= 0; i = pool.parent[i]!) states.unshift(pool.data.slice(pool.offset(i), pool.offset(i) + pool.n));
    } else states.push(...knownStates!);
    const M = states.length - 1;
    const movedBlocks = new Set<number>();
    out.path = [];
    for (let g = 0; g < M; g++) {
      const s = states[g]!;
      const next = states[g + 1]!;
      for (let k = 0; k < s.length; k++) if (s[k] !== next[k]) movedBlocks.add(k);
      win.fill(s, 0);
      const slides: [number, number][] = [];
      win.moves(s, 0, (k, to) => slides.push([k, to]));
      const ch = chain(win, s, r, want);
      const movers = new Set(slides.map(([k]) => k));
      // Good: the rest still takes M - g - 1 moves after it.
      let goodSlides: number | null = 0;
      const goodBlocks = new Set<number>();
      for (const [k, to] of goodLimit && isExact ? slides : []) {
        const c = s.slice();
        c[k] = to;
        const left = M - g - 1;
        const b = left === 0 ? (c[r] === want ? { g: 0 } : { g: null, atLeast: 1 }) : astar(win, c, r, want, goodLimit, left);
        if (b.g === null && "pooled" in b && (b as any).pooled > goodLimit) { goodSlides = null; break; }
        if (b.g === left) { goodSlides!++; goodBlocks.add(k); }
      }
      out.path.push({
        slides: slides.length, blocks: movers.size,
        chainBlocks: [...movers].filter((k) => ch.has(k)).length, chainSlides: slides.filter(([k]) => ch.has(k)).length,
        goodSlides: goodLimit && isExact ? goodSlides : null, goodBlocks: !goodLimit || !isExact || goodSlides === null ? null : goodBlocks.size,
      });
    }
    out.solutionBlocks = movedBlocks.size;
  }
  out.ms = performance.now() - t0;
  return out;
}

async function measureAll(file: string, regenFile: string, outFile: string, limit: number, goodLimit: number, only?: Set<number>) {
  const data = await Bun.file(file).json();
  const regenerated: Record<number, any> = await Bun.file(regenFile).json();
  const log: Ev[] = data.stored["unblock-me:log"];
  const goals = parse(log);
  const snapshots = log.filter((e) => e.e === "goal").map((e) => e.moved as [string, number, number][]);
  const out: any[] = [];
  for (const p of goals) {
    if (only && !only.has(p.n)) continue;
    const layout = randomLayout(p.seed, { tries: p.tries });
    const moved = new Map(snapshots[p.n]!.map(([id, x, y]) => [id, { x, y }] as [string, Point]));
    const board = new Board(layout, moved);
    const red = board.home(p.id) && board.block(p.id);
    const startOk = !!red && red.x === p.start.x && red.y === p.start.y;
    p.replayOk = startOk && board.replays(p.moves);
    if (!startOk) {
      console.log(`#${p.n} ${p.phase} t${p.tries}: the red block is not where the log says on today's layout; skipped`);
      out.push({ ...p, moves: undefined, startOk, endOk: false, run: null, player: null, logged: null });
      continue;
    }
    // The log can miss moves (the first move after each page load is never logged: main.ts
    // logMoves starts counting at the history's length on the first save), so the player's
    // "proof" for the window is the logged moves plus every block whose position differs
    // between this goal's snapshot and the next one's. Only the window uses it.
    const next = snapshots[p.n + 1];
    const proof: Move[] = [...p.moves];
    let endOk = false;
    if (p.outcome === "reached" && next && goals[p.n + 1]?.seed === p.seed && goals[p.n + 1]?.tries === p.tries) {
      const after = new Map(next.map(([id, x, y]) => [id, { x, y }] as [string, Point]));
      const at = (m: Map<string, Point>, id: string) => m.get(id) ?? board.home(id)!;
      for (const id of new Set([...moved.keys(), ...after.keys()])) {
        if (!board.home(id)) continue;
        const a = at(moved, id), b = at(after, id);
        if (a.x !== b.x || a.y !== b.y) proof.push({ id, from: a, to: b });
      }
      const r = at(after, p.id);
      endOk = r.x === p.target.x && r.y === p.target.y;
    }
    // The game's window: its own proof, made again (regen); else the red block's run alone.
    const game = regenerated[p.n];
    // An upper bound on the fewest moves: the game's proof and the player's moves (when the log
    // has them all), shortened.
    const fromProof = game ? shorten(board, game.solution, p.id, p.target) : null;
    const fromPlayer = p.outcome === "reached" && p.replayOk ? shorten(board, p.moves, p.id, p.target) : null;
    const known = [fromProof, fromPlayer].filter((x): x is Move[] => !!x).sort((x, y) => x.length - y.length)[0] ?? null;
    const run = search(board, p, game?.solution ?? [], limit, goodLimit, known);
    const player = p.outcome === "reached" ? search(board, p, proof, limit, goodLimit, known) : null;
    const { moves: _m, ...rest } = p;
    const stored = [...(data.stored["unblock-me:v6:goal"]?.done ?? []), data.stored["unblock-me:v6:goal"]?.goal].find((g: any) => g?.difficulty && g.id === p.id && g.target.x === p.target.x && g.target.y === p.target.y);
    const logged = stored ? `${stored.difficulty.score.toFixed(1)} (M ${stored.difficulty.moves ?? "≥" + stored.difficulty.atLeast}, b ${stored.difficulty.branching.toFixed(1)})` : null;
    out.push({ ...rest, shortProof: fromProof?.length ?? null, shortPlayer: fromPlayer?.length ?? null, generator: game?.config ?? null, gameDifficulty: game?.difficulty ?? null, startOk, endOk, run, player, logged });
    console.log(`#${p.n} ${p.phase} t${p.tries} ${p.outcome} used ${p.used}/${p.usedLogged} dist ${p.distance} proof ${p.proofLength} | run M ${run.moves ?? `${run.atLeast}..${run.upper ?? "?"}`} b ${run.bSlides.toFixed(1)}/${run.bBlocks.toFixed(1)} exp ${run.expanded} ${run.ms.toFixed(0)}ms | short proof ${fromProof?.length ?? "-"} player ${fromPlayer?.length ?? "-"} | player M ${player ? player.moves ?? `${player.atLeast}..${player.upper ?? "?"}` : "-"} ${player ? player.ms.toFixed(0) + "ms" : ""} ${p.replayOk ? "" : "log incomplete"}${p.outcome === "reached" && !endOk ? " END?" : ""}`);
    await Bun.write(outFile, JSON.stringify(out));
  }
}

/** The game's own proof for each goal, by making the goal again: the request the game sent
 * (near: the previous target, or the view's centre (0,0) after a reload; exclude and avoid:
 * the goals reached since the last reset), with each generator the game used that day; the
 * first that makes the same red block and target wins. */
async function regen(file: string, outFile: string, only?: Set<number>) {
  const data = await Bun.file(file).json();
  const log: Ev[] = data.stored["unblock-me:log"];
  const goals = parse(log);
  const events = log.filter((e) => e.e === "goal");
  const out: Record<number, any> = {};
  let done: Played[] = [];
  for (const p of goals) {
    const prev = goals[p.n - 1];
    const fresh = !prev || prev.seed !== p.seed || prev.tries !== p.tries || prev.outcome !== "reached";
    if (fresh) done = [];
    if (only && !only.has(p.n)) { if (p.outcome === "reached") done.push(p); continue; }
    const layout = randomLayout(p.seed, { tries: p.tries });
    const moved = new Map((events[p.n]!.moved as [string, number, number][]).map(([id, x, y]) => [id, { x, y }] as [string, Point]));
    const near = fresh ? { x: 0, y: 0 } : prev!.target;
    const rect = (g: Played) => { const b = layout.byId(g.id); return b ? [{ x: g.target.x, y: g.target.y, width: b.w, height: b.h }] : []; };
    const opts = { effort: 12, moved, exclude: new Set(done.map((g) => g.id)), avoid: done.flatMap(rect) };
    const configs: [string, () => any][] = [];
    for (const alpha of p.phase === "hard-a" ? [0.67, 0] : [0, 0.67]) for (const level of fresh ? [0, 1, 2] : [2, 1, 0]) configs.push([`hard${level} a${alpha}`, () => { tradeoff.alpha = alpha; return makeGoalHard(layout, near, opts, level); }]);
    configs.push(["fast", () => makeGoalFast(layout, near, { ...opts, perCell: 6 }, { prune: true, lookahead: true, goalBudget: 50_000 })]);
    if (p.phase === "push") configs.unshift(configs.pop()!);
    let hit: any = null;
    const tried: string[] = [];
    for (const [name, make] of configs) {
      const t = performance.now();
      let g: any = null;
      try { g = make(); } catch (e) { tried.push(`${name}: ${e}`); continue; }
      tried.push(`${name} ${g ? `${g.id}@${g.target.x},${g.target.y}` : "none"} ${(performance.now() - t).toFixed(0)}ms`);
      if (g && g.id === p.id && g.target.x === p.target.x && g.target.y === p.target.y) {
        // The push search's goals were measured by the game afterwards (measure(), 50k boards).
        hit = { config: name, solution: g.solution, difficulty: g.difficulty ?? measure(new Board(layout, moved), g) };
        break;
      }
    }
    tradeoff.alpha = 0.67;
    out[p.n] = hit;
    console.log(`#${p.n} ${p.phase} ${p.id}@${p.target.x},${p.target.y} proof ${p.proofLength}: ${hit ? `${hit.config}, proof ${hit.solution.length}${hit.difficulty ? `, M ${hit.difficulty.moves ?? ">=" + hit.difficulty.atLeast} b ${hit.difficulty.branching.toFixed(1)} score ${hit.difficulty.score.toFixed(1)}` : ""}` : "no match"} | ${tried.join("; ")}`);
    await Bun.write(outFile, JSON.stringify(out));
    if (p.outcome === "reached") done.push(p);
  }
}

/** Fill in the game's measure for regenerated push-search goals (regen does it too now). */
async function shown(file: string, regenFile: string, measuredFile: string) {
  const data = await Bun.file(file).json();
  const events = (data.stored["unblock-me:log"] as Ev[]).filter((e) => e.e === "goal");
  const regenerated: Record<number, any> = await Bun.file(regenFile).json();
  const rows: any[] = await Bun.file(measuredFile).json();
  for (const [n, hit] of Object.entries(regenerated)) {
    if (!hit || hit.difficulty) continue;
    const e = events[Number(n)]!;
    const board = new Board(randomLayout(e.seed, { tries: e.tries }), new Map((e.moved as [string, number, number][]).map(([id, x, y]) => [id, { x, y }] as [string, Point])));
    hit.difficulty = measure(board, { id: e.id, target: e.target, solution: hit.solution });
    const { solution: _s, ...d } = hit.difficulty;
    const row = rows.find((r) => r.n === Number(n));
    if (row) row.gameDifficulty = d;
    console.log(`#${n} M ${d.moves ?? ">=" + d.atLeast} b ${d.branching.toFixed(1)} score ${d.score.toFixed(1)}`);
  }
  await Bun.write(regenFile, JSON.stringify(regenerated));
  await Bun.write(measuredFile, JSON.stringify(rows));
}

// ---------- report ----------

const fmt = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "-" : x.toFixed(d));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += (a[i]! - ma) * (b[i]! - mb); sa += (a[i]! - ma) ** 2; sb += (b[i]! - mb) ** 2; }
  return s / Math.sqrt(sa * sb);
}
const spearman = (a: number[], b: number[]) => pearson(ranks(a), ranks(b));
/** Spearman with a bootstrap 90% interval (deterministic). */
function spearmanCI(a: number[], b: number[]): [number, number, number] {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const rs: number[] = [];
  for (let k = 0; k < 2000; k++) {
    const ix = a.map(() => Math.floor(rnd() * a.length));
    const v = spearman(ix.map((i) => a[i]!), ix.map((i) => b[i]!));
    if (!Number.isNaN(v)) rs.push(v);
  }
  rs.sort((x, y) => x - y);
  return [spearman(a, b), rs[Math.floor(rs.length * 0.05)]!, rs[Math.floor(rs.length * 0.95)]!];
}

const GEN = (g: any) => (g.generator === "fast" ? "push" : g.generator ? (g.generator.endsWith("a0") ? "hard α0" : "hard α.67") : "?");

async function report(file: string) {
  const rows: any[] = (await Bun.file(file).json()).filter((g: any) => g.run);
  for (const g of rows) {
    // Fewest moves within the game's window (its own proof, made again): exact, or between
    // what A* proved (1M boards) and the shortest solution known (the game's proof and the
    // player's moves, shortened; the player's count).
    const ups = [g.run.upper, g.player?.upper, g.outcome === "reached" ? g.used : null, g.player?.moves].filter((x: any) => typeof x === "number") as number[];
    g.U = Math.min(...ups);
    g.L = g.run.moves ?? g.run.atLeast;
    if (g.L > g.U) g.L = g.U; // the player's window can be shorter than the game's
    g.exact = g.L === g.U;
    g.Mmid = (g.L + g.U) / 2;
    const s: Search = g.run.path ? g.run : g.player?.path ? g.player : g.run;
    g.s = s;
    // What the game showed (its own measure, 50k boards), and the same with 1M boards.
    const gd = g.gameDifficulty;
    g.gameM = gd ? gd.moves ?? gd.atLeast : null;
    g.gameScore = gd ? gd.score : null;
    g.gameB = gd ? gd.branching : null;
    g.worth = gd ? starsFor(gd.score, g.tries) : starsFor(g.L * Math.log2(Math.max(1, g.run.bSlides)), g.tries);
    g.earned = g.outcome === "reached" ? starsEarned(g.worth, g.gameM ?? g.L, g.used) : null;
    g.score1m = (g.run.moves ?? g.run.atLeast) * Math.log2(Math.max(1, g.run.bSlides));
    g.excessLo = g.outcome === "reached" ? g.used - g.U : null;
    g.excessHi = g.outcome === "reached" ? g.used - g.L : null;
    const path = s.path ?? [];
    const pm = (f: (x: any) => number) => (path.length ? mean(path.map(f)) : NaN);
    g.pathSlides = pm((x) => x.slides);
    g.pathBlocks = pm((x) => x.blocks);
    g.chainBlocks = pm((x) => x.chainBlocks);
    g.goodOk = path.length > 0 && path.every((x: any) => x.goodSlides !== null);
    g.trapSlides = g.goodOk ? path.reduce((a: number, x: any) => a + Math.log2(x.slides / Math.max(1, x.goodSlides)), 0) : NaN;
    g.trapBlocks = g.goodOk ? path.reduce((a: number, x: any) => a + Math.log2(x.blocks / Math.max(1, x.goodBlocks)), 0) : NaN;
    g.goodSlidesMean = g.goodOk ? pm((x) => x.goodSlides) : NaN;
    g.goodBlocksMean = g.goodOk ? pm((x) => x.goodBlocks) : NaN;
    g.scoreBlocks = g.Mmid * Math.log2(Math.max(1, s.bBlocks));
    g.scorePathBlocks = g.Mmid * Math.log2(Math.max(1, g.pathBlocks));
    g.scoreChain = g.Mmid * Math.log2(Math.max(1, g.chainBlocks));
    g.scoreMid = g.Mmid * Math.log2(Math.max(1, g.run.bSlides));
  }
  const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);
  const M = (g: any) => (g.exact ? `${g.U}` : `${g.L}–${g.U}`);
  console.log("## Per goal\n");
  console.log("| # | time | generator | tries | outcome | dist | proof | used | fewest M | game M | game b | game score | worth | earned | b blocks | path slides | path blocks | chain blocks | good blocks | trap blocks | active s | think s |");
  console.log("|" + "---|".repeat(22));
  for (const g of rows) {
    console.log(`| ${g.n} | ${hhmm(g.t)} | ${GEN(g)} | ${g.tries} | ${g.outcome} | ${g.distance} | ${g.proofLength} | ${g.outcome === "reached" ? g.used : "-"} | ${M(g)} | ${g.gameM === null ? "-" : (g.gameDifficulty.moves === null ? "≥" : "") + g.gameM} | ${fmt(g.gameB)} | ${fmt(g.gameScore)} | ${g.worth} | ${g.earned ?? "-"} | ${fmt(g.s.bBlocks)} | ${fmt(g.pathSlides)} | ${fmt(g.pathBlocks)} | ${fmt(g.chainBlocks)} | ${fmt(g.goodBlocksMean)} | ${fmt(g.trapBlocks)} | ${fmt(g.active / 1000, 0)} | ${fmt(g.think / 1000, 0)} |`);
  }
  const reached = rows.filter((g) => g.outcome === "reached");
  console.log(`\nLog incomplete (a move missing): ${rows.filter((g) => !g.replayOk && g.outcome === "reached").map((g) => g.n).join(", ")}; logged used vs log's moves: ${reached.filter((g) => g.usedLogged !== g.usedLog).map((g) => `#${g.n} ${g.usedLog}/${g.usedLogged}`).join(", ") || "none"}`);
  console.log(`Abandoned: ${rows.filter((g) => g.outcome === "abandoned").map((g) => `#${g.n} (${GEN(g)}, M ${M(g)}, ${fmt(g.active / 1000, 0)} s active, ${g.usedLog} moves)`).join(", ")}`);

  // Stars.
  console.log("\n## Stars (as the game showed them: its own measure)\n");
  const groups: [string, any[]][] = [["all reached", reached], ...["push", "hard α0", "hard α.67"].map((k) => [`${k}`, reached.filter((g) => GEN(g) === k)] as [string, any[]])];
  console.log("| goals | n | worth mean | earned mean | worth 0..10 | earned 0..10 | lost to excess | never offered |\n|---|---|---|---|---|---|---|---|");
  for (const [name, set] of groups) {
    if (!set.length) continue;
    const h = (f: (g: any) => number) => Array.from({ length: 11 }, (_, k) => set.filter((g) => f(g) === k).length).join(" ");
    const lost = set.reduce((a, g) => a + g.worth - g.earned, 0);
    console.log(`| ${name} | ${set.length} | ${fmt(mean(set.map((g) => g.worth)))} | ${fmt(mean(set.map((g) => g.earned)))} | ${h((g) => g.worth)} | ${h((g) => g.earned)} | ${lost} | ${set.reduce((a, g) => a + 10 - g.worth, 0)} |`);
  }

  // Excess.
  console.log(`\n## Excess moves (used − fewest; a range when the fewest is a range)\n`);
  console.log("| goals | n | exact M | used − M (low) median | (high) median | used/M median (low..high) | at the fewest |\n|---|---|---|---|---|---|---|");
  for (const [name, set] of [...groups, ["M ≤ 5", reached.filter((g) => g.U <= 5)], ["M 6–12", reached.filter((g) => g.U > 5 && g.L <= 12)], ["M > 12", reached.filter((g) => g.L > 12)]] as [string, any[]][]) {
    if (!set.length) continue;
    console.log(`| ${name} | ${set.length} | ${set.filter((g) => g.exact).length} | ${median(set.map((g) => g.excessLo))} | ${median(set.map((g) => g.excessHi))} | ${fmt(median(set.map((g) => g.used / g.U)), 2)}..${fmt(median(set.map((g) => g.used / g.L)), 2)} | ${set.filter((g) => g.excessLo === 0).length} |`);
  }

  // Correlations.
  const preds: [string, (g: any) => number][] = [
    ["M (mid of range)", (g) => g.Mmid], ["M low (A*)", (g) => g.L], ["b slides (1M)", (g) => g.run.bSlides], ["game score", (g) => g.gameScore], ["score, M mid", (g) => g.scoreMid], ["distance", (g) => g.distance],
    ["b blocks", (g) => g.s.bBlocks], ["score, b blocks", (g) => g.scoreBlocks], ["path slides", (g) => g.pathSlides], ["path blocks", (g) => g.pathBlocks], ["score, path blocks", (g) => g.scorePathBlocks],
    ["chain blocks", (g) => g.chainBlocks], ["score, chain blocks", (g) => g.scoreChain], ["blocks in solution", (g) => g.s.solutionBlocks],
    ["log2 A* expanded", (g) => Math.log2(g.s.expanded + 1)], ["game proof length", (g) => g.proofLength],
  ];
  const outs: [string, (g: any) => number][] = [
    ["active time", (g) => g.active], ["think", (g) => g.think], ["excess (low)", (g) => g.excessLo], ["used/M mid", (g) => g.used / g.Mmid], ["active s per move used", (g) => g.active / g.used],
  ];
  const table = (name: string, set: any[], ps: typeof preds) => {
    const ok = set.filter((g) => ps.every(([, f]) => Number.isFinite(f(g))) && outs.every(([, f]) => Number.isFinite(f(g))));
    console.log(`\n### Spearman ρ, ${name} (n=${ok.length}; 90% bootstrap interval)\n`);
    console.log(`| predictor | ${outs.map(([o]) => o).join(" | ")} |\n|---|${outs.map(() => "---|").join("")}`);
    for (const [p, f] of ps) console.log(`| ${p} | ${outs.map(([, o]) => { const [r, lo, hi] = spearmanCI(ok.map(f), ok.map(o)); return `${fmt(r, 2)} (${fmt(lo, 2)}..${fmt(hi, 2)})`; }).join(" | ")} |`);
  };
  table("all reached", reached.filter((g) => g.gameScore !== null), preds);
  table("reached, tries 12", reached.filter((g) => g.tries === 12 && g.gameScore !== null), preds);
  const traps: typeof preds = [["M", (g) => g.U], ["b slides", (g) => g.run.bSlides], ["b blocks", (g) => g.s.bBlocks], ["path blocks", (g) => g.pathBlocks], ["chain blocks", (g) => g.chainBlocks], ["good slides", (g) => g.goodSlidesMean], ["good blocks", (g) => g.goodBlocksMean], ["trap slides", (g) => g.trapSlides], ["trap blocks", (g) => g.trapBlocks], ["game score", (g) => g.gameScore ?? g.score1m]];
  table("exact M only (trap measures)", reached.filter((g) => g.exact && g.goodOk), traps);
  await Bun.write(file.replace(/\.json$/, ".rows.json"), JSON.stringify(rows));
}

if (import.meta.main) {
  const [cmd, a, b, c, d] = process.argv.slice(2);
  const [e, f] = process.argv.slice(7);
  if (cmd === "measure") await measureAll(a!, b!, c!, Number(d ?? 1_000_000), Number(e ?? 20_000), f ? new Set(f.split(",").map(Number)) : undefined);
  else if (cmd === "regen") await regen(a!, b!, c ? new Set(c.split(",").map(Number)) : undefined);
  else if (cmd === "shown") await shown(a!, b!, c!);
  else if (cmd === "report") await report(a!);
  else console.log("regen <play-data.json> <regen.json> [goals] | measure <play-data.json> <regen.json> <out.json> [limit] [good limit] [goals, comma-separated] | report <out.json>");
}
