// Which board numbers track how the trial boards felt (reports/trial-features.html): every trial
// (src/trials.ts, trials-maker.ts, trials-gen.ts) measured exactly on its framed board, its play
// log's moves and time, and each number's rank correlation with the verdicts' order and the
// pairs it orders as the verdicts do.
//   bun test/experiments/trial-features.ts
import { writeFileSync } from "node:fs";
import { contractGoal, WISHES, WORLD_VERSION } from "../../src/contract";
import { judge } from "../../src/judge";
import { decisionTree, boardCells } from "../../src/decisions";
import { requestBoard } from "../../src/contract";
import { TRIALS, type Trial } from "../../src/trials";
import { MAKER_TRIALS } from "../../src/trials-maker";
import { GEN_TRIALS } from "../../src/trials-gen";
import { analyse, cellsAt, lockedSet, occupancy, span, type Grid } from "./extra-gen-core";
import { gridOf, type Mv, play } from "./trial-grid";

const all: Trial[] = [...TRIALS, ...MAKER_TRIALS, ...GEN_TRIALS];

// The verdicts, best/hardest first (see the page for the reasoning).
const VERDICT = ["12A", "16B", "M1A", "G2A", "G1A", "16A", "8A", "8B", "M1B", "G1B", "12B", "G2B"];
// The blind pairs and which side the player preferred (felt harder/better).
const PAIRS: [string, string][] = [["8A", "8B"], ["12A", "12B"], ["16B", "16A"], ["M1A", "M1B"], ["G1A", "G1B"], ["G2A", "G2B"]];
// Pairs the quotes call only slightly apart ("a bit easier", "slightly easier"); the others are clear.
const SLIGHT = new Set(["8A", "G1A"]);


/** Every slide of every piece in `which` on occupancy `occ` (0 empty). */
function slidesOf(g: Grid, occ: Int16Array, pos: number[], which: number[], f: (i: number, to: number) => void) {
  for (const i of which) {
    const p = g.pieces[i]!, at = pos[i]!;
    const cell = (k: number) => (p.h ? p.lane * g.W + k : k * g.W + p.lane);
    for (let j = at - 1; j >= 0 && occ[cell(j)] === 0; j--) f(i, j);
    for (let j = at + 1; j < span(g, p) && occ[cell(j + 1)] === 0; j++) f(i, j);
  }
}

/** Cells a move sweeps: where the block starts, passes and ends. */
function swept(g: Grid, [i, a, b]: Mv): Set<number> {
  const p = g.pieces[i]!, out = new Set<number>();
  for (let k = Math.min(a, b); k <= Math.max(a, b) + 1; k++) out.add(p.h ? p.lane * g.W + k : k * g.W + p.lane);
  return out;
}

/** The order of a solution: what a player has to keep in mind. */
function orderStats(g: Grid, sol: Mv[], red: number) {
  const n = sol.length, sw = sol.map((m) => swept(g, m));
  // Move j depends on an earlier move i when they share a cell or move the same block.
  const dep: boolean[][] = sol.map(() => sol.map(() => false));
  for (let j = 0; j < n; j++) for (let i = 0; i < j; i++) {
    if (sol[i]![0] === sol[j]![0]) dep[j]![i] = true;
    else for (const c of sw[i]!) if (sw[j]!.has(c)) { dep[j]![i] = true; break; }
  }
  const longest: number[] = [];
  for (let j = 0; j < n; j++) longest[j] = 1 + Math.max(0, ...longest.slice(0, j).filter((_, i) => dep[j]![i]));
  const chain = Math.max(...longest);
  let switches = 0;
  for (let j = 1; j < n; j++) if (!dep[j]![j - 1]) switches++;
  // Blocks moved and still to move again: the most at once.
  const lastAt = new Map<number, number>(), firstAt = new Map<number, number>();
  sol.forEach(([i], k) => (lastAt.set(i, k), firstAt.has(i) || firstAt.set(i, k)));
  let open = 0;
  for (let t = 0; t < n; t++) {
    let c = 0;
    for (const [i, f] of firstAt) if (f <= t && lastAt.get(i)! > t) c++;
    open = Math.max(open, c);
  }
  // A block's moves apart: other moves between two moves of one block (the most).
  let gap = 0;
  const prev = new Map<number, number>();
  sol.forEach(([i], k) => (prev.has(i) && (gap = Math.max(gap, k - prev.get(i)! - 1)), prev.set(i, k)));
  const blocks = new Set(sol.map((m) => m[0])).size, redMoves = sol.filter((m) => m[0] === red).length;
  return { extra: n - blocks, extraNoRed: n - redMoves - (blocks - 1), blocks, redMoves, chain, switches, open, gap };
}
type Order = ReturnType<typeof orderStats>;

