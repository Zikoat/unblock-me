// reports/walls.html from walls.ts's JSONL files alone (the raw goals; every derived number is
// worked out here, nothing is searched again):
//   bun test/experiments/walls-report.ts reports/walls.html data/walls/high.jsonl [more.jsonl ...]
export {};
type Move = { block: string; from: { x: number; y: number }; to: { x: number; y: number } };
type Row = {
  walls: number; density: number; seed: number; effort: number;
  census: { area: number; blocks: number; blockCells: number; wallCells: number };
  found: boolean; ok?: boolean;
  blocks?: [string, number, number, number, number, number][];
  goal?: { red: string; start: { x: number; y: number }; target: { x: number; y: number }; moves: Move[] };
  maker?: { fewest: number | null; atLeast: number; distance: number };
  terms?: { moves: number; decisions: number; distance: number; fitness: number; track: number };
  ms: { gen: number; maker: number; referee?: number; judge?: number; choices?: number };
};

const [out, ...files] = process.argv.slice(2);
/** The findings, written from the data the report was last made from. */
const SHOWS = `
<li>The gut feeling holds for long goals and not for walls. Blocks moved twice or more come with long proofs: in about 90% of proofs over 15 moves, a third of those of 11-15, under 10% of shorter ones, whatever the walls. Block density is what makes proofs long: at no walls the share with a re-moved block goes from 4% (density 6) to 64% (16).</li>
<li>Random walls make re-moved blocks rarer, not more common: from 35% of goals with none to 10% at 15% walls (all densities), a directed blocker cycle from 10% to 4%. The goals the maker finds get shorter as walls go up (12.6 moves at the mean with none, 6.7 at 15%), with fewer decisions and a shorter run for red. Its push search stops at a wall, so it finds shallower goals, and walls take cells from blocks (at 15% walls a density-16 board has the block fill of density 8 without).</li>
<li>At the same proof length walls do not lower the share; if anything they raise it a little (proofs of 7-10 moves: 4% with none, 7-9% from 6% walls; at effort 2, proofs of 11-15: 6% to 17-23%, few goals). So a wall makes a goal of a given length more order-bound, but today's maker trades that for shorter goals.</li>
<li>Effort 2 (more candidates, wider measures; 60 boards a cell at 4 wall shares × densities 8, 12, 16) shows the same trend with walls, so it is not effort 0's narrow search alone.</li>
<li>Every board gave a legal goal, at every wall share and density.</li>
<li>Up to about 4% walls little changes at the game's density (moves, re-moved blocks, found rate as without): the game's walls slider starts there.</li>
<li>Smarter wall placement (walls that make dead ends red has to plan round, rather than walls anywhere) and a maker that looks for long goals on walled boards are what could make walls raise it; the Judge does not value re-moved blocks today.</li>
`;
const allRows: Row[] = [];
for (const f of files) for (const l of (await Bun.file(f).text()).split("\n")) if (l.startsWith("{")) allRows.push(JSON.parse(l));

/** One drag is one move: back-to-back slides of the same block merge (the maker's proofs
 * already are; this only makes sure). */
function merged(moves: Move[]): Move[] {
  const outm: Move[] = [];
  for (const m of moves) {
    const last = outm.at(-1);
    if (last && last.block === m.block) last.to = m.to;
    else outm.push({ block: m.block, from: { ...m.from }, to: { ...m.to } });
  }
  return outm.filter((m) => m.from.x !== m.to.x || m.from.y !== m.to.y);
}

