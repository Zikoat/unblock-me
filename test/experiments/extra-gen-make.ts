// The generators of reports/extra-gen.html, on extra-gen-core.ts's exact solver:
//   A: random walled rooms, the best goal of each (every state of the room searched, every goal's
//      fewest at once), until one has enough extra moves; then opened up into the world.
//   B: constructive placement: red and its target on an empty region, blocks and walls added,
//      moved and removed by simulated annealing on the exact fewest and extra moves.
//   openUp: the room's walls taken away one at a time, or swapped for a block, each kept only
//      if the goal's fewest and extra moves stay exactly as they were; then distractors.
import { addRandom, analyse, bestGoal, cellsAt, clone, type Edge, free, type Grid, inWorld, occupancy, randomRoom, removePiece, rng, solve, span } from "./extra-gen-core";

export type Want = { lo: number; hi: number; extra: number };
export const WANT: Want = { lo: 10, hi: 16, extra: 3 };

export type Made = {
  ok: boolean;
  ms: number;
  g: Grid | null;
  red: number;
  target: number;
  fewest: number;
  extra: number;
  extraMax: number;
  states: number;
  tries: number;
  evals: number;
  /** Opening up: the share of the ring's cells no longer walls, walls in the window, distractors. */
  open?: { ring: number; opened: number; walls: number; distractors: number; sealed: boolean; ms: number; framedStates: number };
};

const roomShape = (next: () => number) =>
  next() < 0.5
    ? { W: 6, H: 6, blocks: 10 + Math.floor(next() * 5), walls: Math.floor(next() * 3) }
    : { W: 7, H: 7, blocks: 13 + Math.floor(next() * 5), walls: Math.floor(next() * 5) };

/** A: random rooms until one has a goal of `want` (or the deadline). */
export function makeRoom(seed: number, deadline: number, want: Want = WANT, side: "high" | "low" = "high", aim?: number) {
  const next = rng(seed * 7919 + 13);
  let tries = 0;
  while (performance.now() < deadline) {
    tries++;
    const s = roomShape(next);
    const g = randomRoom(s.W, s.H, s.blocks, s.walls, next);
    const goal = bestGoal(g, want.lo, want.hi, side, 150_000, aim, deadline);
    if (!goal) continue;
    if (side === "high" ? goal.extra >= want.extra : goal.extraMax === 0 && (aim === undefined || goal.fewest === aim)) return { g, goal, tries };
  }
  return { g: null, goal: null, tries };
}

export function makeA(seed: number, budget: number, want: Want = WANT, openUpToo = true, edge: Edge = "wall"): Made {
  const t0 = performance.now(), deadline = t0 + budget;
  const r = makeRoom(seed, deadline, want);
  if (!r.g || !r.goal) return { ok: false, ms: performance.now() - t0, g: null, red: -1, target: -1, fewest: 0, extra: 0, extraMax: 0, states: 0, tries: r.tries, evals: r.tries };
  const made: Made = { ok: true, ms: 0, g: r.g, red: r.goal.red, target: r.goal.target, fewest: r.goal.fewest, extra: r.goal.extra, extraMax: r.goal.extraMax, states: r.goal.states, tries: r.tries, evals: r.tries };
  if (openUpToo) Object.assign(made, openUp(made, seed, deadline, edge));
  made.ms = performance.now() - t0;
  return made;
}

