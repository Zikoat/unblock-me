// reports/walls.html from the experiments' JSONL files alone (every derived number is worked
// out here, nothing is searched again): walls.ts's goals (the sweep, and a smaller one at
// another effort), walls-candidates.ts's candidates (kind "candidates") and walls-profile.ts's
// profiles (kind "profile"):
//   bun test/experiments/walls-report.ts reports/walls.html data/walls/high.jsonl data/walls/effort2.jsonl data/walls/cand-*.jsonl data/walls/profile.jsonl
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
<li>The gut feeling holds for long goals, not for walls. Blocks moved twice or more come with long proofs: about 90% of proofs over 15 moves have one, about a third of those of 11-15, under 10% of shorter ones, whatever the walls. Block density is what makes proofs long: with no walls the share of goals with a re-moved block goes from 4% at density 6 to 64% at 16.</li>
<li>Random walls make re-moved blocks rarer: from 35% of goals with no walls to 10% at 15% walls (all densities), and goals with a directed blocker cycle from 10% to 4%. The goals get shorter (12.6 moves at the mean to 6.7), with fewer decisions and a shorter run for red.</li>
<li>Not because of the selection. Among all the candidates the maker weighs, 11% have a re-moved block with no walls; among its 3 finalists 28%; among the goals it picks 43%. The same rise holds at every wall share (15% walls: 4%, 8%, 12%). At the same proof length, candidates with a re-moved block reach the finals up to 5 times as often as the rest (about as often for long candidates at 8-15% walls), the Judge's fitness for them is 1.2 to 2 times higher (one exception: 16+ moves at 15% walls, with only 5 candidates on the other side), and their decision count is about the same (−0.8 to +0.7). The rank and the Judge favour them or are even; neither the decision count's stopping rule nor any other term holds them back.</li>
<li>It is the pool. Walls shrink what the push search can find, since a push stops at a wall: 131 candidates a board with no walls, 41 at 15%; the mean candidate goes from 7.4 to 4.1 moves, each board's longest from 21 to 12, and candidates of 11 or more moves from 23% to 5%. The pick still takes the long ones (62% of chosen goals have 11+ moves with no walls, 11% at 15%), but there are fewer to take.</li>
<li>At the same proof length walls do not lower the share; if anything they raise it a little (proofs of 7-10 moves: 4% with none, 7-9% from 6% walls; candidates of 11-15 moves: 31% with none, 48% at 15%). So a wall makes a goal of a given length more order-bound, but walls placed at random cut the long goals out of reach.</li>
<li>Effort 2 (more candidates, wider measures; 60 boards a cell at 4 wall shares × densities 8, 12, 16) shows the same trend, so it is not effort 0's narrow search alone.</li>
<li>Every board gave a legal goal, at every wall share and density. Up to about 4% walls little changes at the game's density, so the game's walls slider starts there.</li>
<li>Time: the maker is 99% of it, and the measure's lower bound (window.ts) is 61-66% of the maker, the rest of A* 16-18%; by step, the rough measure of every candidate takes about two thirds. Walls make all of it cheaper (212 ms a board with none, 32 at 15%).</li>
`;
type CMove = [string, number, number, number, number];
type CandRow = {
  kind: "candidates"; walls: number; density: number; seed: number; makerMs: number; steps: Record<string, number>;
  chosen: { proof: CMove[]; terms: { moves: number; fitness: number; decisions: number } } | null;
  finals: { proof: CMove[]; fitness: number | null }[];
  candidates: { rank: number; finalist: boolean; proof: CMove[]; shortest?: CMove[]; terms: { moves: number; decisions: number; fitness: number; balance: number } }[];
};
type ProfileRow = { kind: "profile"; walls: number; density: number; ms: Record<string, number> };
const allRows: Row[] = [], candRows: CandRow[] = [], profiles: ProfileRow[] = [];
for (const f of files) for (const l of (await Bun.file(f).text()).split("\n")) {
  if (!l.startsWith("{")) continue;
  const r = JSON.parse(l);
  if (r.kind === "candidates") candRows.push(r);
  else if (r.kind === "profile") profiles.push(r);
  else allRows.push(r);
}

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

// The sweep's time per board by wall share (densities pooled): the maker and the rest.
const timeByWall = wallsList.map((w) => {
  const rs = rows.filter((r) => r.walls === w), n = Math.max(1, rs.length);
  const sum = (k: keyof Row["ms"]) => r3(rs.reduce((a, r) => a + (r.ms[k] ?? 0), 0) / n);
  return { walls: w, boards: rs.length, parts: { "The maker": sum("maker"), "Board generation": sum("gen"), "The Referee": sum("referee"), "The Judge": sum("judge"), "Choices along the proof": sum("choices") } };
});

// Candidates: a proof's moves (back-to-back slides of one block merged) and the most times a
// block moves in it. A candidate's proof is the rough measure's shortest when it found one,
// else its push proof; a finalist's and the chosen goal's are after the exact measure.
function shape(proof: CMove[]): { n: number; max: number } {
  const outm: CMove[] = [];
  for (const m of proof) {
    const last = outm.at(-1);
    if (last && last[0] === m[0]) outm[outm.length - 1] = [m[0], last[1], last[2], m[3], m[4]];
    else outm.push([...m]);
  }
  const kept = outm.filter((m) => m[1] !== m[3] || m[2] !== m[4]);
  const count = new Map<string, number>();
  for (const m of kept) count.set(m[0], (count.get(m[0]) ?? 0) + 1);
  return { n: kept.length, max: Math.max(0, ...count.values()) };
}
const candWalls = [...new Set(candRows.map((r) => r.walls))].sort((a, b) => a - b);
const candDensity = [...new Set(candRows.map((r) => r.density))];
const candidates = candWalls.map((w) => {
  const rs = candRows.filter((r) => r.walls === w && r.chosen);
  const cs = rs.flatMap((r) => r.candidates.map((c) => ({ ...shape(c.shortest ?? c.proof), finalist: c.finalist, t: c.terms })));
  const fs = rs.flatMap((r) => r.finals.map((f) => shape(f.proof)));
  const ch = rs.map((r) => shape(r.chosen!.proof));
  // Where the chosen goal's length stands in its own board's candidates: the share shorter.
  const standing = rs.map((r) => {
    const n = shape(r.chosen!.proof).n, lens = r.candidates.map((c) => shape(c.shortest ?? c.proof).n);
    return lens.filter((l) => l < n).length / Math.max(1, lens.length);
  });
  const re = (x: { max: number }) => x.max >= 2;
  return {
    walls: w, boards: rs.length, perBoard: r3(cs.length / Math.max(1, rs.length)),
    length: {
      candidates: r3(mean(cs.map((c) => c.n))), longest: r3(mean(rs.map((r) => Math.max(...r.candidates.map((c) => shape(c.shortest ?? c.proof).n))))),
      finalists: r3(mean(fs.map((f) => f.n))), chosen: r3(mean(ch.map((c) => c.n))), standing: r3(mean(standing)),
    },
    stage: { candidates: r3(share(cs.map(re))), finalists: r3(share(fs.map(re))), chosen: r3(share(ch.map(re))) },
    long: { candidates: r3(share(cs.map((c) => c.n >= 11))), chosen: r3(share(ch.map((c) => c.n >= 11))) },
    buckets: BUCKETS.map(([lo, hi]) => {
      const b = cs.filter((c) => c.n >= lo && c.n <= hi), yes = b.filter(re), no = b.filter((c) => !re(c));
      const fin = (l: typeof b) => (l.length ? r3(l.filter((c) => c.finalist).length / l.length) : null);
      return {
        n: b.length, re: yes.length, share: r3(share(b.map(re))),
        finalRe: fin(yes), finalNo: fin(no),
        fitRe: r3(median(yes.map((c) => c.t.fitness))), fitNo: r3(median(no.map((c) => c.t.fitness))),
        decRe: r3(mean(yes.map((c) => c.t.decisions))), decNo: r3(mean(no.map((c) => c.t.decisions))),
      };
    }),
    steps: Object.fromEntries(["pushes", "rough", "exact", "picked"].map((k) => [k, r3(rs.reduce((a, r) => a + (r.steps[k] ?? 0), 0) / Math.max(1, rs.length))])),
  };
});
const profile = profiles.sort((a, b) => a.walls - b.walls).map((p) => {
  const n = Math.max(1, candRows.filter((r) => r.walls === p.walls && r.density === p.density).length);
  return { walls: p.walls, density: p.density, boards: n, parts: Object.fromEntries(Object.entries(p.ms).map(([k, v]) => [k, r3(v / n)])) };
});
const data = {
  byLength, buckets: BUCKETS.map(([lo, hi]) => (hi > 50 ? lo + "+" : lo === 1 ? "≤" + hi : lo + "–" + hi)), byEffort, shared, cells, walls: wallsList, densities, maxCount,
  boards: rows.length, effort: [...new Set(rows.map((r) => r.effort))], timeByWall, candidates, candDensity, profile,
};
const date = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Walls and repeated moves</title>
<meta name="date" content="${date}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --empty: #f0efec;
    --lo: #e3eefc; --hi: #0d366b; --hi-ink: #ffffff; --neg: #e34948; --mid: #f0efec;
    --c1: #2a78d6; --c2: #eb6834; --c3: #1baf7a; --c4: #eda100; --c5: #e87ba4; --c6: #008300; --c7: #6250d6; --c8: #e34948; --c0: #a3a29b;
    --o1: #86b6ef; --o2: #6da7ec; --o3: #5598e7; --o4: #3987e5; --o5: #2a78d6; --o6: #1c5cab; --o7: #104281; --o8: #0d366b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --empty: #383835;
    --lo: #1e2836; --hi: #9ec5f4; --hi-ink: #0b0b0b; --neg: #e66767; --mid: #383835;
    --c1: #3987e5; --c2: #d95926; --c3: #199e70; --c4: #c98500; --c5: #d55181; --c6: #008300; --c7: #9085e9; --c8: #e66767; --c0: #6b6a64;
    --o1: #184f95; --o2: #1c5cab; --o3: #256abf; --o4: #2a78d6; --o5: #3987e5; --o6: #5598e7; --o7: #86b6ef; --o8: #b7d3f6; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 19px; margin: 34px 0 8px; } h3 { font-size: 15px; margin: 18px 0 2px; }
  .sub { color: var(--ink-2); margin: 0 0 10px; max-width: 80ch; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tile .big { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .tile .what { font-size: 13px; color: var(--ink-2); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; margin-bottom: 10px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 13px; color: var(--ink-2); margin: 2px 0 6px; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; font-size: 13px; color: var(--ink-2); align-items: center; }
  .filters button { font: inherit; border: 1px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 8px; padding: 2px 10px; cursor: pointer; }
  .filters button.on { border-color: var(--ink-2); font-weight: 600; }
  .maps { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 10px; }
  .maps .card { margin: 0; }
  .what { font-size: 13px; color: var(--ink-2); margin: 0 0 4px; }
  svg { display: block; width: 100%; height: auto; }
  svg text { fill: var(--ink-2); font-size: 11px; }
  svg text.t { fill: var(--ink); font-size: 12px; font-weight: 600; }
  svg text.v { font-size: 11px; font-variant-numeric: tabular-nums; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 9px; border-bottom: 1px solid var(--line); text-align: right; }
  th { color: var(--ink-2); font-weight: 600; }
  details { margin-top: 10px; } summary { cursor: pointer; color: var(--ink-2); }
  ul { padding-left: 20px; } li { max-width: 80ch; margin: 4px 0; }
  #tip { position: fixed; pointer-events: none; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; font-size: 13px; display: none; max-width: 300px; box-shadow: 0 2px 8px #0002; z-index: 2; }
</style></head><body><main>
<a class="back" href="./">← All reports</a>
<h1>Walls and repeated moves</h1>
<p class="sub">Does a good goal need blocks moved more than once, and do walls (fixed 1×1 cells) in the generated world make that more common? Fresh boards are swept over two things: the <b>wall share</b> (the share of cells that are walls) and the <b>block density</b> (the layout's tries per 4×4 chunk; the game uses 12). Today's maker is asked for a goal round the origin, as for the world's first, at effort <span id="effort"></span>, with no ramp aim. Every number comes from the maker's own proof: no other search for a shorter one. <span id="count"></span></p>
<div class="tiles" id="tiles"></div>

<h2>What it shows</h2>
<ul>
<!--SHOWS-->
</ul>

<h2>How many times each block is moved</h2>
<p class="sub">One histogram per sweep cell: rows are the wall share, columns the block density. In each, a bar per number of times a block moves in the proof (one move is one slide, however far; the red block included), as a share of all the blocks the cell's proofs move. The number in each panel's corner is the share of goals with a block moved 2 or more times. Every panel uses the same y scale.</p>
<div class="card">
  <div class="filters" id="histFilter">Bar for blocks moved once: <button data-one="0" class="on">Hidden (it is 93-97% everywhere)</button><button data-one="1">Shown</button></div>
  <svg id="hist" role="img" aria-label="Histograms of times each block is moved, by wall share and block density"></svg>
</div>

<h3>Goals with a block moved twice or more</h3>
<p class="what">x: the wall share (% of cells that are walls). y: the share of goals whose proof moves at least one block 2 or more times. A line per block density.</p>
<div class="card"><div class="legend" id="repeatLegend"></div><svg id="repeatLine" role="img" aria-label="Share of goals with a re-moved block by wall share, a line per block density"></svg></div>

<h3>At the same proof length</h3>
<p class="what">Each cell: the share of goals with a block moved 2+ times, among proofs of that many moves (row) at that wall share (column), all densities pooled; the count of goals is under it. Walls barely change it at a given length.</p>
<div class="card" id="byLength"></div>

<h2>Over the sweep</h2>
<p class="sub">Each map: wall share down (% of cells), block density across (tries per 4×4 chunk, with the block fill round the origin under it). The number in a cell is its value; the colour follows the scale under each map (darker is more). Hover a cell for its counts.</p>
<div class="maps" id="maps"></div>

<h2>A harder-working maker</h2>
<p class="sub">The same boards at effort 2 (more candidates, wider measures) next to effort 0, on block densities <span id="sharedD"></span> pooled: whether the trend is the maker's narrow search or the boards'.</p>
<div class="maps" id="effortCharts"></div>

<h2>Candidates or selection?</h2>
<p class="sub">Do re-moved blocks get rarer with walls because the maker's selection (its rank, then the Judge's fitness among its finalists) passes them over, or because walls leave fewer of them among the goals it can find at all? Every candidate the maker weighs was recorded with its proof and the Judge's terms (walls-candidates.ts: <span id="candN"></span> boards at block density <span id="candD"></span>). The maker measures every candidate roughly, ranks them, measures the best 3 (its finalists) exactly, and picks one by the Judge's fitness.</p>
<div id="candidates"></div>

<h2>Where the time goes</h2>
<p class="sub">First the whole sweep, per board: the maker against everything else the experiment runs. Then inside the maker, from a CPU profile of the candidate runs (each sample counted for the deepest function on its stack that names a part; the experiment's own Judge calls on every candidate are kept apart).</p>
<div id="time"></div>

<h2>The derived numbers</h2>
<ul>
  <li><b>Re-moved block</b>: a block moves 2 or more times in the proof. Exact for the proof; another shortest solution might move blocks fewer times (not searched).</li>
  <li><b>Back-and-forth</b>: the proof returns to a block it already left (with back-to-back slides of one block merged, every repeat is a return); <i>reversal</i>: a block slides back the way it came at some point. Both from the proof alone.</li>
  <li><b>Blocker graph</b> (approximation): an edge A → B when B's slide sweeps a cell A was the last block to leave, from the proof's order alone (not from which blocks truly had to move: a block that left a cell for some other reason still counts). Cyclomatic complexity = edges − nodes + components over the blocks moved, directed edges counted once each (A → B and B → A both count, so a pair that must take turns gives 1). <i>Directed cycle</i>: some block is, through the chain, in its own way.</li>
  <li><b>Detour</b>: the proof's moves per cell of red's straight distance (start to target), median.</li>
  <li><b>Fewest moves</b> is the proof's length (the Judge's moves term, no Auditor): the maker's window measure finds it exact for the share shown as "exact"; elsewhere it is an upper bound.</li>
  <li>Decisions and fitness are the Judge's (src/judge.ts) on the proof's length; maker time is the median of one process each, on the VM (2 processes on 2 cores).</li>
  <li>Candidates: a candidate's proof is the rough measure's shortest where it found one, else the push search's; the finalists' and the chosen goal's are after the exact measure, so they can be shorter than as candidates.</li>
</ul>

<h2>Every cell</h2>
<details><summary>The numbers, cell by cell</summary><div class="card" style="margin-top:8px"><table id="all"></table></div></details>
<div id="tip"></div>
<script>
const DATA = ${JSON.stringify(data)};
const $ = (id) => document.getElementById(id);
const pc = (x) => (x === null || x === undefined ? "–" : Math.round(100 * x) + "%");
const wl = (w) => Math.round(w * 1000) / 10 + "%";
const esc = (s) => String(s).replace(/"/g, "&quot;");
const tip = $("tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.style.display = "none"; return; }
  tip.innerHTML = t.dataset.tip; tip.style.display = "block";
  tip.style.left = Math.min(innerWidth - 310, e.clientX + 14) + "px"; tip.style.top = e.clientY + 14 + "px";
});
/** An ordinal colour (light to dark with the value), the i-th of n. */
const ord = (i, n) => "var(--o" + (n <= 1 ? 5 : 1 + Math.round((i * 7) / (n - 1))) + ")";
const cat = (i) => "var(--c" + (i + 1) + ")";
const legend = (items) => items.map(([name, color]) => '<span><i style="background:' + color + '"></i>' + name + "</span>").join("");
const nice = (top) => { const raw = top / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

/** Axes with titles: y grid lines and ticks, the x title under, the y title turned. */
function frame(o) {
  const { W, H, L, R, T, B, yMax, yFmt, xTitle, yTitle } = o, step = nice(yMax);
  const y = (v) => T + (1 - v / yMax) * (H - T - B);
  let s = "";
  for (let v = 0; v <= yMax + 1e-9; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + yFmt(v) + "</text>";
  s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="t">' + xTitle + "</text>";
  s += '<text transform="translate(13,' + (T + (H - T - B) / 2) + ') rotate(-90)" text-anchor="middle" class="t">' + yTitle + "</text>";
  return { s, y };
}

/** Lines over the wall share (x by value): series [{ name, color, pts: [[x, y, tip]] }]. */
function lines(el, o) {
  const W = o.W || 900, H = o.H || 290, L = 64, R = 96, T = 12, B = 46;
  const xs = o.xs, xmax = Math.max(...xs) || 1, x = (v) => L + (v / xmax) * (W - L - R);
  const yMax = o.yMax ?? Math.max(...o.series.flatMap((s) => s.pts.map((p) => p[1]))) * 1.1;
  const f = frame({ W, H, L, R, T, B, yMax, yFmt: o.yFmt, xTitle: o.xTitle, yTitle: o.yTitle });
  let s = f.s;
  for (const v of xs) s += '<text x="' + x(v) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + o.xFmt(v) + "</text>";
  const ends = [];
  for (const se of o.series) {
    s += '<polyline points="' + se.pts.map((p) => x(p[0]) + "," + f.y(p[1])).join(" ") + '" fill="none" stroke="' + se.color + '" stroke-width="2"/>';
    for (const p of se.pts) s += '<circle cx="' + x(p[0]) + '" cy="' + f.y(p[1]) + '" r="4" fill="' + se.color + '" stroke="var(--card)" stroke-width="2"/><circle cx="' + x(p[0]) + '" cy="' + f.y(p[1]) + '" r="11" fill="transparent" data-tip="' + esc(p[2]) + '"/>';
    const last = se.pts.at(-1);
    if (last) ends.push({ x: x(last[0]) + 8, y: f.y(last[1]) + 4, name: se.name });
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 12);
  const over = ends.length ? ends.at(-1).y - (H - B + 2) : 0;
  if (over > 0) for (const e of ends) e.y -= over;
  for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - 12);
  for (const e of ends) s += '<text x="' + e.x + '" y="' + e.y + '">' + e.name + "</text>";
  el.innerHTML = (o.series.length > 1 ? '<div class="legend">' + legend(o.series.map((se) => [se.name, se.color])) + "</div>" : "") + '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.yTitle + " by " + o.xTitle) + '">' + s + "</svg>";
}

/** Grouped bars: groups along x, a bar per series in each. */
function bars(el, o) {
  const W = o.W || 900, H = o.H || 280, L = 64, R = 10, T = 14, B = 46, G = o.groups.length, S = o.series.length;
  const yMax = o.yMax ?? Math.max(...o.series.flatMap((s) => s.values.filter((v) => v !== null))) * 1.15;
  const f = frame({ W, H, L, R, T, B, yMax, yFmt: o.yFmt, xTitle: o.xTitle, yTitle: o.yTitle });
  let s = f.s;
  const gw = (W - L - R) / G, bw = Math.min(40, (gw - 16) / S - 2);
  o.groups.forEach((g, i) => {
    const x0 = L + i * gw + (gw - S * (bw + 2)) / 2;
    s += '<text x="' + (L + (i + 0.5) * gw) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + g + "</text>";
    o.series.forEach((se, j) => {
      const v = se.values[i];
      if (v === null || v === undefined) return;
      const x = x0 + j * (bw + 2), h = Math.max(0, f.y(0) - f.y(v)), r = Math.min(4, h, bw / 2);
      s += '<path d="M' + x + "," + f.y(0) + "v" + -(h - r) + "q0,-" + r + " " + r + ",-" + r + "h" + (bw - 2 * r) + "q" + r + ",0 " + r + "," + r + "v" + (h - r) + 'z" fill="' + se.color + '"/>';
      if (o.labels) s += '<text class="v" x="' + (x + bw / 2) + '" y="' + (f.y(v) - 4) + '" text-anchor="middle">' + o.yFmt(v) + "</text>";
      s += '<rect x="' + x + '" y="' + 14 + '" width="' + (bw + 2) + '" height="' + (H - 14 - B) + '" fill="transparent" data-tip="' + esc(g + ", " + se.name + ": " + o.yFmt(v) + (se.tips ? "<br>" + se.tips[i] : "")) + '"/>';
    });
  });
  el.innerHTML = '<div class="legend">' + legend(o.series.map((se) => [se.name, se.color])) + '</div><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.yTitle + " by " + o.xTitle) + '">' + s + "</svg>";
}

/** A continuous heatmap with its axes titled, the value printed in each cell and a colour scale. */
function heatmap(el, o) {
  const rows = o.rows, cols = o.cols, Wd = o.W || 450, L = o.L || 78, T = 46, ch = o.ch || 24, cw = (Wd - L - 6) / cols.length, H = T + rows.length * ch + 52;
  const vals = []; rows.forEach((r, i) => cols.forEach((c, j) => { const v = o.value(i, j); if (v !== null && v !== undefined) vals.push(v); }));
  const lo = o.lo ?? Math.min(...vals), hi = o.hi ?? Math.max(...vals);
  // Sequential (lo to hi), or diverging round o.diverge.mid (on o.diverge.tf's scale: log2 for
  // a ratio), blue above it, red below, grey at it.
  const dv = o.diverge, tf = dv?.tf ?? ((v) => v), inv = dv?.inv ?? ((v) => v);
  const span = dv ? Math.max(1e-9, ...vals.map((v) => Math.abs(tf(v) - tf(dv.mid)))) : 0;
  const t = (v) => (dv ? Math.max(-1, Math.min(1, (tf(v) - tf(dv.mid)) / span)) : hi === lo ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo))));
  const fill = (v) => (dv ? (t(v) >= 0 ? "color-mix(in oklab, var(--hi) " + Math.round(100 * t(v)) + "%, var(--mid))" : "color-mix(in oklab, var(--neg) " + Math.round(-100 * t(v)) + "%, var(--mid))") : "color-mix(in oklab, var(--hi) " + Math.round(100 * t(v)) + "%, var(--lo))");
  let s = '<text x="' + (L + (Wd - L - 6) / 2) + '" y="11" text-anchor="middle" class="t">' + o.colTitle + "</text>";
  cols.forEach((c, j) => { s += '<text x="' + (L + (j + 0.5) * cw) + '" y="27" text-anchor="middle">' + c[0] + "</text>" + (c[1] ? '<text x="' + (L + (j + 0.5) * cw) + '" y="40" text-anchor="middle" style="font-size:9px">' + c[1] + "</text>" : ""); });
  s += '<text transform="translate(11,' + (T + (rows.length * ch) / 2) + ') rotate(-90)" text-anchor="middle" class="t">' + o.rowTitle + "</text>";
  rows.forEach((r, i) => {
    s += '<text x="' + (L - 6) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="end">' + r + "</text>";
    cols.forEach((c, j) => {
      const v = o.value(i, j);
      s += '<rect x="' + (L + j * cw) + '" y="' + (T + i * ch) + '" width="' + (cw + 0.5) + '" height="' + (ch + 0.5) + '" fill="' + (v === null || v === undefined ? "var(--empty)" : fill(v)) + '" data-tip="' + esc((o.tip ? o.tip(i, j) : r + ", " + c[0]) + "<br>" + o.name + ": <b>" + (v === null || v === undefined ? "–" : o.fmt(v)) + "</b>") + '"/>';
      if (v !== null && v !== undefined) s += '<text class="v" x="' + (L + (j + 0.5) * cw) + '" y="' + (T + i * ch + ch / 2 + 4) + '" text-anchor="middle" style="pointer-events:none;fill:' + (Math.abs(t(v)) > 0.55 ? "var(--hi-ink)" : "var(--ink)") + '">' + o.fmt(v) + (o.sub ? '<tspan style="font-size:9px;opacity:.75"> ' + o.sub(i, j) + "</tspan>" : "") + "</text>";
    });
  });
  // The colour scale.
  const sy = T + rows.length * ch + 16, sw = Math.min(220, Wd - L - 6), id = "g" + Math.random().toString(36).slice(2);
  const stops = dv ? '<stop offset="0" stop-color="var(--neg)"/><stop offset="0.5" stop-color="var(--mid)"/><stop offset="1" stop-color="var(--hi)"/>' : '<stop offset="0" stop-color="var(--lo)"/><stop offset="1" stop-color="var(--hi)"/>';
  s += '<defs><linearGradient id="' + id + '">' + stops + "</linearGradient></defs>";
  s += '<rect x="' + L + '" y="' + sy + '" width="' + sw + '" height="10" fill="url(#' + id + ')"/>';
  const [a, m, z] = dv ? [inv(tf(dv.mid) - span), dv.mid, inv(tf(dv.mid) + span)] : [lo, (lo + hi) / 2, hi];
  s += '<text x="' + L + '" y="' + (sy + 24) + '">' + o.fmt(a) + '</text><text x="' + (L + sw / 2) + '" y="' + (sy + 24) + '" text-anchor="middle">' + o.fmt(m) + '</text><text x="' + (L + sw) + '" y="' + (sy + 24) + '" text-anchor="end">' + o.fmt(z) + "</text>";
  s += '<text x="' + (L - 6) + '" y="' + (sy + 9) + '" text-anchor="end">colour</text>';
  el.innerHTML = (o.title ? "<h3 style='margin-top:0'>" + o.title + "</h3>" : "") + (o.what ? "<p class='what'>" + o.what + "</p>" : "") + '<svg viewBox="0 0 ' + Wd + " " + H + '" role="img" aria-label="' + esc(o.title || o.name) + '">' + s + "</svg>";
}

/** Horizontal stacked bars: a row each, its parts in a fixed order, the total at the end. */
function stacked(el, o) {
  const W = 900, L = 120, R = 70, T = 8, rh = 28, B = 42, H = T + o.rows.length * rh + B;
  const max = Math.max(...o.rows.map((r) => o.order.reduce((a, k) => a + (r.parts[k] || 0), 0)));
  const x = (v) => (v / max) * (W - L - R);
  let s = "";
  const step = nice(max);
  for (let v = 0; v <= max + 1e-9; v += step) s += '<line x1="' + (L + x(v)) + '" x2="' + (L + x(v)) + '" y1="' + T + '" y2="' + (T + o.rows.length * rh) + '" stroke="var(--line)"/><text x="' + (L + x(v)) + '" y="' + (T + o.rows.length * rh + 14) + '" text-anchor="middle">' + Math.round(v) + "</text>";
  s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="t">' + o.xTitle + "</text>";
  s += '<text x="4" y="' + (T - 0) + '" class="t" style="font-size:11px">' + "</text>";
  o.rows.forEach((r, i) => {
    let at = L;
    const y = T + i * rh + 4, total = o.order.reduce((a, k) => a + (r.parts[k] || 0), 0);
    s += '<text x="' + (L - 8) + '" y="' + (y + 14) + '" text-anchor="end">' + r.label + "</text>";
    o.order.forEach((k, j) => {
      const v = r.parts[k] || 0, w = x(v);
      if (w <= 0) return;
      s += '<rect x="' + at + '" y="' + y + '" width="' + Math.max(0, w - 2) + '" height="' + (rh - 8) + '" fill="' + o.colors[j] + '" data-tip="' + esc(r.label + "<br>" + k + ": <b>" + v.toFixed(1) + " ms</b> a board (" + Math.round((100 * v) / total) + "%)") + '"/>';
      at += w;
    });
    s += '<text class="v" x="' + (at + 6) + '" y="' + (y + 14) + '">' + Math.round(total) + " ms</text>";
  });
  s += '<text transform="translate(12,' + (T + (o.rows.length * rh) / 2) + ') rotate(-90)" text-anchor="middle" class="t">' + o.yTitle + "</text>";
  el.innerHTML = (o.title ? "<h3 style='margin-top:0'>" + o.title + "</h3>" : "") + (o.what ? "<p class='what'>" + o.what + "</p>" : "") + '<div class="legend">' + legend(o.order.map((k, j) => [k, o.colors[j]])) + '</div><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.title || o.xTitle) + '">' + s + "</svg>";
}
const card = (parent) => { const d = document.createElement("div"); d.className = "card"; parent.appendChild(d); return d; };

$("effort").textContent = DATA.effort.join(", ");
const goals = DATA.cells.reduce((a, c) => a + c.goals, 0);
$("count").textContent = DATA.boards + " boards, " + goals + " goals (" + DATA.walls.length + " wall shares × " + DATA.densities.length + " block densities, about " + Math.round(DATA.boards / DATA.cells.length) + " boards each).";
const cell = (w, d) => DATA.cells.find((c) => c.walls === w && c.density === d);
const pool = (cs, f) => { const n = cs.reduce((a, c) => a + c.goals, 0); return n ? cs.reduce((a, c) => a + c.goals * (f(c) ?? 0), 0) / n : null; };
const W0 = DATA.walls[0], WN = DATA.walls.at(-1);
const byWall = (w) => DATA.cells.filter((c) => c.walls === w);
const C0 = DATA.candidates[0], CN = DATA.candidates.at(-1);
$("tiles").innerHTML = [
  [pc(pool(byWall(W0), (c) => c.m.repeat)) + " → " + pc(pool(byWall(WN), (c) => c.m.repeat)), "goals with a block moved 2+ times, no walls → " + wl(WN) + " walls (all densities)"],
  [(pool(byWall(W0), (c) => c.m.moves) ?? 0).toFixed(1) + " → " + (pool(byWall(WN), (c) => c.m.moves) ?? 0).toFixed(1), "proof moves (mean), no walls → " + wl(WN)],
  ...(C0 ? [
    [pc(C0.stage.candidates) + " → " + pc(C0.stage.chosen), "re-moved blocks among the maker's candidates → among its chosen goals, no walls: selection favours them"],
    [Math.round(C0.perBoard) + " → " + Math.round(CN.perBoard), "candidates a board, no walls → " + wl(CN.walls) + ": walls shrink the pool"],
  ] : []),
].map(([v, w]) => '<div class="tile"><div class="big">' + v + '</div><div class="what">' + w + "</div></div>").join("");

// The histograms: a panel per cell.
let showOne = false;
function hist() {
  const Wn = DATA.walls.length, Dn = DATA.densities.length, K = Math.min(DATA.maxCount, 8), from = showOne ? 1 : 2;
  const W = 960, L = 84, T = 50, R = 6, B = 50, pw = (W - L - R) / Dn, ph = 74, gap = 10, H = T + Wn * ph + B;
  const share = (c, k) => { const tot = c.hist.reduce((a, b) => a + b, 0); return tot ? (c.hist[k] || 0) / tot : 0; };
  let top = 0;
  for (const c of DATA.cells) for (let k = from; k <= K; k++) top = Math.max(top, share(c, k));
  top = nice(top) * Math.ceil(top / nice(top));
  let s = '<text x="' + (L + (W - L - R) / 2) + '" y="12" text-anchor="middle" class="t">Block density (tries per 4×4 chunk; block fill round the origin)</text>';
  s += '<text transform="translate(12,' + (T + (Wn * ph) / 2) + ') rotate(-90)" text-anchor="middle" class="t">Wall share (% of cells)</text>';
  DATA.densities.forEach((d, j) => { s += '<text x="' + (L + (j + 0.5) * pw) + '" y="30" text-anchor="middle">' + d + '</text><text x="' + (L + (j + 0.5) * pw) + '" y="43" text-anchor="middle" style="font-size:9px">' + pc(cell(DATA.walls[0], d).blockFill) + " blocks</text>"; });
  const bw = (pw - gap - 8) / (K - from + 1);
  DATA.walls.forEach((w, i) => {
    const y0 = T + i * ph, base = y0 + ph - 14, scale = (v) => (v / top) * (ph - 26);
    s += '<text x="' + (L - 30) + '" y="' + (y0 + ph / 2) + '" text-anchor="end">' + wl(w) + "</text>";
    // The y scale on each row: 0 and the top.
    s += '<text x="' + (L - 4) + '" y="' + (base + 3) + '" text-anchor="end" style="font-size:9px">0</text><text x="' + (L - 4) + '" y="' + (base - scale(top) + 3) + '" text-anchor="end" style="font-size:9px">' + Math.round(top * 1000) / 10 + "%</text>";
    DATA.densities.forEach((d, j) => {
      const c = cell(w, d), x0 = L + j * pw + 4;
      s += '<rect x="' + (x0 - 2) + '" y="' + (y0 + 4) + '" width="' + (pw - gap + 2) + '" height="' + (ph - 8) + '" fill="var(--bg)"/>';
      s += '<line x1="' + x0 + '" x2="' + (x0 + pw - gap - 4) + '" y1="' + base + '" y2="' + base + '" stroke="var(--line)"/><line x1="' + x0 + '" x2="' + (x0 + pw - gap - 4) + '" y1="' + (base - scale(top)) + '" y2="' + (base - scale(top)) + '" stroke="var(--line)" stroke-dasharray="2 3"/>';
      if (!c) return;
      for (let k = from; k <= K; k++) {
        const v = share(c, k), h = scale(Math.min(v, top)), x = x0 + (k - from) * bw;
        if (h > 0) s += '<rect x="' + (x + 1) + '" y="' + (base - h) + '" width="' + Math.max(1, bw - 2) + '" height="' + h + '" fill="' + (k === 1 ? "var(--c0)" : "var(--c1)") + '"/>';
        s += '<rect x="' + x + '" y="' + (y0 + 4) + '" width="' + bw + '" height="' + (ph - 8) + '" fill="transparent" data-tip="' + esc(wl(w) + " walls, density " + d + "<br>blocks moved " + k + " time" + (k > 1 ? "s" : "") + ": <b>" + (100 * v).toFixed(1) + "%</b> of " + c.hist.reduce((a, b) => a + b, 0) + " moved blocks (" + (c.hist[k] || 0) + ")") + '"/>';
        if (i === Wn - 1) s += '<text x="' + (x + bw / 2) + '" y="' + (base + 12) + '" text-anchor="middle" style="font-size:9px">' + k + "</text>";
      }
      s += '<text class="v" x="' + (x0 + pw - gap - 6) + '" y="' + (y0 + 16) + '" text-anchor="end" style="fill:var(--ink)">' + pc(c.m.repeat) + "</text>";
    });
  });
  s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="t">Times a block is moved in the proof (each panel); the corner: goals with a block moved 2+ times</text>';
  s += '<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 22) + '" text-anchor="middle" style="font-size:10px">Bar height: share of the cell\\'s moved blocks (same scale in every panel, 0 to ' + Math.round(top * 1000) / 10 + "%" + (showOne ? "; the grey bar, moved once, is cut off at the top" : "") + ")</text>";
  $("hist").setAttribute("viewBox", "0 0 " + W + " " + H);
  $("hist").innerHTML = s;
}
$("histFilter").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  showOne = b.dataset.one === "1";
  for (const x of $("histFilter").querySelectorAll("button")) x.classList.toggle("on", x === b);
  hist();
});
hist();

lines($("repeatLine"), {
  xs: DATA.walls, xFmt: wl, xTitle: "Wall share (% of cells that are walls)", yTitle: "Goals with a block moved 2+ times", yFmt: pc, yMax: 1,
  series: DATA.densities.map((d, i) => ({ name: "density " + d, color: ord(i, DATA.densities.length), pts: DATA.walls.map((w) => [w, cell(w, d)?.m.repeat ?? 0, "Block density " + d + ", " + wl(w) + " walls: <b>" + pc(cell(w, d)?.m.repeat) + "</b> of " + cell(w, d)?.goals + " goals have a block moved 2+ times"]) })),
});
$("repeatLegend").innerHTML = "";

heatmap($("byLength"), {
  W: 960, ch: 30, L: 112, name: "goals with a block moved 2+ times", rowTitle: "Proof length", colTitle: "Wall share (% of cells)", lo: 0, hi: 1,
  rows: DATA.buckets.map((b) => b + " moves"), cols: DATA.walls.map((w) => [wl(w)]), fmt: pc,
  value: (i, j) => { const x = DATA.byLength[j].b[i]; return x.n ? x.repeat / x.n : null; },
  sub: (i, j) => "(" + DATA.byLength[j].b[i].n + ")",
  tip: (i, j) => wl(DATA.walls[j]) + " walls, proofs of " + DATA.buckets[i] + " moves: " + DATA.byLength[j].b[i].n + " goals, " + pc(DATA.byLength[j].b[i].cycle / Math.max(1, DATA.byLength[j].b[i].n)) + " with a directed cycle",
});

const MAPS = [
  ["repeat", "Goals with a block moved 2+ times", pc, "share of goals whose proof moves some block twice or more"],
  ["repeatOther", "Goals with a block other than red moved 2+ times", pc, "as above, the red block left out"],
  ["redRepeat", "Goals with red moved 2+ times", pc, "share of goals whose red block moves twice or more"],
  ["cycle", "Goals with a directed blocker cycle", pc, "share of goals whose blocker graph (approximation) has a directed cycle"],
  ["cyclomatic", "Blocker-graph cyclomatic complexity", (v) => v.toFixed(2), "mean of edges − nodes + components"],
  ["reversal", "Goals with a reversal (back-and-forth)", pc, "share of goals where a block slides back the way it came"],
  ["returns", "Returns to a block already left", (v) => v.toFixed(2), "mean per goal: moves of a block already moved before"],
  ["detour", "Detour", (v) => v.toFixed(2), "median of the proof's moves per cell of red's straight distance"],
  ["found", "Found rate", pc, "share of boards where the maker found a goal"],
  ["moves", "Fewest moves (the proof's)", (v) => v.toFixed(1), "mean moves of the proof"],
  ["exact", "Proof's length exact in the maker's window", pc, "share of goals whose fewest the maker's measure proved"],
  ["decisions", "Decisions", (v) => v.toFixed(1), "mean of the Judge's decision count"],
  ["fitness", "Fitness", (v) => v.toFixed(2), "median of the Judge's fitness"],
  ["makerMs", "Maker time", (v) => Math.round(v) + "", "median ms a goal, one process on the VM"],
  ["blocksMoved", "Blocks moved", (v) => v.toFixed(1), "mean number of distinct blocks the proof moves"],
  ["distance", "Red's distance", (v) => v.toFixed(1), "mean cells from red's start to its target"],
];
for (const [key, title, fmt, what] of MAPS) heatmap(card($("maps")), {
  title, what, name: title, rowTitle: "Wall share", colTitle: "Block density (tries; block fill)",
  rows: DATA.walls.map(wl), cols: DATA.densities.map((d) => [d, pc(cell(DATA.walls[0], d).blockFill)]), fmt,
  value: (i, j) => cell(DATA.walls[i], DATA.densities[j])?.m[key] ?? null,
  tip: (i, j) => { const c = cell(DATA.walls[i], DATA.densities[j]); return "Density " + c.density + ", " + wl(c.walls) + " walls (fill: blocks " + pc(c.blockFill) + ", walls " + pc(c.wallFill) + "), " + c.goals + " goals of " + c.boards + " boards"; },
});

// Effort 2 against effort 0.
$("sharedD").textContent = DATA.shared.join(", ");
if (DATA.byEffort.length) {
  const efforts = [...new Set(DATA.byEffort.map((r) => r.effort))];
  const xs = [...new Set(DATA.byEffort.map((r) => r.walls))].sort((a, b) => a - b);
  const series = (f, fmt) => efforts.map((e, i) => ({ name: "effort " + e, color: cat(i), pts: DATA.byEffort.filter((r) => r.effort === e).map((r) => [r.walls, f(r), "Effort " + e + ", " + wl(r.walls) + " walls: <b>" + fmt(f(r)) + "</b> (" + r.boards + " boards)"]) }));
  for (const [f, title, yTitle, fmt, yMax] of [[(r) => r.repeat, "Goals with a block moved 2+ times", "Goals (%)", pc, 1], [(r) => r.moves, "Proof moves (mean)", "Moves", (v) => v.toFixed(1)], [(r) => r.cycle, "Goals with a directed blocker cycle", "Goals (%)", pc], [(r) => r.makerMs, "Maker time a goal (median)", "Milliseconds", (v) => Math.round(v) + ""]]) {
    const c = card($("effortCharts"));
    c.innerHTML = "<h3 style='margin-top:0'>" + title + "</h3><p class='what'>x: wall share (% of cells). y: " + title.toLowerCase() + ". A line per effort level.</p><div></div>";
    lines(c.lastChild, { W: 460, H: 270, xs, xFmt: wl, xTitle: "Wall share (% of cells)", yTitle, yFmt: fmt, yMax, series: series(f, fmt) });
  }
}

// Candidates or selection.
$("candN").textContent = DATA.candidates.reduce((a, c) => a + c.boards, 0) + " (" + DATA.candidates.map((c) => c.boards).join(", ") + " at " + DATA.candidates.map((c) => wl(c.walls)).join(", ") + " walls)";
$("candD").textContent = DATA.candDensity.join(", ");
if (DATA.candidates.length) {
  const K = DATA.candidates, groups = K.map((c) => wl(c.walls) + " walls"), box = $("candidates");
  let c = card(box);
  c.innerHTML = "<h3 style='margin-top:0'>Re-moved blocks at each step of the selection</h3><p class='what'>x: wall share. y: the share of goals with a block moved 2+ times among all the candidates the maker weighs, among its 3 finalists, and among the goals it picks. If selection pushed re-moved blocks out, the bars would fall from left to right within a group; they rise.</p><div></div>";
  bars(c.lastChild, { groups, xTitle: "Wall share (% of cells)", yTitle: "Goals with a block moved 2+ times", yFmt: pc, labels: true,
    series: [["All candidates", "candidates", cat(0)], ["Finalists (top 3 by rank)", "finalists", cat(1)], ["Chosen (by the Judge's fitness)", "chosen", cat(2)]].map(([name, k, color]) => ({ name, color, values: K.map((x) => x.stage[k]) })) });
  c = card(box);
  c.innerHTML = "<h3 style='margin-top:0'>Proof length: the pool or the pick?</h3><p class='what'>x: wall share. y: proof moves (mean): of all candidates, of each board's longest candidate, of the finalists, and of the chosen goal. The chosen goal stays at about the same place in its pool; the pool itself gets shorter.</p><div></div>";
  bars(c.lastChild, { groups, xTitle: "Wall share (% of cells)", yTitle: "Proof moves (mean)", yFmt: (v) => (Math.round(v * 10) / 10).toString(), labels: true,
    series: [["All candidates", "candidates", cat(0)], ["Each board's longest candidate", "longest", cat(3)], ["Finalists", "finalists", cat(1)], ["Chosen", "chosen", cat(2)]].map(([name, k, color]) => ({ name, color, values: K.map((x) => x.length[k]) })) });
  c = card(box);
  c.innerHTML = "<h3 style='margin-top:0'>The size of the pool</h3><p class='what'>x: wall share. y: candidates the maker weighs per board, and the share of them (and of the chosen goals) with proofs of 11 moves or more.</p><div style='display:grid;grid-template-columns:1fr 1fr;gap:8px'><div></div><div></div></div>";
  bars(c.lastChild.children[0], { W: 450, groups, xTitle: "Wall share", yTitle: "Candidates a board", yFmt: (v) => Math.round(v) + "", labels: true, series: [{ name: "Candidates a board", color: cat(0), values: K.map((x) => x.perBoard) }] });
  bars(c.lastChild.children[1], { W: 450, groups, xTitle: "Wall share", yTitle: "Proofs of 11+ moves", yFmt: pc, yMax: 1, labels: true, series: [{ name: "All candidates", color: cat(0), values: K.map((x) => x.long.candidates) }, { name: "Chosen", color: cat(2), values: K.map((x) => x.long.chosen) }] });
  const maps = document.createElement("div"); maps.className = "maps"; box.appendChild(maps);
  const rows = DATA.buckets.map((b) => b + " moves"), cols = K.map((x) => [wl(x.walls)]);
  const B = (i, j) => K[j].buckets[i];
  const bt = (i, j) => wl(K[j].walls) + " walls, candidates of " + DATA.buckets[i] + " moves: " + B(i, j).n + " (" + B(i, j).re + " with a re-moved block)";
  heatmap(card(maps), { title: "Candidates with a re-moved block", what: "Share of candidates with a block moved 2+ times, by proof length (row) and wall share (column); the count of candidates under it.", name: "re-moved share", rowTitle: "Proof length", colTitle: "Wall share", L: 112, rows, cols, fmt: pc, lo: 0, hi: 1, value: (i, j) => B(i, j).share, sub: (i, j) => "(" + B(i, j).n + ")", tip: bt });
  heatmap(card(maps), { title: "Odds of reaching the finals", what: "Finalist rate of candidates with a re-moved block divided by that of the rest, at the same proof length: above 1 (blue), the rank favours them; below (red), it passes them over. Blank: fewer than 5 candidates on either side, or none reached the finals.", name: "finalist rate, re-moved ÷ the rest", rowTitle: "Proof length", colTitle: "Wall share", L: 112, rows, cols, fmt: (v) => v.toFixed(1) + "×", diverge: { mid: 1, tf: Math.log2, inv: (v) => Math.pow(2, v) },
    value: (i, j) => (B(i, j).re >= 5 && B(i, j).n - B(i, j).re >= 5 && B(i, j).finalNo && B(i, j).finalRe ? B(i, j).finalRe / B(i, j).finalNo : null), tip: (i, j) => bt(i, j) + "<br>finalists: " + pc(B(i, j).finalRe) + " of those with a re-moved block, " + pc(B(i, j).finalNo) + " of the rest" });
  heatmap(card(maps), { title: "The Judge's fitness", what: "Median fitness of candidates with a re-moved block divided by that of the rest, at the same proof length: above 1 (blue), the Judge scores them higher; below (red), lower.", name: "fitness, re-moved ÷ the rest", rowTitle: "Proof length", colTitle: "Wall share", L: 112, rows, cols, fmt: (v) => v.toFixed(2) + "×", diverge: { mid: 1, tf: Math.log2, inv: (v) => Math.pow(2, v) },
    value: (i, j) => (B(i, j).re >= 5 && B(i, j).n - B(i, j).re >= 5 && B(i, j).fitNo ? B(i, j).fitRe / B(i, j).fitNo : null), tip: (i, j) => bt(i, j) + "<br>median fitness " + B(i, j).fitRe + " with a re-moved block, " + B(i, j).fitNo + " for the rest" });
  heatmap(card(maps), { title: "The Judge's decisions", what: "Mean decisions of candidates with a re-moved block minus those of the rest, at the same proof length: above 0 (blue), the decision count is higher for them; below (red), lower.", name: "decisions, re-moved − the rest", rowTitle: "Proof length", colTitle: "Wall share", L: 112, rows, cols, fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1), diverge: { mid: 0 },
    value: (i, j) => (B(i, j).re >= 5 && B(i, j).n - B(i, j).re >= 5 && B(i, j).decNo !== null ? B(i, j).decRe - B(i, j).decNo : null), tip: (i, j) => bt(i, j) + "<br>mean decisions " + B(i, j).decRe + " with a re-moved block, " + B(i, j).decNo + " for the rest" });
}

// Where the time goes.
{
  const box = $("time");
  const parts1 = ["The maker", "Board generation", "The Referee", "The Judge", "Choices along the proof"];
  stacked(card(box), {
    title: "The whole sweep: the maker against the rest", what: "A bar per wall share (all densities pooled): mean ms a board for each step the experiment runs. The maker is nearly all of it.",
    rows: DATA.timeByWall.map((r) => ({ label: wl(r.walls) + " walls", parts: r.parts })), order: parts1, colors: [cat(0), cat(2), cat(3), cat(4), cat(6)], xTitle: "Milliseconds a board (mean, one process)", yTitle: "Wall share",
  });
  if (DATA.profile.length) {
    const order = ["Lower bound (window.ts lower, lowerCheap)", "A* search, the rest (difficulty.ts astar)", "Measure set-up (windows, the blocks that matter)", "Simplify and replay proofs", "Push search (goal-fast.ts)", "Judging the finalists (decisions)", "Board generation", "Other (the runtime, garbage collection, the rest)", "The experiment's own analysis (the Judge on every candidate)"];
    stacked(card(box), {
      title: "Inside the maker, at block density " + DATA.profile[0].density, what: "A bar per wall share: mean ms a board for each part of the maker, from a CPU profile. The measure's lower bound (window.ts) is about two thirds of it; walls make every part cheaper.",
      rows: DATA.profile.map((p) => ({ label: wl(p.walls) + " walls", parts: p.parts })), order, colors: [cat(0), cat(1), cat(2), cat(3), cat(4), cat(5), cat(6), "var(--c0)", cat(7)], xTitle: "Milliseconds a board (mean, from the profile)", yTitle: "Wall share",
    });
    const K = DATA.candidates;
    stacked(card(box), {
      title: "The maker's steps", what: "A bar per wall share: mean ms a board in each step of the maker (timed at its steps): the push search, the rough measure of every candidate, the exact measure of the finalists, the pick.",
      rows: K.map((k) => ({ label: wl(k.walls) + " walls", parts: { "Push search": k.steps.pushes, "Rough measure (every candidate)": k.steps.rough, "Exact measure (finalists)": k.steps.exact, "Pick (Judge's fitness)": k.steps.picked } })),
      order: ["Push search", "Rough measure (every candidate)", "Exact measure (finalists)", "Pick (Judge's fitness)"], colors: [cat(4), cat(0), cat(1), cat(5)], xTitle: "Milliseconds a board (mean)", yTitle: "Wall share",
    });
  }
}

$("all").innerHTML = "<tr><th>Walls</th><th>Density</th><th>Boards</th><th>Goals</th><th>Block fill</th><th>Wall fill</th>" + MAPS.map((m) => "<th>" + m[0] + "</th>").join("") + "</tr>" +
  DATA.cells.map((c) => "<tr><td>" + wl(c.walls) + "</td><td>" + c.density + "</td><td>" + c.boards + "</td><td>" + c.goals + "</td><td>" + pc(c.blockFill) + "</td><td>" + pc(c.wallFill) + "</td>" + MAPS.map(([k, , f]) => "<td>" + (c.m[k] === null ? "–" : f(c.m[k])) + "</td>").join("") + "</tr>").join("");
</script>
</main></body></html>
`;
await Bun.write(out!, html.replace("<!--SHOWS-->", SHOWS.trim()));
console.log(`wrote ${out}: ${rows.length} boards, ${cells.length} cells, ${candRows.length} candidate boards, ${profiles.length} profiles`);