/** The numbers derived from one goal's proof and board. */
function derive(r: Row) {
  const moves = merged(r.goal!.moves);
  const size = new Map(r.blocks!.map(([id, , , w, h]) => [id, { w, h }]));
  const at = new Map<string, string>(); // cell -> block
  const key = (x: number, y: number) => `${x},${y}`;
  const cellsOf = (id: string, p: { x: number; y: number }) => {
    const s = size.get(id)!, c: string[] = [];
    for (let x = p.x; x < p.x + s.w; x++) for (let y = p.y; y < p.y + s.h; y++) c.push(key(x, y));
    return c;
  };
  for (const [id, x, y] of r.blocks!) for (const c of cellsOf(id, { x, y })) at.set(c, id);
  // Times each block moves; returns (a block moved again after others moved: with merged
  // moves every repeat is one) and reversals (a block going back the way it came).
  const count = new Map<string, number>(), lastDir = new Map<string, number>();
  let reversals = 0;
  // Blocker graph: an edge A -> B when B's slide sweeps a cell A was the last to leave
  // (A moved out of B's way), from the proof's order alone.
  const vacated = new Map<string, string>();
  const edges = new Set<string>();
  for (const m of moves) {
    count.set(m.block, (count.get(m.block) ?? 0) + 1);
    const dir = Math.sign(m.to.x - m.from.x + m.to.y - m.from.y);
    if (lastDir.has(m.block) && lastDir.get(m.block) !== dir) reversals++;
    lastDir.set(m.block, dir);
    const before = new Set(cellsOf(m.block, m.from));
    const hz = m.from.y === m.to.y, lo = hz ? Math.min(m.from.x, m.to.x) : Math.min(m.from.y, m.to.y), hi = hz ? Math.max(m.from.x, m.to.x) : Math.max(m.from.y, m.to.y);
    for (let p = lo; p <= hi; p++) {
      for (const c of cellsOf(m.block, hz ? { x: p, y: m.from.y } : { x: m.from.x, y: p })) {
        if (before.has(c)) continue;
        const a = vacated.get(c);
        if (a && a !== m.block) edges.add(`${a}>${m.block}`);
      }
    }
    for (const c of before) if (at.get(c) === m.block) at.delete(c);
    const after = cellsOf(m.block, m.to);
    for (const c of after) at.set(c, m.block);
    for (const c of before) if (!after.includes(c)) vacated.set(c, m.block);
  }
  const nodes = [...count.keys()];
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const undirected = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const e of edges) {
    const [a, b] = e.split(">") as [string, string];
    adj.get(a)!.push(b);
    undirected.get(a)!.push(b);
    undirected.get(b)!.push(a);
  }
  let components = 0;
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n)) continue;
    components++;
    const stack = [n];
    seen.add(n);
    while (stack.length) for (const m of undirected.get(stack.pop()!)!) if (!seen.has(m)) seen.add(m), stack.push(m);
  }
  const reaches = (from: string, to: string) => {
    const s = new Set([from]), st = [from];
    while (st.length) for (const m of adj.get(st.pop()!)!) {
      if (m === to) return true;
      if (!s.has(m)) s.add(m), st.push(m);
    }
    return false;
  };
  const cycle = [...edges].some((e) => {
    const [a, b] = e.split(">") as [string, string];
    return reaches(b, a);
  });
  const counts = [...count.values()];
  const distance = r.terms!.distance;
  return {
    counts, max: Math.max(...counts), otherMax: Math.max(0, ...[...count].filter(([id]) => id !== r.goal!.red).map(([, c]) => c)), redMoves: count.get(r.goal!.red) ?? 0, blocksMoved: nodes.length,
    returns: counts.reduce((a, c) => a + c - 1, 0), reversals,
    edges: edges.size, cyclomatic: edges.size - nodes.length + components, cycle,
    detour: moves.length / Math.max(1, distance), moves: moves.length,
  };
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const share = (v: boolean[]) => (v.length ? v.filter(Boolean).length / v.length : null);
const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

