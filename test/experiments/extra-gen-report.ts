// reports/extra-gen.html: the generators of extra-gen-make.ts compared, from extra-gen.ts's runs
// (data/extra-gen/<method>-<budget>.jsonl) and extra-gen-trials.ts's pairs (data/extra-gen/trials.json):
//   bun test/experiments/extra-gen-report.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Line = {
  method: string; budget: number; seed: number; ok: boolean; ms: number; red: number; target: number; fewest: number; extra: number; extraMax: number; states: number; evals: number; tries: number;
  open?: { ring: number; opened: number; walls: number; distractors: number; sealed: boolean; ms: number };
  board: { W: number; H: number; walls: number[]; pieces: { h: boolean; lane: number }[]; pos: number[] } | null;
};
const METHODS = [
  { id: "A", name: "A: rooms, searched now", color: "var(--s1)" },
  { id: "Alib", name: "A: rooms from a library", color: "var(--s2)" },
  { id: "B", name: "B: constructive (annealing)", color: "var(--s3)" },
  { id: "Bopen", name: "B, then opened up", color: "var(--s4)" },
];
const BUDGETS = [200, 1000, 5000];
const runs = new Map<string, Line[]>();
for (const m of METHODS) for (const b of BUDGETS) {
  const f = `data/extra-gen/${m.id}-${b}.jsonl`;
  if (existsSync(f)) runs.set(`${m.id}-${b}`, readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)));
}
const all = [...runs.values()].flat();
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const pc = (x: number) => `${Math.round(100 * x)}%`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Extra against fewest: every successful board, a dot per board (jittered), by method.
function scatter() {
  const Wd = 620, Hd = 320, L = 50, B = 44, T = 14, R = 14;
  const x = (f: number) => L + ((f - 9.5) / 7) * (Wd - L - R), y = (e: number) => Hd - B - (e / 11) * (Hd - B - T);
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" role="img" aria-label="Extra moves against fewest moves, every successful board">`;
  for (let e = 0; e <= 11; e++) s += `<line x1="${L}" x2="${Wd - R}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(e) + 4}" text-anchor="end" class="ax">${e}</text>`;
  for (let f = 10; f <= 16; f++) s += `<text x="${x(f)}" y="${Hd - B + 16}" text-anchor="middle" class="ax">${f}</text>`;
  s += `<text x="${(L + Wd - R) / 2}" y="${Hd - 6}" text-anchor="middle" class="ax">fewest moves (exact)</text><text transform="translate(14 ${(T + Hd - B) / 2}) rotate(-90)" text-anchor="middle" class="ax">extra moves (least over every shortest solution)</text>`;
  let k = 0;
  METHODS.forEach((m, mi) => {
    for (const l of all.filter((l) => l.method === m.id && l.ok)) {
      const j = ((k++ * 0.618) % 1) - 0.5;
      s += `<circle cx="${x(l.fewest + (mi - 1.5) * 0.17 + j * 0.08)}" cy="${y(l.extra + j * 0.25)}" r="4.5" fill="${m.color}" stroke="var(--card)" stroke-width="1.5"><title>${m.name}, ${l.budget} ms: ${l.fewest} moves, ${l.extra} extra</title></circle>`;
    }
  });
  return s + "</svg>";
}

// Success within each budget: grouped bars.
function bars() {
  const Wd = 620, Hd = 280, L = 50, B = 48, T = 14, R = 14;
  const y = (v: number) => Hd - B - v * (Hd - B - T), gw = (Wd - L - R) / BUDGETS.length, bw = (gw - 30) / METHODS.length;
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" role="img" aria-label="Share of boards that succeeded within each budget">`;
  for (let v = 0; v <= 1.001; v += 0.25) s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" class="ax">${pc(v)}</text>`;
  BUDGETS.forEach((b, bi) => {
    s += `<text x="${L + gw * bi + gw / 2}" y="${Hd - B + 18}" text-anchor="middle" class="ax">${b >= 1000 ? `${b / 1000} s` : `${b} ms`}</text>`;
    METHODS.forEach((m, mi) => {
      const r = runs.get(`${m.id}-${b}`);
      if (!r) return;
      const v = r.filter((l) => l.ok).length / r.length, x0 = L + gw * bi + 15 + mi * bw;
      s += `<rect x="${x0 + 1}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, y(0) - y(v))}" rx="3" fill="${m.color}"><title>${m.name}, ${b} ms: ${pc(v)} of ${r.length}</title></rect><text x="${x0 + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="ax">${pc(v)}</text>`;
    });
  });
  return s + `<text x="${(L + Wd - R) / 2}" y="${Hd - 8}" text-anchor="middle" class="ax">time budget per board (this VM)</text><text transform="translate(14 ${(T + Hd - B) / 2}) rotate(-90)" text-anchor="middle" class="ax">boards that succeeded</text></svg>`;
}
const legend = `<p class="legend">${METHODS.map((m) => `<span><i style="background:${m.color}"></i>${m.name}</span>`).join("")}</p>`;