function measure(t: Trial) {
  const { g, red, target, proof } = gridOf(t);
  const occ0 = occupancy(g);
  const a = analyse(g, red, "wall", occ0);
  // Too many blocks matter on the maker's boards (36 and 63) for an exact search: there the
  // blocks the proof moves and those whose reach crosses a cell the proof sweeps, the rest frozen.
  let R = a.relevant;
  const cut = R.length > 30;
  if (cut) {
    const cells = new Set(proof.flatMap((m) => [...swept(g, m)]));
    const keep = new Set(proof.map((m) => m[0]));
    R.forEach((i) => {
      const [lo, hi] = a.extent[i]!;
      for (let k = lo; k <= hi + 1; k++) if (cells.has(g.pieces[i]!.h ? g.pieces[i]!.lane * g.W + k : k * g.W + g.pieces[i]!.lane)) keep.add(i);
    });
    // (Still too many on M1B: then only the blocks the proof moves and those now on a cell it sweeps.)
    if (keep.size > 24) {
      keep.clear();
      proof.forEach((m) => keep.add(m[0]));
      R.forEach((i) => cellsAt(g, g.pieces[i]!, g.pos[i]!).some((c) => cells.has(c)) && keep.add(i));
    }
    R = R.filter((i) => keep.has(i));
    console.log(t.label, "cut to", R.length, "of", a.relevant.length, "blocks that matter");
  }
  const n = R.length;
  // The fixed part for the blocks that matter: everything else is a wall.
  const base = new Int16Array(g.W * g.H);
  for (let c = 0; c < base.length; c++) base[c] = occ0[c] === -1 ? -1 : occ0[c]! > 0 && !R.includes(occ0[c]! - 1) ? -1 : 0;
  const keyOf = (pos: number[]) => String.fromCharCode(...R.map((i) => pos[i]!));
  const states: string[] = [], depth: number[] = [], index = new Map<string, number>();
  const add = (k: string, d: number) => { if (index.has(k)) return false; index.set(k, states.length); states.push(k); depth.push(d); return true; };
  const posOf = (k: string) => { const pos = [...g.pos]; R.forEach((i, j) => (pos[i] = k.charCodeAt(j))); return pos; };
  const occOf = (pos: number[]) => {
    const occ = base.slice();
    R.forEach((i) => cellsAt(g, g.pieces[i]!, pos[i]!).forEach((c) => (occ[c] = i + 1)));
    return occ;
  };
  const neighbours = (s: number): number[] => {
    const pos = posOf(states[s]!), occ = occOf(pos), out: number[] = [];
    slidesOf(g, occ, pos, R, (i, to) => {
      const was = pos[i]!;
      pos[i] = to;
      const k = keyOf(pos), j = index.get(k);
      pos[i] = was;
      out.push(j ?? -1);
    });
    return out;
  };
  add(keyOf(g.pos), 0);
  const CAP = cut ? 2_000_000 : 3_000_000;
  let fewest = -1, capped = false;
  for (let head = 0; head < states.length; head++) {
    if (states.length > CAP) { capped = true; break; }
    if (cut && fewest >= 0 && depth[head]! >= fewest) { capped = true; break; } // (a cut board: only up to the fewest)
    const pos = posOf(states[head]!), occ = occOf(pos), d = depth[head]! + 1;
    slidesOf(g, occ, pos, R, (i, to) => {
      const was = pos[i]!;
      pos[i] = to;
      if (add(keyOf(pos), d) && fewest < 0 && i === red && to === target) fewest = d;
      pos[i] = was;
    });
  }
  // Not found within the cap (M1B, even cut): the proof's length stands, and only the proof is measured.
  const proved = fewest >= 0;
  if (!proved && !cut) throw new Error(`${t.label}: unsolved (capped ${capped})`);
  if (!proved) fewest = proof.length;
  const reachable = states.length, toFewest = depth.filter((d) => d <= fewest).length;
  // States on some shortest solution, layer by layer back from the goals, and the edges forward.
  const redAt = R.indexOf(red);
  const onPath = new Uint8Array(states.length);
  const layer: number[][] = Array.from({ length: fewest + 1 }, () => []);
  if (proved) states.forEach((k, i) => depth[i] === fewest && k.charCodeAt(redAt) === target && ((onPath[i] = 1), layer[fewest]!.push(i)));
  const into = new Map<number, number[]>(); // t -> its predecessors on a shortest path
  if (proved) for (let d = fewest; d > 0; d--) for (const s of layer[d]!) for (const p of neighbours(s)) {
    if (p < 0 || depth[p] !== d - 1) continue;
    (into.get(s) ?? into.set(s, []).get(s)!).push(p);
    if (!onPath[p]) ((onPath[p] = 1), layer[d - 1]!.push(p));
  }
  const out = new Map<number, number[]>();
  for (const [s, ps] of into) for (const p of ps) (out.get(p) ?? out.set(p, []).get(p)!).push(s);
  // Shortest solutions: counted from the start (ways in) and to the goals (ways on).
  const waysOn = new Map<number, number>();
  for (const s of layer[fewest]!) waysOn.set(s, 1);
  if (proved) for (let d = fewest - 1; d >= 0; d--) for (const s of layer[d]!) waysOn.set(s, (out.get(s) ?? []).reduce((a, t) => a + waysOn.get(t)!, 0));
  const solutions = proved ? waysOn.get(0)! : NaN;
  const moveBetween = (s: number, t: number): Mv => {
    const a = states[s]!, b = states[t]!;
    for (let j = 0; j < n; j++) if (a.charCodeAt(j) !== b.charCodeAt(j)) return [R[j]!, a.charCodeAt(j), b.charCodeAt(j)];
    throw new Error("no move");
  };
  // Every shortest solution, or a uniform sample of them.
  const SAMPLE = 20_000, orders: Order[] = [];
  if (!proved) orders.push(orderStats(g, proof, red));
  else if (solutions <= SAMPLE) {
    const walk = (s: number, path: Mv[]) => {
      if (depth[s] === fewest) return void orders.push(orderStats(g, path, red));
      for (const t of out.get(s) ?? []) walk(t, [...path, moveBetween(s, t)]);
    };
    walk(0, []);
  } else {
    let seed = 12345;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let k = 0; k < SAMPLE; k++) {
      let s = 0;
      const path: Mv[] = [];
      while (depth[s] !== fewest) {
        const ts = out.get(s)!, w = ts.map((t) => waysOn.get(t)!), total = w.reduce((a, b) => a + b, 0);
        let r = rand() * total, j = 0;
        for (; j < ts.length - 1 && r >= w[j]!; j++) r -= w[j]!;
        path.push(moveBetween(s, ts[j]!));
        s = ts[j]!;
      }
      orders.push(orderStats(g, path, red));
    }
  }
  const stat = (f: (o: Order) => number) => {
    const v = orders.map(f);
    return { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length };
  };
  // Along the proof, on the whole board: legal moves, blocks that can move, and moves that keep it shortest.
  const proofStats = orderStats(g, proof, red);
  const pos = [...g.pos], allPieces = g.pieces.map((_, i) => i);
  let legal = 0, movable = 0, optimal = 0, optimalFirst = 0, forced = 0;
  let s = 0;
  proof.forEach(([i, , to], k) => {
    const occ = occupancy({ ...g, pos });
    const ids = new Set<number>();
    slidesOf(g, occ, pos, allPieces, (j) => (legal++, ids.add(j)));
    movable += ids.size;
    const opt = proved ? (out.get(s) ?? []).length : NaN;
    optimal += opt;
    if (opt === 1) forced++;
    if (k === 0) optimalFirst = opt;
    pos[i] = to;
    s = index.get(keyOf(pos)) ?? -1;
  });
  // Open edge: blocks touching the frame, and how many of them can move at the start.
  const edgeBlocks = new Set<number>(), canMove = new Set<number>();
  g.pieces.forEach((p, i) => cellsAt(g, p, g.pos[i]!).forEach((c) => {
    const x = c % g.W, y = Math.floor(c / g.W);
    if (x === 0 || y === 0 || x === g.W - 1 || y === g.H - 1) edgeBlocks.add(i);
  }));
  slidesOf(g, occ0, g.pos, allPieces, (i) => canMove.add(i));
  const locked = lockedSet(g, "wall", occ0).filter(Boolean).length;
  // The Judge's decisions on the proof, and the depth of its clearing tree at the start.
  const request = { version: 1, world: { seed: 0, density: 0, ui: {}, version: WORLD_VERSION, placed: t.blocks }, moved: {}, history: [], rampAim: null, wishes: WISHES, seed: 1 } as const;
  const goal = contractGoal({ id: t.red, target: t.target, solution: t.solution });
  const terms = judge(request as never, goal);
  const tree = decisionTree(boardCells(requestBoard(request as never)), t.red, t.target);
  const depthOf = (c: { ways: { needs: unknown[] }[] }): number => 1 + Math.max(0, ...c.ways.flatMap((w) => (w.needs as never[]).map(depthOf)));
  const clearDepth = Math.max(0, ...tree.roots.map(depthOf));
  return {
    label: t.label, cut, proved, board: `${g.W}×${g.H}`, blocks: g.pieces.length, fewest, verified: fewest === t.fewest,
    extra: stat((o) => o.extra), extraNoRed: stat((o) => o.extraNoRed), redMoves: stat((o) => o.redMoves), moved: stat((o) => o.blocks),
    chain: stat((o) => o.chain), switches: stat((o) => o.switches), open: stat((o) => o.open), gap: stat((o) => o.gap),
    proof: proofStats, decisions: terms.decisions, difficulty: terms.difficulty, balance: terms.balance, clearDepth, relevant: n, toFewest, reachable, capped,
    legal: legal / fewest, movable: movable / fewest, optimalFirst, optimal: optimal / fewest, forced,
    solutions, sampled: solutions > SAMPLE, onShortest: layer.reduce((a, l) => a + l.length, 0),
    edge: [...edgeBlocks].filter((i) => canMove.has(i)).length, edgeAll: edgeBlocks.size, loose: canMove.size, locked,
  };
}