// The sweep is at the lowest effort in the files; other efforts (a smaller check) are
// compared with it per wall share, densities pooled.
const efforts = [...new Set(allRows.map((r) => r.effort))].sort((a, b) => a - b);
const rows = allRows.filter((r) => r.effort === efforts[0]);
const wallsList = [...new Set(rows.map((r) => r.walls))].sort((a, b) => a - b);
const densities = [...new Set(rows.map((r) => r.density))].sort((a, b) => a - b);
const cells = [];
let maxCount = 1;
for (const w of wallsList) for (const d of densities) {
  const all = rows.filter((r) => r.walls === w && r.density === d);
  if (!all.length) continue;
  const goals = all.filter((r) => r.found && r.ok);
  const dv = goals.map((r) => ({ r, d: derive(r) }));
  const hist: number[] = [];
  for (const { d: x } of dv) for (const c of x.counts) {
    hist[c] = (hist[c] ?? 0) + 1;
    maxCount = Math.max(maxCount, c);
  }
  const goalMax: number[] = [];
  for (const { d: x } of dv) goalMax[x.max] = (goalMax[x.max] ?? 0) + 1;
  cells.push({
    walls: w, density: d, boards: all.length, goals: goals.length,
    blockFill: r3(mean(all.map((r) => r.census.blockCells / r.census.area))), wallFill: r3(mean(all.map((r) => r.census.wallCells / r.census.area))),
    hist: Array.from({ length: hist.length }, (_, i) => hist[i] ?? 0), goalMax: Array.from({ length: goalMax.length }, (_, i) => goalMax[i] ?? 0),
    m: {
      found: r3(all.filter((r) => r.found).length / all.length),
      legal: r3(goals.length / Math.max(1, all.filter((r) => r.found).length)),
      moves: r3(mean(goals.map((r) => r.terms!.moves))),
      exact: r3(share(goals.map((r) => r.maker!.fewest !== null))),
      decisions: r3(mean(goals.map((r) => r.terms!.decisions))),
      fitness: r3(median(goals.map((r) => r.terms!.fitness))),
      makerMs: r3(median(all.map((r) => r.ms.maker))),
      distance: r3(mean(goals.map((r) => r.terms!.distance))),
      repeat: r3(share(dv.map(({ d: x }) => x.max >= 2))),
      repeatOther: r3(share(dv.map(({ d: x }) => x.otherMax >= 2))),
      redRepeat: r3(share(dv.map(({ d: x }) => x.redMoves >= 2))),
      blocksMoved: r3(mean(dv.map(({ d: x }) => x.blocksMoved))),
      returns: r3(mean(dv.map(({ d: x }) => x.returns))),
      reversal: r3(share(dv.map(({ d: x }) => x.reversals > 0))),
      cyclomatic: r3(mean(dv.map(({ d: x }) => x.cyclomatic))),
      cycle: r3(share(dv.map(({ d: x }) => x.cycle))),
      detour: r3(median(dv.map(({ d: x }) => x.detour))),
    },
  });
}

const time = { gen: 0, maker: 0, referee: 0, judge: 0, choices: 0 };
for (const r of rows) for (const k of Object.keys(time) as (keyof typeof time)[]) time[k] += r.ms[k] ?? 0;
// Repeats at the same proof length: per wall share and length bucket, goals and those with
// a block moved 2+ times (all densities pooled).
const BUCKETS = [[1, 6], [7, 10], [11, 15], [16, 99]] as const;
const byLength = wallsList.map((w) => ({
  walls: w,
  b: BUCKETS.map(([lo, hi]) => {
    const dv = rows.filter((r) => r.walls === w && r.found && r.ok).map((r) => derive(r)).filter((x) => x.moves >= lo && x.moves <= hi);
    return { n: dv.length, repeat: dv.filter((x) => x.max >= 2).length, cycle: dv.filter((x) => x.cycle).length };
  }),
}));

// Each effort per wall share, on the densities every effort has.
const shared = densities.filter((d) => efforts.every((e) => allRows.some((r) => r.effort === e && r.density === d)));
const byEffort = efforts.length < 2 ? [] : efforts.flatMap((e) => [...new Set(allRows.filter((r) => r.effort === e).map((r) => r.walls))].sort((a, b) => a - b).map((w) => {
  const all = allRows.filter((r) => r.effort === e && r.walls === w && shared.includes(r.density));
  const goals = all.filter((r) => r.found && r.ok), dv = goals.map((r) => derive(r));
  return {
    effort: e, walls: w, boards: all.length, goals: goals.length,
    found: r3(goals.length / Math.max(1, all.length)), moves: r3(mean(goals.map((r) => r.terms!.moves))), decisions: r3(mean(goals.map((r) => r.terms!.decisions))),
    repeat: r3(share(dv.map((x) => x.max >= 2))), cycle: r3(share(dv.map((x) => x.cycle))), cyclomatic: r3(mean(dv.map((x) => x.cyclomatic))), makerMs: r3(median(all.map((r) => r.ms.maker))),
  };
}));
const data = { byLength, buckets: BUCKETS.map(([lo, hi]) => (hi > 50 ? lo + "+" : lo === 1 ? "≤" + hi : lo + "–" + hi)), byEffort, shared, cells, walls: wallsList, densities, maxCount, boards: rows.length, effort: [...new Set(rows.map((r) => r.effort))], time, files: files.map((f) => f.split("/").pop()) };
const date = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Walls and repeated moves</title>
<meta name="date" content="${date}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --empty: #f0efec;
    --s1: #86b6ef; --s2: #5598e7; --s3: #2a78d6; --s4: #1c5cab; --s5: #104281; --s6: #0d366b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --empty: #383835;
    --s1: #184f95; --s2: #1c5cab; --s3: #2a78d6; --s4: #3987e5; --s5: #6da7ec; --s6: #9ec5f4; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 18px; margin: 28px 0 8px; } h3 { font-size: 15px; margin: 0 0 4px; }
  .sub { color: var(--ink-2); margin: 0 0 12px; max-width: 76ch; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tile .big { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .tile .what { font-size: 13px; color: var(--ink-2); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--ink-2); margin-bottom: 6px; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; font-size: 13px; color: var(--ink-2); align-items: center; }
  .filters button { font: inherit; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 2px 10px; cursor: pointer; }
  .filters button.on { border-color: var(--ink-2); font-weight: 600; }
  .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }
  svg { display: block; width: 100%; height: auto; }
  svg text { fill: var(--ink-2); font-size: 11px; }
  svg text.v { font-size: 12px; font-variant-numeric: tabular-nums; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 9px; border-bottom: 1px solid var(--line); text-align: right; }
  th { color: var(--ink-2); font-weight: 600; }
  details { margin-top: 10px; } summary { cursor: pointer; color: var(--ink-2); }
  ul { padding-left: 20px; } li { max-width: 76ch; margin: 4px 0; }
  #tip { position: fixed; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font-size: 13px; display: none; max-width: 280px; box-shadow: 0 2px 8px #0002; }