const rows = METHODS.flatMap((m) => BUDGETS.map((b) => {
  const r = runs.get(`${m.id}-${b}`);
  if (!r) return "";
  const ok = r.filter((l) => l.ok), op = ok.filter((l) => l.open);
  return `<tr><td class="l">${m.name}</td><td>${b}</td><td>${r.length}</td><td>${pc(ok.length / r.length)}</td><td>${pc(1 - ok.length / r.length)}</td><td>${Math.round(pct(ok.map((l) => l.ms), 0.5))}</td><td>${Math.round(pct(ok.map((l) => l.ms), 0.9))}</td><td>${mean(ok.map((l) => l.fewest)).toFixed(1)}</td><td>${mean(ok.map((l) => l.extra)).toFixed(1)}</td><td>${ok.length ? Math.max(...ok.map((l) => l.extra)) : ""}</td><td>${op.length ? pc(mean(op.map((l) => l.open!.opened / l.open!.ring))) : "–"}</td><td>${op.length ? mean(op.map((l) => l.open!.distractors)).toFixed(1) : "–"}</td><td>${op.length ? pc(op.filter((l) => l.open!.sealed).length / op.length) : "–"}</td></tr>`;
})).join("\n");

// Board pictures: walls dark, red, its target dashed, blocks moved by the shortest solution not known here (grey).
type Pic = { W: number; H: number; walls: number[]; pieces: { h: boolean; lane: number }[]; pos: number[] };
function board(p: Pic, red: number, target: number, times = new Map<number, number>(), cell = 20) {
  let s = `<svg viewBox="0 0 ${(p.W + 2) * cell} ${(p.H + 2) * cell}" width="${(p.W + 2) * cell}" role="img" aria-label="board">`;
  s += `<rect x="${cell / 2}" y="${cell / 2}" width="${(p.W + 1) * cell}" height="${(p.H + 1) * cell}" fill="none" stroke="var(--line)" stroke-dasharray="3 3"/>`;
  for (const c of p.walls) s += `<rect x="${((c % p.W) + 1) * cell}" y="${(Math.floor(c / p.W) + 1) * cell}" width="${cell}" height="${cell}" fill="var(--wall)"/>`;
  const at = (i: number, k: number) => (p.pieces[i]!.h ? { x: k, y: p.pieces[i]!.lane } : { x: p.pieces[i]!.lane, y: k });
  p.pieces.forEach((q, i) => {
    const { x, y } = at(i, p.pos[i]!), n = times.get(i) ?? 0, w = q.h ? 2 : 1, h = q.h ? 1 : 2;
    const fill = i === red ? "var(--red)" : n > 1 ? "var(--again)" : n ? "var(--once)" : "var(--still)";
    s += `<rect x="${(x + 1) * cell + 2}" y="${(y + 1) * cell + 2}" width="${w * cell - 4}" height="${h * cell - 4}" rx="4" fill="${fill}"/>`;
    if (n > 1) s += `<text x="${(x + 1) * cell + (w * cell) / 2}" y="${(y + 1) * cell + (h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${n}</text>`;
  });
  const t = at(red, target), q = p.pieces[red]!;
  return s + `<rect x="${(t.x + 1) * cell + 1}" y="${(t.y + 1) * cell + 1}" width="${(q.h ? 2 : 1) * cell - 2}" height="${(q.h ? 1 : 2) * cell - 2}" rx="5" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-dasharray="5 3"/></svg>`;
}
const examples = METHODS.map((m) => {
  const l = all.filter((l) => l.method === m.id && l.ok && l.board).sort((a, b) => b.extra - a.extra || a.ms - b.ms)[0];
  if (!l) return "";
  return `<figure>${board(l.board!, l.red, l.target)}<figcaption>${m.name} (${l.budget} ms budget, took ${Math.round(l.ms)} ms): ${l.fewest} moves, ${l.extra} extra${l.open ? `; ${l.open.opened} of ${l.open.ring} walls opened, ${l.open.distractors} distractors, ${l.open.sealed ? "sealed" : "not sealed"}` : ""}</figcaption></figure>`;
}).join("\n");