const rows = all.map((t) => {
  const m = measure(t);
  console.log(m.label, m.fewest, m.verified ? "" : "MISMATCH", `extra ${m.extra.min}-${m.extra.max}`, `states ${m.reachable}${m.capped ? "+" : ""}`, `solutions ${m.solutions}`);
  return { ...m, play: play(t.label) };
});

// The columns: a heading, a one-line definition, the value (a number for the correlations) and how it shows.
type Col = { h: string; def: string; v: (r: (typeof rows)[number]) => number | null; show?: (r: (typeof rows)[number]) => string; rank?: boolean };
const f1 = (x: number) => (Math.round(x * 10) / 10).toString();
/** Counts of the whole search: not on a cut board (M1A, M1B). */
const whole = (r: (typeof rows)[number]) => !r.cut;
const NA = "–";
const range = (s: { min: number; max: number }) => (s.min === s.max ? `${s.min}` : `${s.min}–${s.max}`);
const cols: Col[] = [
  { h: "Fewest", def: "fewest moves, exact (breadth-first over every state of the blocks that matter).", v: (r) => r.fewest },
  { h: "Extra", def: "extra moves, red included: moves − distinct blocks moved; the mean over every shortest solution (their range below it).", v: (r) => r.extra.mean, show: (r) => `${f1(r.extra.mean)}<br><small>${range(r.extra)}</small>` },
  { h: "Extra w/o red", def: "extra moves not counting red's own repeats (mean, range).", v: (r) => r.extraNoRed.mean, show: (r) => `${f1(r.extraNoRed.mean)}<br><small>${range(r.extraNoRed)}</small>` },
  { h: "Extra share", def: "extra moves / fewest (the Judge's share).", v: (r) => r.extra.mean / r.fewest, show: (r) => `${Math.round((100 * r.extra.mean) / r.fewest)}%` },
  { h: "Red moves", def: "times red moves (mean over shortest solutions).", v: (r) => r.redMoves.mean, show: (r) => f1(r.redMoves.mean) },
  { h: "Decisions", def: "the Judge's decisions along the trial's proof (src/decisions.ts).", v: (r) => r.decisions },
  { h: "Judge difficulty", def: "the Judge's difficulty: fewest + decision weight × decisions.", v: (r) => r.difficulty, show: (r) => f1(r.difficulty) },
  { h: "Judge balance", def: "the Judge's balance (difficulty over distance, track blocks, × (1 + extra share)^4), as the game scores the goal.", v: (r) => r.balance, show: (r) => f1(r.balance) },
  { h: "Clearing depth", def: "the deepest chain of blocks-to-clear in the Judge's clearing tree at the start.", v: (r) => r.clearDepth },
  { h: "Blocks moved", def: "distinct blocks a shortest solution moves (mean).", v: (r) => r.moved.mean, show: (r) => f1(r.moved.mean) },
  { h: "Blocks that matter", def: "blocks whose lanes reach red's, transitively (the rest can't change the solution).", v: (r) => r.relevant },
  { h: "States to fewest", def: "states reachable within the fewest moves.", v: (r) => (whole(r) ? r.toFewest : null), show: (r) => (whole(r) ? r.toFewest.toLocaleString("en") : NA) },
  { h: "Reachable", def: "every state the blocks that matter can reach.", v: (r) => (r.capped || !whole(r) ? null : r.reachable), show: (r) => (!whole(r) ? NA : r.capped ? `>${(r.reachable / 1e6).toFixed(1)}M` : r.reachable.toLocaleString("en")) },
  { h: "Legal moves", def: "legal moves (every block, every distance) at each step of the proof, averaged.", v: (r) => r.legal, show: (r) => f1(r.legal) },
  { h: "Movable blocks", def: "blocks that can move at each step of the proof, averaged.", v: (r) => r.movable, show: (r) => f1(r.movable) },
  { h: "Optimal first", def: "first moves that keep the fewest (lead to a shortest solution).", v: (r) => (r.proved ? r.optimalFirst : null), show: (r) => (r.proved ? `${r.optimalFirst}` : NA) },
  { h: "Optimal / step", def: "moves that keep the fewest at each step of the proof, averaged (1 = forced all the way).", v: (r) => (r.proved ? r.optimal : null), show: (r) => (r.proved ? f1(r.optimal) : NA) },
  { h: "Forced steps", def: "steps of the proof with exactly one move that keeps the fewest.", v: (r) => (r.proved ? r.forced : null), show: (r) => (r.proved ? `${r.forced}` : NA) },
  { h: "Shortest solutions", def: "how many distinct shortest move sequences there are (log₁₀ for the correlation).", v: (r) => (whole(r) ? Math.log10(r.solutions) : null), show: (r) => (whole(r) ? r.solutions.toLocaleString("en") : r.proved ? `${r.solutions.toLocaleString("en")}<br><small>cut</small>` : NA) },
  { h: "On a shortest path", def: "share of the states within the fewest that lie on some shortest solution.", v: (r) => (whole(r) ? r.onShortest / r.toFewest : null), show: (r) => (whole(r) ? `${((100 * r.onShortest) / r.toFewest).toFixed(2)}%` : NA) },
  { h: "Longest chain", def: "the longest run of moves each needing the one before (sharing a cell or a block), mean over shortest solutions.", v: (r) => r.chain.mean, show: (r) => `${f1(r.chain.mean)}<br><small>${range(r.chain)}</small>` },
  { h: "Chain share", def: "longest chain / fewest (1 = one single chain, low = many independent pieces).", v: (r) => r.chain.mean / r.fewest, show: (r) => `${Math.round((100 * r.chain.mean) / r.fewest)}%` },
  { h: "Switches", def: "interleaving: moves that don't depend on the move just before (a jump to another sub-chain), the least over shortest solutions.", v: (r) => r.switches.min, show: (r) => `${r.switches.min}<br><small>${range(r.switches)}</small>` },
  { h: "Open threads", def: "the most blocks at once that were moved and must move again (to keep in mind), the least over shortest solutions.", v: (r) => r.open.min, show: (r) => `${r.open.min}<br><small>${range(r.open)}</small>` },
  { h: "Return gap", def: "the most other moves between two moves of one block, the least over shortest solutions.", v: (r) => r.gap.min, show: (r) => `${r.gap.min}<br><small>${range(r.gap)}</small>` },
  { h: "Open edge", def: "blocks touching the frame that can move at the start / blocks touching the frame.", v: (r) => r.edge, show: (r) => `${r.edge}/${r.edgeAll}` },
  { h: "Loose at start", def: "blocks that can move at the start / all blocks (locked: can never move).", v: (r) => r.loose / r.blocks, show: (r) => `${r.loose}/${r.blocks}<br><small>${r.locked} locked</small>` },
  { h: "Played moves", def: "the player's moves (log; 8A–16B were played before logging).", v: (r) => r.play?.moves ?? null, show: (r) => (r.play ? `${r.play.moves}` : "–") },
  { h: "Played / fewest", def: "the player's moves / fewest.", v: (r) => (r.play ? r.play.moves / r.fewest : null), show: (r) => (r.play ? (r.play.moves / r.fewest).toFixed(2) : "–") },
  { h: "Time", def: "seconds from the goal shown to reached (before the first move in brackets).", v: (r) => r.play?.time ?? null, show: (r) => (r.play ? `${Math.round(r.play.time)}<br><small>(${Math.round(r.play.think)})</small>` : "–") },
  { h: "Solve time", def: "seconds from the first move to reached.", v: (r) => r.play?.solve ?? null, show: (r) => (r.play ? `${Math.round(r.play.solve)}` : "–") },
  { h: "Take-backs", def: "undos, plus moves that put a block straight back where its last move started.", v: (r) => (r.play ? r.play.undos + r.play.back : null), show: (r) => (r.play ? `${r.play.undos + r.play.back}` : "–") },
];