</style></head><body><main>
<a class="back" href="./">← All reports</a>
<h1>Walls and repeated moves</h1>
<p class="sub">Does a good goal need blocks moved more than once, and do walls (fixed cells) in the generated world make that more common? Fresh boards swept over the share of cells that are walls × the block density (the layout's tries per 4×4 chunk; the game's is 12), today's maker asked for a goal round the origin as for the world's first, at effort <span id="effort"></span>, no ramp aim. Every number comes from the maker's own proof: no other search for a shorter one. <span id="count"></span></p>
<div class="tiles" id="tiles"></div>

<h2>What it shows</h2>
<ul id="shows">
${"<!--SHOWS-->"}
</ul>

<h2>How many times each block is moved</h2>
<p class="sub">Every block a proof moves, by how many times it moves in it (one move: one slide, however far; the red block included), as a share of the blocks moved, per wall share. Pick a block density, or all pooled.</p>
<div class="card">
  <div class="filters" id="histFilter">Block density:</div>
  <div class="legend" id="histLegend"></div>
  <svg id="hist" role="img" aria-label="Share of moved blocks by times moved, per wall share"></svg>
</div>
<h3 style="margin-top:14px">Goals with a block moved twice or more</h3>
<p class="sub">Share of goals where at least one block (red included) moves 2 or more times, by wall share, a line per block density.</p>
<div class="card"><div class="legend" id="lineLegend"></div><svg id="repeatLine" role="img" aria-label="Share of goals with a repeated block by wall share"></svg></div>

<h3 style="margin-top:14px">At the same proof length</h3>
<p class="sub">Goals with a block moved 2+ times, by the proof's length (rows) and the wall share (columns), all densities pooled: whether walls change how often blocks are re-moved, or only how long the goals are.</p>
<div class="card" id="byLength"></div>

<h2>Over the sweep</h2>
<p class="sub">Each map: wall share down, block density across (with the cells' actual fill under the labels: blocks, walls, round the origin). Darker is more; the number is the cell's value. Hover a cell for its counts.</p>
<div class="maps" id="maps"></div>

<h2>The derived numbers</h2>
<ul>
  <li><b>Repeated block</b>: a block moves 2 or more times in the proof. Exact for the proof; another shortest solution might move blocks fewer times (not searched).</li>
  <li><b>Back-and-forth</b>: the proof returns to a block it already left (with back-to-back slides of one block merged, every repeat is a return); <i>reversal</i>: a block slides back the way it came at some point. Both from the proof alone.</li>
  <li><b>Blocker graph</b> (approximation): an edge A → B when B's slide sweeps a cell A was the last block to leave, from the proof's order alone (not from which blocks truly had to move: a block that left a cell for some other reason still counts). Cyclomatic complexity = edges − nodes + components over the blocks moved, directed edges counted once each (A → B and B → A both count, so a pair that must take turns gives 1). <i>Directed cycle</i>: some block is, through the chain, in its own way.</li>
  <li><b>Detour</b>: the proof's moves per cell of red's straight distance (start to target), median.</li>
  <li><b>Fewest moves</b> is the proof's length (the Judge's moves term with no Auditor): the maker's window measure finds it exact for the share shown as "exact"; elsewhere it is an upper bound.</li>
  <li>Decisions and fitness are the Judge's (src/judge.ts) on the proof's length; maker time is the median of one process each, on the VM (2 processes on 2 cores).</li>