/** B: simulated annealing from an empty region with red and its target. */
export function makeB(seed: number, budget: number, want: Want = WANT, side: "high" | "low" = "high", aim?: number): Made {
  const t0 = performance.now(), deadline = t0 + budget;
  const next = rng(seed * 104729 + 7);
  const W = next() < 0.5 ? 6 : 7, H = W;
  const fresh = (): Grid => {
    const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [{ h: true, lane: Math.floor(next() * H) }], pos: [0] };
    g.pos[0] = Math.floor(next() * 2); // red near one end
    return g;
  };
  let g = fresh();
  const target = span(g, g.pieces[0]!) - 1; // to the other end
  const score = (s: ReturnType<typeof solve>) => {
    if (s.status !== "ok") return -40;
    const f = s.fewest;
    if (side === "high") return 3 * s.extraMin + Math.min(f, want.hi) - 2 * Math.max(0, f - want.hi);
    // Low: as long as the aim, with no extra moves on any shortest solution.
    return -4 * s.extraMax - 1.5 * Math.abs(f - (aim ?? 12)) + 0.3 * Math.min(f, aim ?? 12);
  };
  const good = (s: ReturnType<typeof solve>) =>
    s.status === "ok" && s.fewest >= want.lo && s.fewest <= want.hi && (side === "high" ? s.extraMin >= want.extra : s.extraMax === 0 && (aim === undefined || s.fewest === aim));
  const run = (x: Grid) => solve(x, 0, target, { cap: 80_000, maxDepth: want.hi + 6 });
  let cur = run(g), curScore = score(cur);
  let best = { g: clone(g), s: cur, score: curScore };
  let evals = 1, since = 0;
  while (performance.now() < deadline && !good(best.s)) {
    const x = clone(g);
    const occ = occupancy(x);
    const r = next(), n = x.pieces.length;
    if (r < 0.4 || n < 3) addRandom(x, next, occ);
    else if (r < 0.55) removePiece(x, 1 + Math.floor(next() * (n - 1)));
    else if (r < 0.75) {
      // Move a block (not red) somewhere else.
      const i = 1 + Math.floor(next() * (n - 1));
      removePiece(x, i);
      addRandom(x, next);
    } else if (r < 0.87) {
      // Slide a block (red too) along its lane to another free position: a new start.
      const i = Math.floor(next() * n), p = x.pieces[i]!;
      cellsAt(x, p, x.pos[i]!).forEach((c) => (occ[c] = 0));
      const at = Math.floor(next() * span(x, p));
      if (free(occ, x, p, at) && !(i === 0 && at === target)) x.pos[i] = at;
    } else if (r < 0.95) {
      const c = Math.floor(next() * W * H);
      if (occ[c] === 0) x.wall[c] = 1;
    } else {
      const walls = [...x.wall.keys()].filter((c) => x.wall[c]);
      if (walls.length) x.wall[walls[Math.floor(next() * walls.length)]!] = 0;
    }
    const s = run(x);
    evals++;
    const sc = score(s);
    const T = 2.5 * (1 - (performance.now() - t0) / budget) + 0.15;
    if (sc >= curScore || next() < Math.exp((sc - curScore) / T)) ((g = x), (cur = s), (curScore = sc));
    if (sc > best.score || (good(s) && !good(best.s))) ((best = { g: clone(x), s, score: sc }), (since = 0));
    else if (++since > 250) ((g = clone(best.g)), (cur = best.s), (curScore = best.score), (since = 0));
  }
  const s = best.s;
  return { ok: good(s), ms: performance.now() - t0, g: best.g, red: 0, target, fewest: s.fewest, extra: s.extraMin, extraMax: s.extraMax, states: s.states, tries: 1, evals };
}

/**
 * The room (or region) put into the world and opened up: its ring of walls and the walls inside
 * taken away one at a time in a random order, each swapped for a block covering it and a
 * neighbouring empty cell or simply removed, and kept only if the goal's fewest stays the same and
 * its extra moves (the least over every shortest solution) do not drop; then distractor blocks on
 * empty cells no shortest solution uses (they can only add obstruction, and no shortest solution
 * touches them, so the fewest and extra moves cannot change), as many as keep the board as full
 * as the world round it; the final board verified once more. `edge`: "wall" verifies it as a
 * trial board (the window framed by walls), "open" as part of the endless world (sealed).
 */