/** Spearman's rank correlation (ties averaged) between the value and the verdict order (1 best). */
function ranks(v: number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(v.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b), n = a.length, ma = (n + 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) ((num += (ra[i]! - ma) * (rb[i]! - ma)), (da += (ra[i]! - ma) ** 2), (db += (rb[i]! - ma) ** 2));
  return da && db ? num / Math.sqrt(da * db) : 0;
}
const byLabel = new Map(rows.map((r) => [r.label, r]));
const scores = cols.map((c) => {
  const have = VERDICT.filter((l) => c.v(byLabel.get(l)!) !== null);
  // Higher verdict = better/harder: the order reversed, so a positive rho means "more is better".
  const rho = spearman(have.map((l) => c.v(byLabel.get(l)!)!), have.map((l) => VERDICT.length - VERDICT.indexOf(l)));
  let right = 0, wrong = 0, tie = 0, clear = 0, clearOf = 0;
  for (const [win, lose] of PAIRS) {
    const a = c.v(byLabel.get(win)!), b = c.v(byLabel.get(lose)!);
    if (a === null || b === null) continue;
    const d = Math.sign(rho || 1) * (a - b);
    if (!SLIGHT.has(win)) ((clearOf++), d > 1e-9 && clear++);
    if (Math.abs(a - b) < 1e-9) tie++;
    else if (d > 0) right++;
    else wrong++;
  }
  return { c, n: have.length, rho, right, wrong, tie, clear, clearOf };
});
for (const s of [...scores].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))) console.log(s.c.h.padEnd(20), s.rho.toFixed(2), `n=${s.n}`, `pairs ${s.right}/${s.right + s.wrong + s.tie} (${s.tie} tied)`, `clear ${s.clear}/${s.clearOf}`);

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const ordered = VERDICT.map((l) => byLabel.get(l)!);
const ranked = [...scores].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trial features: which number tracks the verdicts</title>
<meta name="date" content="${new Date().toISOString().slice(0, 10)}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --good: #2f7d4f; --bad: #b0413e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --good: #6cc08f; --bad: #e07a76; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 56px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 19px; margin: 34px 0 8px; }
  .sub, ul, ol, dl { max-width: 95ch; } .sub { color: var(--ink-2); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; margin-bottom: 10px; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 8px; border-bottom: 1px solid var(--line); text-align: right; vertical-align: top; }
  td.l, th.l { text-align: left; } th { color: var(--ink-2); font-weight: 600; } small { color: var(--ink-2); }
  thead th { position: sticky; top: 0; background: var(--card); }
  dl { font-size: 14px; } dt { font-weight: 600; float: left; clear: left; margin-right: 6px; } dd { margin: 0 0 2px; }
  .good { color: var(--good); font-weight: 600; } .bad { color: var(--bad); }