</ul>

<div id="effortCheck"></div>

<h2>Where the time goes</h2>
<div class="card"><table id="time"></table></div>

<h2>Every cell</h2>
<details><summary>The numbers, cell by cell</summary><div class="card" style="margin-top:8px"><table id="all"></table></div></details>
<div id="tip"></div>
<script>
const DATA = ${JSON.stringify(data)};
const $ = (id) => document.getElementById(id);
const pc = (x) => (x === null ? "–" : Math.round(100 * x) + "%");
const wl = (w) => Math.round(w * 1000) / 10 + "%";
const tip = $("tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.style.display = "none"; return; }
  tip.innerHTML = t.dataset.tip; tip.style.display = "block";
  tip.style.left = Math.min(innerWidth - 290, e.clientX + 14) + "px"; tip.style.top = e.clientY + 14 + "px";
});
$("effort").textContent = DATA.effort.join(", ");
const goals = DATA.cells.reduce((a, c) => a + c.goals, 0);
$("count").textContent = DATA.boards + " boards, " + goals + " goals (" + DATA.cells.length + " cells, about " + Math.round(DATA.boards / DATA.cells.length) + " boards each).";
const cell = (w, d) => DATA.cells.find((c) => c.walls === w && c.density === d);
const pool = (cs, f) => { const n = cs.reduce((a, c) => a + c.goals, 0); return n ? cs.reduce((a, c) => a + c.goals * (f(c) ?? 0), 0) / n : null; };
const W0 = DATA.walls[0], WN = DATA.walls.at(-1), D12 = DATA.densities.includes(12) ? 12 : DATA.densities[DATA.densities.length >> 1];
const byWall = (w) => DATA.cells.filter((c) => c.walls === w);
$("tiles").innerHTML = [
  [pc(pool(byWall(W0), (c) => c.m.repeat)), "goals with a block moved 2+ times, no walls (all densities)"],
  [pc(pool(byWall(WN), (c) => c.m.repeat)), "the same at " + wl(WN) + " walls"],
  [pc(pool(byWall(W0), (c) => c.m.cycle)), "goals with a directed blocker cycle, no walls"],
  [pc(pool(byWall(WN), (c) => c.m.cycle)), "the same at " + wl(WN) + " walls"],
  [(pool(byWall(W0), (c) => c.m.moves) ?? 0).toFixed(1) + " → " + (pool(byWall(WN), (c) => c.m.moves) ?? 0).toFixed(1), "proof moves (mean), no walls → " + wl(WN)],
].map(([v, w]) => '<div class="tile"><div class="big">' + v + '</div><div class="what">' + w + "</div></div>").join("");