export function openUp(m: Made, seed: number, deadline: number, edge: Edge = "wall", margin = 2): Partial<Made> {
  const t0 = performance.now();
  const next = rng(seed * 31337 + 5);
  const room = m.g!;
  const w = inWorld(room, margin, seed);
  let g = w.g;
  const o = margin + 1;
  const red = m.red, target = m.target + o;
  const cap = Math.max(80_000, 4 * m.states);
  const check = (x: Grid) => solve(x, red, target, { edge, cap, atLeast: m.fewest });
  let cur = check(g);
  if (cur.status !== "ok" || cur.fewest !== m.fewest) throw new Error(`room in the world: ${cur.status} ${cur.fewest} != ${m.fewest}`);
  const fixed = [...w.ring, ...[...w.roomCells].filter((c) => g.wall[c])];
  const shuffle = <T,>(xs: T[]) => xs.map((c) => [c, next()] as const).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  const keep = (x: Grid, why: string) => {
    const s = check(x);
    if (process.env.EG_DEBUG) console.log(why, s.status, s.fewest, s.extraMin, s.states, s.relevant);
    if (s.status !== "ok" || s.fewest !== m.fewest || s.extraMin < m.extra) return false;
    g = x;
    cur = s;
    return true;
  };
  const withBlock = (base: Grid, c: number, d: number) => {
    const x = clone(base);
    x.wall[c] = x.wall[d] = 0;
    const a = Math.min(c, d), h = Math.abs(d - c) === 1;
    x.pieces.push(h ? { h: true, lane: Math.floor(a / g.W) } : { h: false, lane: a % g.W });
    x.pos.push(h ? a % g.W : Math.floor(a / g.W));
    return x;
  };
  const sameRow = (c: number, d: number) => Math.abs(d - c) !== 1 || Math.floor(d / g.W) === Math.floor(c / g.W);
  const nbs = (c: number) => [c - 1, c + 1, c - g.W, c + g.W].filter((d) => d >= 0 && d < g.W * g.H && sameRow(c, d));
  // First, two neighbouring walls swapped for one block lying along them: where its ends are
  // walls (or blocks that can't move) it can never move either, a wall that looks like a block.
  const isFixed = new Set(fixed);
  for (const c of shuffle(fixed)) {
    if (performance.now() > deadline) break;
    if (!g.wall[c]) continue;
    const ds = shuffle(nbs(c).filter((d) => isFixed.has(d) && g.wall[d]));
    for (const d of ds) if (keep(withBlock(g, c, d), "pair")) break;
  }
  // Then each wall left: removed, or swapped for a block over it and an empty neighbour.
  for (const c of shuffle(fixed)) {
    if (performance.now() > deadline) break;
    if (!g.wall[c]) continue;
    const occ = occupancy(g);
    const plain = clone(g);
    plain.wall[c] = 0;
    const ds = nbs(c).filter((d) => occ[d] === 0);
    const tries = [plain];
    if (ds.length) tries[next() < 0.5 ? "push" : "unshift"](withBlock(g, c, ds[Math.floor(next() * ds.length)]!));
    for (const x of tries) {
      if (performance.now() > deadline) break;
      if (keep(x, x === plain ? "plain" : "block")) break;
    }
  }
  // Then a jagged edge: each wall left, and each block put on the ring, moved a cell out or in.
  const mid = { x: o + (room.W - 1) / 2, y: o + (room.H - 1) / 2 };
  const steps = (x: number, y: number) => shuffle([[Math.sign(x - mid.x), 0], [0, Math.sign(y - mid.y)], [-Math.sign(x - mid.x), 0], [0, -Math.sign(y - mid.y)]].filter(([a, b]) => a || b)).slice(0, 2);
  for (const c of shuffle([...fixed.filter((c) => g.wall[c]), ...[...g.pieces.keys()].filter((i) => cellsAt(g, g.pieces[i]!, g.pos[i]!).some((c) => isFixed.has(c))).map((i) => -1 - i)])) {
    if (performance.now() > deadline) break;
    const occ = occupancy(g);
    if (c >= 0) {
      if (!g.wall[c]) continue;
      for (const [dx, dy] of steps(c % g.W, Math.floor(c / g.W))) {
        const x0 = (c % g.W) + dx!, y0 = Math.floor(c / g.W) + dy!, d = y0 * g.W + x0;
        if (x0 < 0 || y0 < 0 || x0 >= g.W || y0 >= g.H || occ[d] !== 0) continue;
        const x = clone(g);
        x.wall[c] = 0;
        x.wall[d] = 1;
        if (keep(x, "wall out")) break;
      }
    } else {
      const i = -1 - c, p = g.pieces[i]!, [c1] = cellsAt(g, p, g.pos[i]!);
      for (const [dx, dy] of steps(c1 % g.W, Math.floor(c1 / g.W))) {
        const dl = p.h ? dy! : dx!;
        if (!dl) continue;
        const q = { h: p.h, lane: p.lane + dl };
        if (q.lane < 0 || q.lane >= (p.h ? g.H : g.W) || !cellsAt(g, q, g.pos[i]!).every((e) => occ[e] === 0)) continue;
        const x = clone(g);
        x.pieces[i] = q;
        if (keep(x, "block out")) break;
      }
    }
  }
  const opened = fixed.filter((c) => !g.wall[c]).length;
  // Distractors: on cells no shortest solution uses, near those it does, as long as the window
  // is emptier than the world round the room.
  const area = (c: number) => {
    const x = c % g.W, y = Math.floor(c / g.W);
    return x >= o - 1 && y >= o - 1 && x <= o + room.W && y <= o + room.H;
  };
  const fill = (x: Grid) => {
    const occ = occupancy(x);
    let full = 0, all = 0;
    for (let c = 0; c < occ.length; c++) if (area(c)) ((all++), occ[c]! > 0 && full++);
    return full / all;
  };
  const worldFill = (() => {
    const occ = occupancy(g);
    let full = 0, all = 0;
    for (let c = 0; c < occ.length; c++) if (!area(c)) ((all++), occ[c]! > 0 && full++);
    return full / all;
  })();
  let distractors = 0;
  const used = cur.used;
  const near = (c: number) => [c - 1, c + 1, c - g.W, c + g.W].some((d) => d >= 0 && d < used.length && used[d]);
  const occ = occupancy(g);
  const spots: { h: boolean; lane: number; at: number; s: number }[] = [];
  for (const h of [true, false]) for (let lane = 0; lane < (h ? g.H : g.W); lane++) for (let at = 0; at < (h ? g.W : g.H) - 1; at++) {
    const p = { h, lane }, cs = cellsAt(g, p, at);
    if (!cs.every((c) => occ[c] === 0 && !used[c] && area(c))) continue;
    spots.push({ h, lane, at, s: cs.filter(near).length + next() });
  }
  spots.sort((a, b) => b.s - a.s);
  let x = clone(g);
  const xo = occupancy(x);
  for (const sp of spots) {
    if (distractors >= 3 && fill(x) >= worldFill) break;
    const cs = cellsAt(x, sp, sp.at);
    if (!cs.every((c) => xo[c] === 0)) continue;
    x.pieces.push({ h: sp.h, lane: sp.lane });
    x.pos.push(sp.at);
    // (Sealed boards stay sealed: no distractor whose lane runs out of the window.)
    if (edge === "open" && !analyse(x, red, "open").sealed) {
      x.pieces.pop();
      x.pos.pop();
      continue;
    }
    cs.forEach((c) => (xo[c] = x.pieces.length));
    distractors++;
  }
  // Verify; if too many states, halve the distractors until it fits.
  let fin = check(x);
  while (fin.status !== "ok" && distractors > 0) {
    const keep = Math.floor(distractors / 2);
    x.pieces.splice(x.pieces.length - (distractors - keep));
    x.pos.splice(x.pos.length - (distractors - keep));
    distractors = keep;
    fin = check(x);
  }
  if (fin.status !== "ok" || fin.fewest !== m.fewest || fin.extraMin < m.extra) throw new Error(`opened board failed: ${fin.status} ${fin.fewest} ${fin.extraMin}`);
  const sealed = solve(x, red, target, { edge: "open", cap, atLeast: m.fewest });
  const walls = [...x.wall].filter((v) => v).length;
  return {
    g: x, red, target, fewest: fin.fewest, extra: fin.extraMin, extraMax: fin.extraMax, states: fin.states,
    open: { ring: fixed.length, opened, walls, distractors, sealed: sealed.status === "ok" && sealed.fewest === m.fewest && sealed.extraMin === fin.extraMin, ms: performance.now() - t0, framedStates: fin.states },
  };
}