</style></head><body><main>
<p><a href="./">Reports</a></p>
<h1>Trial features: which number tracks the verdicts</h1>
<p class="sub">The twelve trial boards (8A–16B: reports/extra-moves.html; M1: extra-maker.html; G1, G2: extra-gen.html), each measured exactly on the board as played (its frame of walls), against how they felt. Made by test/experiments/trial-features.ts. <strong>Twelve boards and one player: every correlation here is a hint, not a finding.</strong> |ρ| needs about 0.58 to be "significant" at n = 12, and none of that holds with one player's mood and learning between sessions (the G trials came last).</p>

<h2>The verdict order</h2>
<p class="sub">Best/hardest first. Where the quotes say "hard" they also say "good" (12A, 16B, G2A), and the simple ones are the ones disliked, so one order serves both. The pairs are firm (the quotes compare them directly); the order between pairs is my reading and is soft in the middle:</p>
<ol>
<li><strong>12A</strong> — quite the challenge, lost track of blocks, enjoyed it; the best.</li>
<li><strong>16B</strong> — more fun than 16A, harder to follow, but 12A was more difficult.</li>
<li><strong>M1A</strong> — much more difficult than M1B.</li>
<li><strong>G2A</strong> — better opening, slightly more difficult than G1A.</li>
<li><strong>G1A</strong> — not that difficult, one back-and-forth path.</li>
<li><strong>16A</strong> — pretty easy, could follow the dependency chain.</li>
<li><strong>8A</strong> — relatively simple, struggled once, liked slightly better than 8B.</li>
<li><strong>8B</strong> — a bit easier than 8A.</li>
<li><strong>M1B</strong> — much easier than M1A (no other remark; placed by that).</li>
<li><strong>G1B</strong> — no outer blocks loose, slightly easier than G1A, worse than earlier trials.</li>
<li><strong>12B</strong> — simple and straightforward, not good.</li>
<li><strong>G2B</strong> — the worst, no openings, very simple solution.</li>
</ol>
<p class="sub">Pairs (the preferred side first): ${PAIRS.map(([a, b]) => `${a} &gt; ${b}`).join(", ")}. The pairs are matched at the same fewest moves, so "pairs right" is the cleaner test.</p>