const ramp = (i, n) => "var(--s" + (n <= 1 ? 3 : 1 + Math.round((i * 5) / (n - 1))) + ")";
// The histogram: grouped bars, x times moved, a bar per wall share.
let histD = "all", zoom = true;
function hist() {
  const cs = (w) => DATA.cells.filter((c) => c.walls === w && (histD === "all" || c.density === histD));
  const K = DATA.maxCount, Wn = DATA.walls.length;
  const series = DATA.walls.map((w) => {
    const h = []; let tot = 0;
    for (const c of cs(w)) c.hist.forEach((v, k) => { h[k] = (h[k] || 0) + v; tot += v; });
    return { w, tot, v: Array.from({ length: K + 1 }, (_, k) => (tot ? (h[k] || 0) / tot : 0)), n: h };
  });
  const W = 900, H = 320, L = 44, R = 10, T = 12, B = 34;
  const top = Math.max(0.05, ...series.flatMap((s) => (zoom ? s.v.slice(2) : s.v))) * (zoom ? 1.1 : 1), step = top > 0.5 ? 0.2 : top > 0.2 ? 0.1 : 0.05;
  const gw = (W - L - R) / K, bw = Math.max(2, (gw - 10) / Wn - 2);
  const y = (v) => T + (1 - v / top) * (H - T - B);
  let s = "";
  for (let v = 0; v <= top + 1e-9; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + "%</text>";
  for (let k = 1; k <= K; k++) {
    const x0 = L + (k - 1) * gw + 5;
    s += '<text x="' + (x0 + (gw - 10) / 2) + '" y="' + (H - 14) + '" text-anchor="middle">' + k + (k === 1 ? " time" : "") + "</text>";
    series.forEach((se, i) => {
      const v = se.v[k], x = x0 + i * (bw + 2), h = Math.max(0, y(0) - y(Math.min(v, top)));
      if (v > 0) s += '<path d="M' + x + "," + y(0) + "v" + -Math.max(0, h - 3) + "q0,-3 3,-3h" + (bw - 6) + "q3,0 3,3v" + Math.max(0, h - 3) + 'z" fill="' + ramp(i, Wn) + '"/>';
      s += '<rect x="' + x + '" y="' + T + '" width="' + (bw + 2) + '" height="' + (H - T - B) + '" fill="transparent" data-tip="' + wl(se.w) + " walls, moved " + k + " times: " + (100 * v).toFixed(1) + "% of " + se.tot + ' moved blocks (' + (se.n[k] || 0) + ')"/>';
    });
  }
  s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 1) + '" text-anchor="middle">times the block is moved in the proof</text>';
  $("hist").setAttribute("viewBox", "0 0 " + W + " " + H);
  $("hist").innerHTML = s;
}
$("histFilter").innerHTML += ["all", ...DATA.densities].map((d) => '<button data-d="' + d + '"' + (d === "all" ? ' class="on"' : "") + ">" + (d === "all" ? "All" : d) + "</button>").join("");
$("histFilter").innerHTML += ' <span style="margin-left:12px">Scale:</span> <button data-z="0">Full</button><button data-z="1" class="on">Zoom on 2+ (1 clipped)</button>';
$("histFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.z !== undefined) {
    zoom = b.dataset.z === "1";
    for (const x of $("histFilter").querySelectorAll("button[data-z]")) x.classList.toggle("on", x === b);
    return hist();
  }
  histD = b.dataset.d === "all" ? "all" : Number(b.dataset.d);
  for (const x of $("histFilter").querySelectorAll("button[data-d]")) x.classList.toggle("on", x === b);
  hist();
});
$("histLegend").innerHTML = DATA.walls.map((w, i) => '<span><i style="background:' + ramp(i, DATA.walls.length) + '"></i>' + wl(w) + " walls</span>").join("");
hist();

// Share with a repeated block: wall share across, a line per density.
(function () {
  const W = 900, H = 260, L = 44, R = 70, T = 12, B = 30, Dn = DATA.densities.length;
  const xs = DATA.walls, xmax = Math.max(...xs) || 1;
  const x = (w) => L + (w / xmax) * (W - L - R), y = (v) => T + (1 - v) * (H - T - B);
  let s = "";
  const used = [];
  for (let v = 0; v <= 1.0001; v += 0.2) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v * 100) + "%</text>";
  for (const w of xs) s += '<text x="' + x(w) + '" y="' + (H - 8) + '" text-anchor="middle">' + wl(w) + "</text>";
  DATA.densities.forEach((d, i) => {
    const pts = xs.map((w) => [w, cell(w, d)]).filter(([, c]) => c && c.m.repeat !== null);
    s += '<polyline points="' + pts.map(([w, c]) => x(w) + "," + y(c.m.repeat)).join(" ") + '" fill="none" stroke="' + ramp(i, Dn) + '" stroke-width="2"/>';
    for (const [w, c] of pts) s += '<circle cx="' + x(w) + '" cy="' + y(c.m.repeat) + '" r="4" fill="' + ramp(i, Dn) + '" stroke="var(--card)" stroke-width="2"/><circle cx="' + x(w) + '" cy="' + y(c.m.repeat) + '" r="10" fill="transparent" data-tip="density ' + d + ", " + wl(w) + " walls: " + pc(c.m.repeat) + " of " + c.goals + ' goals"/>';
    const last = pts.at(-1);
    if (last) used.push({ y: y(last[1].m.repeat) + 4, x: x(last[0]) + 8, d });
  });
  // The end labels, kept 12 px apart and inside the plot.
  used.sort((a, b) => a.y - b.y);
  for (let i = 1; i < used.length; i++) used[i].y = Math.max(used[i].y, used[i - 1].y + 12);
  const over = used.length ? used.at(-1).y - (H - B + 4) : 0;
  if (over > 0) for (const u of used) u.y -= over;
  for (let i = used.length - 2; i >= 0; i--) used[i].y = Math.min(used[i].y, used[i + 1].y - 12);
  for (const u of used) s += '<text x="' + u.x + '" y="' + u.y + '">density ' + u.d + "</text>";
  $("repeatLine").setAttribute("viewBox", "0 0 " + W + " " + H);
  $("repeatLine").innerHTML = s;
  $("lineLegend").innerHTML = DATA.densities.map((d, i) => '<span><i style="background:' + ramp(i, Dn) + '"></i>density ' + d + "</span>").join("");
})();