// The trials.
type Trial = { label: string; kind: string; side: string; fewest: number; extra: number; extraMax: number; states: number; relevant: number; red: string; target: { x: number; y: number }; box: { x: number; y: number; width: number; height: number }; blocks: { id: string; x: number; y: number; w: number; h: number; wall?: boolean }[]; solution: { id: string }[]; open?: { opened: number; ring: number; distractors: number } };
const trials: Trial[] = existsSync("data/extra-gen/trials.json") ? JSON.parse(readFileSync("data/extra-gen/trials.json", "utf8")) : [];
function trialPic(t: Trial, cell = 20) {
  const { box } = t, X = (x: number) => (x - box.x + 1) * cell, Y = (y: number) => (y - box.y + 1) * cell;
  const times = new Map<string, number>();
  t.solution.forEach((m) => times.set(m.id, (times.get(m.id) ?? 0) + 1));
  let s = `<svg viewBox="0 0 ${(box.width + 2) * cell} ${(box.height + 2) * cell}" width="${(box.width + 2) * cell}" role="img" aria-label="${t.label} board">`;
  for (const b of t.blocks) {
    if (b.wall) { s += `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${cell}" height="${cell}" fill="var(--wall)"/>`; continue; }
    const n = times.get(b.id) ?? 0, fill = b.id === t.red ? "var(--red)" : n > 1 ? "var(--again)" : n ? "var(--once)" : "var(--still)";
    s += `<rect x="${X(b.x) + 2}" y="${Y(b.y) + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="${fill}"/>`;
    if (n > 1) s += `<text x="${X(b.x) + (b.w * cell) / 2}" y="${Y(b.y) + (b.h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${n}</text>`;
  }
  const red = t.blocks.find((b) => b.id === t.red)!;
  return s + `<rect x="${X(t.target.x) + 1}" y="${Y(t.target.y) + 1}" width="${red.w * cell - 2}" height="${red.h * cell - 2}" rx="5" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-dasharray="5 3"/></svg>`;
}
const kindName = (k: string) => (k === "A" ? "A: room, opened up" : "B: constructive, opened up");

const ok = (id: string, b: number) => { const r = runs.get(`${id}-${b}`); return r ? pc(r.filter((l) => l.ok).length / r.length) : "–"; };
const med = (id: string, b: number) => { const r = runs.get(`${id}-${b}`)?.filter((l) => l.ok) ?? []; return r.length ? `${Math.round(pct(r.map((l) => l.ms), 0.5))} ms` : "–"; };

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Generating real extra moves</title>
<meta name="date" content="${new Date().toISOString().slice(0, 10)}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --wall: #55524b; --red: #e0453a; --again: #f2b632; --once: #8fb3d9; --still: #d8d4ca; --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --wall: #8a877f; --still: #4a4944; --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 56px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 19px; margin: 34px 0 8px; }
  .sub { color: var(--ink-2); max-width: 85ch; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; margin-bottom: 10px; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 9px; border-bottom: 1px solid var(--line); text-align: right; vertical-align: top; }
  td.l, th.l { text-align: left; } th { color: var(--ink-2); font-weight: 600; }
  .ax { font-size: 11px; fill: var(--ink-2); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; margin-right: 16px; font-size: 13px; color: var(--ink-2); } .legend i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .links a { display: inline-block; margin: 4px 8px 4px 0; padding: 8px 16px; border-radius: 8px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; }
  details { margin-top: 18px; } summary { cursor: pointer; font-weight: 600; }
  .boards { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; } figure { margin: 0; } figcaption { font-size: 13px; color: var(--ink-2); max-width: 340px; }
  ul { max-width: 85ch; }
</style></head><body><main>
<p><a href="./">Reports</a></p>
<h1>Generating real extra moves</h1>
<p class="sub">Extra moves: Σ over the blocks a shortest solution moves of (times moved − 1), red counting, the least over every shortest solution (reports/extra-moves.html). The open, randomly filled world hardly holds goals with real ones (reports/extra-maker.html), so these experiments make boards that do, reusing nothing of the maker: an exact breadth-first solver for a bounded grid (test/experiments/extra-gen-core.ts) and two generators on it (extra-gen-make.ts). A board succeeds when its goal needs 10 to 16 moves and has 3 or more extra moves, both verified exactly; one that runs out of time falls back to today's random placement.</p>
<p class="sub"><b>Next:</b> players saw these rooms' edge as a closed ring of stuck blocks; <a href="open-gen.html">reports/open-gen.html</a> drops the seal and proves the goal exact in any surroundings instead, with the edge's blocks free to move.</p>