<h2>The numbers</h2>
<dl>${cols.map((c) => `<dt>${esc(c.h)}</dt><dd>${esc(c.def)}</dd>`).join("")}</dl>
<p class="sub">Exact on the framed board: blocks that can never move, or whose lanes never meet red's chain, are left out of the search (they can't change it). Per-solution numbers are over every shortest solution, or a uniform sample of 20,000 where there are more (${rows.filter((r) => r.sampled).map((r) => r.label).join(", ") || "none"}). Small grey numbers: the range over shortest solutions. 8A–16B have no play log (16A and 16B's files are empty reloads); no trial used undo.</p>
<div class="card"><table>
<thead><tr><th class="l">Trial</th><th>Verdict</th>${cols.map((c) => `<th>${esc(c.h)}</th>`).join("")}</tr></thead>
<tbody>${ordered.map((r, i) => `<tr><td class="l"><strong>${r.label}</strong><br><small>${r.board}</small></td><td>${i + 1}</td>${cols.map((c) => `<td>${c.show ? c.show(r) : c.v(r)}</td>`).join("")}</tr>`).join("\n")}</tbody>
</table></div>

<h2>Which numbers order the trials like the verdicts</h2>
<p class="sub">ρ: Spearman's rank correlation with the verdict order (positive: more of it is better/harder; n = 12, or 6 for the play log). Pairs: of the six blind pairs, how many it orders as the player did, in the direction of its ρ (ties count as misses); clear pairs: the four the quotes set clearly apart (12, 16, M1, G2), leaving out 8 and G1, which they call only slightly apart. Sorted by |ρ|; green: |ρ| ≥ 0.58, red: below 0.3.</p>
<div class="card"><table>
<thead><tr><th class="l">Number</th><th>ρ</th><th>n</th><th>Pairs right</th><th>Clear pairs right</th></tr></thead>
<tbody>${ranked.map((s) => `<tr><td class="l">${esc(s.c.h)}</td><td class="${Math.abs(s.rho) >= 0.58 ? "good" : Math.abs(s.rho) < 0.3 ? "bad" : ""}">${s.rho.toFixed(2)}</td><td>${s.n}</td><td>${s.right}/${s.right + s.wrong + s.tie}${s.tie ? ` <small>(${s.tie} tied)</small>` : ""}</td><td>${s.clear}/${s.clearOf}</td></tr>`).join("\n")}</tbody>
</table></div>
<h2>What it says</h2>
<ul>
<li><strong>The extra-moves family tracks the verdicts best, and only it does</strong>: extra moves (ρ 0.52), extra moves without red (0.55), open threads (0.55: the most blocks moved and still to move again), return gap (0.53) and longest chain (0.51). Each orders all four clear pairs right. On these boards they are nearly one number: every board with no extra moves has no open threads and no return gap, so they can't be told apart here. Open threads is the one that reads like the 12A quote ("lost track of which blocks were moved and which they wanted to move"). Reordering the soft middle of the verdict order moves their ρ between about 0.46 and 0.71. The other numbers stay below 0.4.</li>
<li><strong>Extra moves alone holds up for the clear pairs, not the slight ones</strong>: 12A over 12B, 16B over 16A, M1A over M1B and G2A over G2B all have more extra moves on the preferred side. Both pairs the player called only slightly apart go the other way: 8A (0 extra) was liked a little better than 8B (3), and G1A (0) was rated above G1B (6; "worse than earlier trials"). In those two pairs the preferred side moves more distinct blocks and has far more shortest solutions and legal moves (8A 138 against 8 solutions, G1A 91,080 against 1,928), so more of the board is in play. In the clear pairs that goes the other way, and two cases can't separate it from noise.</li>
<li><strong>Not tracking</strong>: fewest moves (ρ 0.22; the pairs are matched on it anyway), the Judge's decisions (−0.19 and 0 of 4 clear pairs: G2B, the worst, has 12; G1B has 11; 12A has 4), so the Judge's difficulty (−0.10) and its balance (0.31) are held up only by their extra-moves factor. Reachable states, states to the fewest, legal moves, movable blocks, the clearing tree's depth and the open edge as counted here (≈ 0) don't track either.</li>
<li><strong>The play log (six boards)</strong>: the time from the first move to the goal orders them best (ρ 0.66; M1A 48 s, G2A 31 s), but G2A against G2B is 31.3 s against 31.1 s, a tie. Moves over fewest and take-backs say little. G1A had 88 s of looking before the first move. No undo was used.</li>
<li><strong>So, to generate</strong>: aim at real extra moves (over every shortest solution, not the proof's), read as blocks the player must come back to. Fewest moves and decisions don't buy the feel. A board with extra moves but little else in play (G1B, 8B) can still feel thin, but that rests on two slight verdicts.</li>
</ul>
<p class="sub">Measurement notes. M1A and M1B are cut from the maker's world: 36 and 63 blocks matter there, too many to search exactly. M1A is searched exactly over the 19 blocks the proof moves or whose reach crosses a cell it sweeps, with the rest frozen. That confirms 13 moves on the cut, with 1 to 2 extra (the answer key says 2). M1B, even cut to the 12 blocks the proof moves, passed 2 million states before 12 moves, so its fewest is the Auditor's and only its proof is measured. The open edge counts blocks touching the trial's frame; on G1 and G2 the room's own edge is the ring of locked blocks inside the window, which this count doesn't see, so it doesn't reproduce "only 2 outer blocks open" on G1A.</p>
</main></body></html>
`;
writeFileSync("reports/trial-features.html", html);
writeFileSync("/tmp/trial-features.json", JSON.stringify({ rows, scores: scores.map((s) => ({ h: s.c.h, rho: s.rho, right: s.right, wrong: s.wrong, tie: s.tie })) }, null, 1));
console.log("reports/trial-features.html");