const MAPS = [
  ["repeat", "Goals with a block moved 2+ times", pc],
  ["repeatOther", "Goals with a block other than red moved 2+ times", pc],
  ["redRepeat", "Goals with red moved 2+ times", pc],
  ["cycle", "Goals with a directed blocker cycle", pc],
  ["cyclomatic", "Blocker-graph cyclomatic complexity (mean)", (v) => v.toFixed(2)],
  ["reversal", "Goals with a reversal (back-and-forth)", pc],
  ["returns", "Returns to a block already left (mean)", (v) => v.toFixed(2)],
  ["detour", "Detour: moves per cell of red's distance (median)", (v) => v.toFixed(2)],
  ["found", "Found rate", pc],
  ["moves", "Fewest moves: the proof's (mean)", (v) => v.toFixed(1)],
  ["exact", "Proof's length exact in the maker's window", pc],
  ["decisions", "Decisions (mean)", (v) => v.toFixed(1)],
  ["fitness", "Fitness (median)", (v) => v.toFixed(2)],
  ["makerMs", "Maker time, ms (median)", (v) => Math.round(v)],
  ["blocksMoved", "Blocks moved (mean)", (v) => v.toFixed(1)],
  ["distance", "Red's distance, cells (mean)", (v) => v.toFixed(1)],
];
function heat(key, title, fmt) {
  const Dn = DATA.densities.length, Wn = DATA.walls.length;
  const W = 300, L = 46, T = 34, cw = (W - L - 4) / Dn, ch = 26, H = T + Wn * ch + 4;
  const vals = DATA.cells.map((c) => c.m[key]).filter((v) => v !== null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  let s = "";
  DATA.densities.forEach((d, j) => {
    const any = DATA.cells.filter((c) => c.density === d);
    s += '<text x="' + (L + (j + 0.5) * cw) + '" y="12" text-anchor="middle">' + d + '</text><text x="' + (L + (j + 0.5) * cw) + '" y="26" text-anchor="middle" style="font-size:9px">' + Math.round(100 * any[0].blockFill) + "%</text>";
  });
  DATA.walls.forEach((w, i) => {
    s += '<text x="' + (L - 6) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end">' + wl(w) + "</text>";
    DATA.densities.forEach((d, j) => {
      const c = cell(w, d), v = c ? c.m[key] : null;
      const t = v === null || hi === lo ? 0 : (v - lo) / (hi - lo);
      const fill = v === null ? "var(--empty)" : "color-mix(in oklab, var(--s6) " + Math.round(8 + 92 * t) + "%, var(--empty))";
      s += '<rect x="' + (L + j * cw + 1) + '" y="' + (T + i * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="3" fill="' + fill + '" data-tip="density ' + d + ", " + wl(w) + " walls (fill: blocks " + (c ? pc(c.blockFill) : "") + ", walls " + (c ? pc(c.wallFill) : "") + ")<br>" + title + ": <b>" + (v === null ? "–" : fmt(v)) + "</b><br>" + (c ? c.goals + " goals of " + c.boards + " boards" : "") + '"/>';
      if (v !== null) s += '<text class="v" x="' + (L + (j + 0.5) * cw) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="middle" style="fill:' + (t > 0.55 ? "#fff" : "var(--ink)") + ';pointer-events:none">' + fmt(v) + "</text>";
    });
  });
  return '<div class="card"><h3>' + title + '</h3><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + title + '">' + s + "</svg></div>";
}
$("maps").innerHTML = MAPS.map((m) => heat(...m)).join("");

(function () {
  const W = 900, L = 70, T = 22, cw = (W - L - 4) / DATA.walls.length, ch = 30, H = T + DATA.buckets.length * ch + 4;
  let s = "";
  DATA.walls.forEach((w, j) => { s += '<text x="' + (L + (j + 0.5) * cw) + '" y="14" text-anchor="middle">' + wl(w) + " walls</text>"; });
  DATA.buckets.forEach((b, i) => {
    s += '<text x="' + (L - 6) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end">' + b + " moves</text>";
    DATA.byLength.forEach((c, j) => {
      const x = c.b[i], v = x.n ? x.repeat / x.n : null;
      const fill = v === null ? "var(--empty)" : "color-mix(in oklab, var(--s6) " + Math.round(8 + 92 * v) + "%, var(--empty))";
      s += '<rect x="' + (L + j * cw + 1) + '" y="' + (T + i * ch + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="3" fill="' + fill + '" data-tip="' + wl(c.walls) + " walls, proofs of " + b + " moves: " + (v === null ? "none" : pc(v) + " with a block moved 2+ times, " + pc(x.cycle / x.n) + " with a directed cycle") + "<br>" + x.n + ' goals"/>';
      if (v !== null) s += '<text class="v" x="' + (L + (j + 0.5) * cw) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="middle" style="fill:' + (v > 0.5 ? "#fff" : "var(--ink)") + ';pointer-events:none">' + pc(v) + ' <tspan style="font-size:10px;opacity:.7">(' + x.n + ")</tspan></text>";
    });
  });
  $("byLength").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Repeated blocks by proof length and wall share">' + s + "</svg>";
})();
if (DATA.byEffort.length) $("effortCheck").innerHTML = "<h2>A harder-working maker</h2><p class='sub'>The same boards at a higher effort (more candidates, wider measures), on densities " + DATA.shared.join(", ") + " pooled, against the sweep's effort: whether the trend is the maker's or the boards'.</p><div class='card'><table><tr><th>Effort</th><th>Walls</th><th>Boards</th><th>Found</th><th>Moves (mean)</th><th>Decisions (mean)</th><th>Block moved 2+</th><th>Directed cycle</th><th>Cyclomatic (mean)</th><th>Maker ms (median)</th></tr>" +
  DATA.byEffort.map((r) => "<tr><td>" + r.effort + "</td><td>" + wl(r.walls) + "</td><td>" + r.boards + "</td><td>" + pc(r.found) + "</td><td>" + r.moves.toFixed(1) + "</td><td>" + r.decisions.toFixed(1) + "</td><td>" + pc(r.repeat) + "</td><td>" + pc(r.cycle) + "</td><td>" + r.cyclomatic.toFixed(2) + "</td><td>" + Math.round(r.makerMs) + "</td></tr>").join("") + "</table></div>";
const T = DATA.time, tt = Object.values(T).reduce((a, b) => a + b, 0);
$("time").innerHTML = "<tr><th style='text-align:left'>Step</th><th>Total s (all processes)</th><th>Share</th></tr>" +
  [["gen", "Generating the board (the chunks round the origin)"], ["maker", "The maker (push search, rough and exact measures)"], ["referee", "The Referee"], ["judge", "The Judge (decisions included)"], ["choices", "Choices along the proof"]]
    .map(([k, w]) => "<tr><td style='text-align:left'>" + w + "</td><td>" + (T[k] / 1000).toFixed(1) + "</td><td>" + (100 * T[k] / tt).toFixed(1) + "%</td></tr>").join("");

const cols = MAPS.map((m) => m[0]);
$("all").innerHTML = "<tr><th>Walls</th><th>Density</th><th>Boards</th><th>Goals</th><th>Block fill</th><th>Wall fill</th>" + MAPS.map((m) => "<th>" + m[0] + "</th>").join("") + "</tr>" +
  DATA.cells.map((c) => "<tr><td>" + wl(c.walls) + "</td><td>" + c.density + "</td><td>" + c.boards + "</td><td>" + c.goals + "</td><td>" + pc(c.blockFill) + "</td><td>" + pc(c.wallFill) + "</td>" + MAPS.map(([k, , f]) => "<td>" + (c.m[k] === null ? "–" : f(c.m[k])) + "</td>").join("") + "</tr>").join("");
</script>
</main></body></html>
`;
await Bun.write(out!, html.replace("<!--SHOWS-->", SHOWS.trim()));
console.log(`wrote ${out}: ${rows.length} boards, ${cells.length} cells`);