<h2>The two approaches</h2>
<ul>
<li><b>A: rooms, then open them up.</b> Random walled 6x6 rooms (10 to 14 blocks, up to 2 walls inside) or 7x7 (13 to 17, up to 4), each searched whole, which gives every goal's fewest at once; the best goal's extra moves over every shortest solution; until one has 3 or more. Either searched there and then ("A: rooms, searched now"), or drawn from a library made ahead (extra-moves.ts's 328 such goals; "from a library").</li>
<li><b>B: constructive placement.</b> Red on an empty 6x6 or 7x7 region, its target at the far end of its lane; simulated annealing over adding, removing, moving and sliding blocks and adding or removing walls, scored by 3 × extra moves + the fewest (up to 16, less past it), each step solved exactly (only as deep as the goal, so early boards cost almost nothing).</li>
<li><b>Opening up</b> (A, and B in "B, then opened up"): the room put into the world (2 cells of the world's own blocks and walls round its ring of walls, randomLayout at the game's density and 4% walls); then its walls taken away one at a time, each kept only if the goal's fewest stays the same and its extra moves don't drop: first two neighbouring walls swapped for one block lying along them (with walls or other stuck blocks at its ends it can never move: a wall that looks like a block), then each wall left removed or swapped for a block over it and an empty neighbour, then walls and blocks moved a cell out or in for a jagged edge; last, distractor blocks on empty cells no shortest solution passes through (they only add obstruction and no shortest solution meets them, so the fewest and extra moves can't change), near the cells the solutions use; then verified once more.</li>
<li><b>Exact, and sealed.</b> The solver leaves out blocks that can never move (walls, and blocks locked against walls and each other along their lanes: they are walls to it) and blocks whose reach along their lane never meets one that matters; neither changes any solution. In the runs below the opening keeps the board <i>sealed</i>: no block that matters can reach the window's edge, nor can a block from past it slide in along a lane as far as one that matters, so the fewest and extra moves hold in the endless world whatever lies past the window. The trials are verified on their own board, the window framed by walls, which lets more of the edge open.</li>
</ul>

<h2>Extra moves against fewest</h2>
<p class="sub">Every board that succeeded, every budget (one dot each, nudged sideways by method so they don't hide each other). Both reach the same range: 10 to 16 moves, 3 to 8 extra moves.</p>
<div class="card">${legend}${scatter()}</div>

<h2>Success within each time budget</h2>
<p class="sub">Times on this VM's cores, two runs at once; a mid phone is perhaps 2 to 4 times slower. A board that does not succeed in time falls back to today's random placement (the share failing is the fallback rate). The opening runs inside the same budget: past the deadline it stops where it is, and the board is still verified (so a few go over their budget by that last check).</p>
<div class="card">${legend}${bars()}</div>
<div class="card"><table><tr><th class="l">Generator</th><th>Budget, ms</th><th>Boards</th><th>Succeeded</th><th>Fallback</th><th>ms, median</th><th>ms, 90%</th><th>Fewest, mean</th><th>Extra, mean</th><th>Extra, most</th><th>Walls opened</th><th>Distractors</th><th>Sealed</th></tr>
${rows}
</table></div>
<p class="sub">Walls opened: the share of the room's ring and inner walls taken away or swapped for blocks (most become locked blocks along the ring). Medians and the 90th percentile are of the boards that succeeded.</p>

<h2>What works, and why</h2>
<ul>
<li><b>Neither generator is fast enough on the device alone.</b> B (${ok("B", 200)} within 200 ms, ${ok("B", 1000)} within 1 s, ${ok("B", 5000)} within 5 s) and A searching rooms there and then (${ok("A", 200)}, ${ok("A", 1000)}, ${ok("A", 5000)}) both need about a second at the median on this VM. Both reach the same goals: 10 to 16 moves with 3 to 8 extra, about 4 on average. A pays for searching every room whole (10,000 to 150,000 states) before it knows its goals, and only one room in ten to twenty has such a goal; B aims at one goal, so each step searches only as deep as that goal and the early boards are tiny, and the annealing finds the cyclic dependencies itself (blocks that step aside and come back, red stepping back), but needs hundreds of steps.</li>
<li><b>Rooms made ahead are the answer for a phone</b>: from a library, ${ok("Alib", 200)} succeed within 200 ms (median ${med("Alib", 200)}, a little over the budget for the last check), and only the opening runs on the device. A library of a few hundred rooms (a few hundred bytes each; this one is extra-moves.ts's 328 goals, and either generator can grow it offline), varied by mirroring, rotating and the world round them. With 1 s the opening gets further (71% of the walls against 54%).</li>
<li><b>Opening up keeps the goal, and the world stays exact</b>: about three in four of the room's walls go, nearly all swapped for blocks that are locked in place, and the board stays sealed. What doesn't open is a wall whose removal lets a lane of the room run out into the world: then a block from past the window could slide in, and the board can't be proved any more, or the state count runs away (the world's blocks all matter once a lane is open), or there is a shortcut (a few cases: 2 to 7 moves in place of 11). So the edge is mostly a ring of blocks stuck against each other and a few walls: not a square of walls, but a straight ring of blocks a careful player may notice. Moving it a cell out or in for a jagged edge almost always opens a lane, and is rejected when the board must stay sealed; on a framed trial board (G1, G2) more of the edge opens.</li>
<li><b>Distractors are cheap and free</b>: on empty cells no shortest solution passes through, provably harmless; the rooms are already about as full as the world, so few fit (0 to 3, about 1 a board).</li>
</ul>

<h2>Boards</h2>
<p class="sub">The best board from each generator (most extra moves): walls dark, red with its target dashed, the rest grey; the dashed frame is the window (open in the runs: the world goes on past it).</p>
<div class="boards">${examples}</div>

<h2>Trials (blind)</h2>
<p class="sub">Two pairs, each a generated goal with many extra moves against one with none at the same fewest, both made the same way: G1 from rooms (A), G2 from annealing (B), all opened up into the world (walls swapped for stuck blocks or removed, edges moved, distractors), and verified exactly on the trial board (the window framed by walls). Play each, note how it felt, then open the key.</p>
${[1, 2].map((k) => `<p class="links">Pair ${k}: ${trials.filter((t) => t.label.startsWith(`G${k}`)).map((t) => `<a href="../?trial=${t.label}">${t.label}</a>`).join("")}</p>`).join("\n")}
<details><summary>Answer key (open after playing)</summary>
<div class="card"><table><tr><th class="l">Trial</th><th class="l">Made by</th><th class="l">Side</th><th>Fewest</th><th>Extra (every shortest)</th><th>Red moves</th><th>Blocks moved</th><th>Walls opened</th><th>Distractors</th><th>States</th></tr>
${trials.map((t) => `<tr><td class="l"><a href="../?trial=${t.label}">${t.label}</a></td><td class="l">${kindName(t.kind)}</td><td class="l">${t.side}</td><td>${t.fewest}</td><td>${t.extra === t.extraMax ? t.extra : `${t.extra}–${t.extraMax}`}</td><td>${t.solution.filter((m) => m.id === t.red).length}</td><td>${new Set(t.solution.map((m) => m.id)).size}</td><td>${t.open ? `${t.open.opened} of ${t.open.ring}` : ""}</td><td>${t.open?.distractors ?? ""}</td><td>${t.states.toLocaleString("en")}</td></tr>`).join("\n")}
</table></div>
<p class="sub">Red, its target dashed; blue blocks move once in the proof, yellow ones more (the number is how often), grey ones not at all.</p>
<div class="boards">
${trials.map((t) => `<figure>${trialPic(t)}<figcaption>${t.label}: ${esc(kindName(t.kind))}, ${t.side}, ${t.fewest} moves, ${t.extra} extra</figcaption></figure>`).join("\n")}
</div>
</details>

<h2>Wiring it into the world (not done)</h2>
<ul>
<li>Where the maker would place a goal, a pocket of the world (the room's cells, its ring and 2 cells round) is overridden: the generated blocks and walls replace the random ones there, as a fixed patch keyed to the chunks it covers and stored with the world, so every device sees the same board (like the island). The world's own blocks round it stay.</li>
<li>Generation: B in the goal worker with a budget of about 1 s, or rooms from a shipped library with only the opening on the device; fall back to today's maker when it runs out. Seeded, so the same seed gives the same patch.</li>
<li>The goal's fewest and proof come from the generator (exact while the patch stays sealed), not the measure; the Referee checks the proof as now, and the Judge would need to accept a proved fewest from the patch.</li>
<li>Open questions: blocks moved earlier near the patch (the patch must go on untouched ground, or be checked again against them); how far the ring of stuck blocks shows; and the ramp's short early goals, which B can aim at as easily.</li>
</ul>
</main></body></html>
`;
writeFileSync("reports/extra-gen.html", html);
console.log("reports/extra-gen.html");
