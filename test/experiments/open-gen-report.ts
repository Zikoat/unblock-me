// reports/open-gen.html: rooms with real extra moves whose edge is open, from open-gen.ts's runs
// (data/open-gen/high.jsonl) and open-gen-trials.ts's pairs (data/open-gen/trials.json), against
// the old sealed rooms (src/trials-gen.ts's G boards):
//   bun test/experiments/open-gen-report.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { GEN_TRIALS } from "../../src/trials-gen";
import type { Trial } from "../../src/trials";
import { type Grid, occupancy } from "./extra-gen-core";
import { canMove, type Made, openness, placeInWorld } from "./open-gen-make";

type Open = Made["open"];
type Line = Omit<Made, "g"> & { seed: number; lib: { size: string; fewest: number; extra: { least: number; most: number } }; board: { W: number; H: number; walls: number[]; pieces: Grid["pieces"]; pos: number[] } };
const runs: Line[] = existsSync("data/open-gen/high.jsonl") ? readFileSync("data/open-gen/high.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
type TrialRow = Trial & { side: string; extra: number; extraMax: number; open: Open; ms: number; states: { up: number; low: number }; room: { x: number; y: number; width: number; height: number }; box: { x: number; y: number; width: number; height: number } };
const trials: TrialRow[] = existsSync("data/open-gen/trials.json") ? JSON.parse(readFileSync("data/open-gen/trials.json", "utf8")) : [];
const pc = (x: number) => `${Math.round(100 * x)}%`;
const share = (z: { blocks: number; movable: number }) => (z.blocks ? z.movable / z.blocks : 0);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN; };

// The old rooms: the G trial boards, their room the ring of walls opened into blocks (2 cells in).
function gridOfTrial(t: Trial) {
  const xs = t.blocks.flatMap((b) => [b.x, b.x + b.w]), ys = t.blocks.flatMap((b) => [b.y, b.y + b.h]);
  const ox = Math.min(...xs) + 1, oy = Math.min(...ys) + 1, W = Math.max(...xs) - ox - 1, H = Math.max(...ys) - oy - 1;
  const g: Grid = { W, H, wall: new Uint8Array(W * H), pieces: [], pos: [] };
  for (const b of t.blocks) {
    const x = b.x - ox, y = b.y - oy;
    if (b.wall) { if (x >= 0 && y >= 0 && x < W && y < H) g.wall[y * W + x] = 1; continue; }
    const h = b.w > b.h;
    g.pieces.push({ h, lane: h ? y : x });
    g.pos.push(h ? x : y);
  }
  return g;
}
const old = GEN_TRIALS.map((t) => { const g = gridOfTrial(t); return { label: t.label, open: openness(g, 2, 2, g.W - 4, g.H - 4) }; });
const fresh = runs.map((r) => ({ label: `seed ${r.seed}`, open: r.open }));
// The world itself: every block of a 24x24 window not touching its frame, movable or not.
const world = (() => {
  let blocks = 0, movable = 0;
  for (let s = 1; s <= 40; s++) {
    const g = placeInWorld({ W: 0, H: 0, wall: new Uint8Array(0), pieces: [], pos: [] }, 12, 7000 + s);
    const occ = occupancy(g);
    g.pieces.forEach((p, i) => {
      const x = p.h ? g.pos[i]! : p.lane, y = p.h ? p.lane : g.pos[i]!;
      if (x < 1 || y < 1 || x + (p.h ? 2 : 1) > g.W - 1 || y + (p.h ? 1 : 2) > g.H - 1) return;
      blocks++;
      if (canMove(g, p, g.pos[i]!, occ)) movable++;
    });
  }
  return movable / blocks;
})();

const ax = (s: string) => `<text class="ax" ${s}</text>`;
// Extra against fewest.
function scatter() {
  const Wd = 560, Hd = 300, L = 50, B = 44, T = 14, R = 14;
  const x = (f: number) => L + ((f - 9.5) / 7) * (Wd - L - R), y = (e: number) => Hd - B - (e / 8) * (Hd - B - T);
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" role="img" aria-label="Extra moves against fewest moves">`;
  for (let e = 0; e <= 8; e++) s += `<line x1="${L}" x2="${Wd - R}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)"/>${ax(`x="${L - 6}" y="${y(e) + 4}" text-anchor="end">${e}`)}`;
  for (let f = 10; f <= 16; f++) s += ax(`x="${x(f)}" y="${Hd - B + 16}" text-anchor="middle">${f}`);
  s += ax(`x="${(L + Wd - R) / 2}" y="${Hd - 6}" text-anchor="middle">fewest moves (exact in any surroundings)`) + `<text class="ax" transform="translate(14 ${(T + Hd - B) / 2}) rotate(-90)" text-anchor="middle">extra moves (least over every shortest solution)</text>`;
  runs.forEach((r, k) => {
    const j = ((k * 0.618) % 1) - 0.5;
    s += `<circle cx="${x(r.fewest + j * 0.3)}" cy="${y(r.extra + j * 0.2)}" r="5" fill="var(--s1)" stroke="var(--card)" stroke-width="1.5"><title>seed ${r.seed}: ${r.fewest} moves, ${r.extra} extra</title></circle>`;
  });
  for (const t of trials) s += `<circle cx="${x(t.fewest)}" cy="${y(t.extra)}" r="7" fill="none" stroke="${t.side === "high" ? "var(--s2)" : "var(--s3)"}" stroke-width="2.5"><title>${t.label}: ${t.fewest} moves, ${t.extra} extra</title></circle>`;
  return s + "</svg>";
}

// Openness: per room, the share of the edge's and the ring's blocks that can move, old and new.
function openChart() {
  const Wd = 560, Hd = 310, L = 50, B = 64, T = 14, R = 14;
  const groups = [{ name: "room's edge", f: (o: Open) => share(o.boundary) }, { name: "ring just outside", f: (o: Open) => share(o.ring) }];
  const sets = [{ name: "old (G trials)", rows: old, color: "var(--s4)" }, { name: "new (open rooms)", rows: fresh, color: "var(--s1)" }];
  const y = (v: number) => Hd - B - v * (Hd - B - T), gw = (Wd - L - R) / groups.length;
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" role="img" aria-label="Share of blocks that can move at the start, old and new rooms">`;
  for (let v = 0; v <= 1.001; v += 0.25) s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>${ax(`x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${pc(v)}`)}`;
  s += `<line x1="${L}" x2="${Wd - R}" y1="${y(world)}" y2="${y(world)}" stroke="var(--ink-2)" stroke-dasharray="4 3"/>${ax(`x="${L + 4}" y="${y(world) - 5}">the world's blocks: ${pc(world)}`)}`;
  groups.forEach((g, gi) => {
    s += ax(`x="${L + gw * gi + gw / 2}" y="${Hd - B + 30}" text-anchor="middle">${g.name}`);
    sets.forEach((set, si) => {
      const cx = L + gw * gi + gw * (0.3 + 0.4 * si), vals = set.rows.map((r) => g.f(r.open)), m = mean(vals);
      s += `<rect x="${cx - 26}" y="${y(m)}" width="52" height="${Math.max(0, y(0) - y(m))}" rx="3" fill="${set.color}" opacity="0.35"><title>${set.name}, ${g.name}: mean ${pc(m)}</title></rect>`;
      vals.forEach((v, k) => (s += `<circle cx="${cx + (((k * 0.618) % 1) - 0.5) * 36}" cy="${y(v)}" r="3.5" fill="${set.color}"><title>${set.rows[k]!.label}: ${pc(v)}</title></circle>`));
      s += ax(`x="${cx}" y="${y(0) + 13}" text-anchor="middle">mean ${pc(m)}`);
    });
  });
  return s + `<text class="ax" transform="translate(14 ${(T + Hd - B) / 2}) rotate(-90)" text-anchor="middle">blocks that can move at the start</text>${ax(`x="${(L + Wd - R) / 2}" y="${Hd - 8}" text-anchor="middle">where the blocks are (one dot a room)`)}</svg>`;
}
const legendOpen = `<p class="legend"><span><i style="background:var(--s4)"></i>old: the G trial rooms (sealed, opened up)</span><span><i style="background:var(--s1)"></i>new: open rooms (${runs.length})</span></p>`;

// Success against time: a room "succeeds" by time t when, at the last step kept by then, at
// least half its edge's blocks and half the ring's can move and at most a third of its edge
// cells are walls.
const goodAt = (o: Open, ringCells: number) => share(o.boundary) >= 0.5 && share(o.ring) >= 0.5 && o.boundary.walls <= ringCells / 3;
const ringCellsOf = (r: Line) => 4 * (r.size - 1);
const at = (r: Line, t: number) => [...(r.trace ?? [])].reverse().find((s) => s.ms <= t)?.open ?? null;
const TIMES = [10_000, 30_000, 60_000, 120_000, 300_000];
function timeChart() {
  const Wd = 560, Hd = 260, L = 50, B = 48, T = 14, R = 14;
  const x = (t: number) => L + (Math.log(t / 5000) / Math.log(400_000 / 5000)) * (Wd - L - R), y = (v: number) => Hd - B - v * (Hd - B - T);
  let s = `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" role="img" aria-label="Share of rooms open enough within each time">`;
  for (let v = 0; v <= 1.001; v += 0.25) s += `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/>${ax(`x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${pc(v)}`)}`;
  const pts = TIMES.map((t) => [t, runs.filter((r) => { const o = at(r, t); return o && goodAt(o, ringCellsOf(r)); }).length / Math.max(1, runs.length)] as const);
  const pts2 = TIMES.map((t) => [t, mean(runs.map((r) => { const o = at(r, t); return o ? 1 - o.boundary.walls / ringCellsOf(r) : 0; }))] as const);
  for (const [t] of pts) s += ax(`x="${x(t)}" y="${Hd - B + 16}" text-anchor="middle">${t / 1000} s`);
  s += `<polyline fill="none" stroke="var(--s1)" stroke-width="2.5" points="${pts.map(([t, v]) => `${x(t)},${y(v)}`).join(" ")}"/>`;
  s += `<polyline fill="none" stroke="var(--s2)" stroke-width="2.5" stroke-dasharray="6 4" points="${pts2.map(([t, v]) => `${x(t)},${y(v)}`).join(" ")}"/>`;
  for (const [t, v] of pts) s += `<circle cx="${x(t)}" cy="${y(v)}" r="4" fill="var(--s1)"><title>${t / 1000} s: ${pc(v)} of rooms open enough</title></circle>`;
  for (const [t, v] of pts2) s += `<circle cx="${x(t)}" cy="${y(v)}" r="4" fill="var(--s2)"><title>${t / 1000} s: ${pc(v)} of the edge's cells no longer walls</title></circle>`;
  return { svg: s + `${ax(`x="${(L + Wd - R) / 2}" y="${Hd - 8}" text-anchor="middle">time spent opening one room (this VM, log scale)`)}<text class="ax" transform="translate(14 ${(T + Hd - B) / 2}) rotate(-90)" text-anchor="middle">share</text></svg>`, pts, pts2 };
}
const tc = timeChart();

// Boards: the window, the room outlined, walls dark, red and its target, blocks the proof moves.
function pic(blocks: Trial["blocks"], red: string, target: { x: number; y: number }, solution: Trial["solution"], box: { x: number; y: number; width: number; height: number }, room: { x: number; y: number; width: number; height: number }, cell = 18) {
  const X = (x: number) => (x - box.x + 1) * cell, Y = (y: number) => (y - box.y + 1) * cell;
  const times = new Map<string, number>();
  solution.forEach((m) => times.set(m.id, (times.get(m.id) ?? 0) + 1));
  let s = `<svg viewBox="0 0 ${(box.width + 2) * cell} ${(box.height + 2) * cell}" width="${(box.width + 2) * cell}" role="img" aria-label="board">`;
  for (const b of blocks) {
    if (b.wall) { s += `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${cell}" height="${cell}" fill="var(--wall)"/>`; continue; }
    const n = times.get(b.id!) ?? 0, fill = b.id === red ? "var(--red)" : n > 1 ? "var(--again)" : n ? "var(--once)" : "var(--still)";
    s += `<rect x="${X(b.x) + 2}" y="${Y(b.y) + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="${fill}"/>`;
    if (n > 1) s += `<text x="${X(b.x) + (b.w * cell) / 2}" y="${Y(b.y) + (b.h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${n}</text>`;
  }
  s += `<rect x="${X(room.x)}" y="${Y(room.y)}" width="${room.width * cell}" height="${room.height * cell}" fill="none" stroke="var(--ink-2)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const r = blocks.find((b) => b.id === red)!;
  return s + `<rect x="${X(target.x) + 1}" y="${Y(target.y) + 1}" width="${r.w * cell - 2}" height="${r.h * cell - 2}" rx="5" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-dasharray="5 3"/></svg>`;
}
const runPic = (r: Line) => {
  const ids = r.board.pieces.map((p, i) => ({ id: `b${i}`, x: p.h ? r.board.pos[i]! : p.lane, y: p.h ? p.lane : r.board.pos[i]!, w: p.h ? 2 : 1, h: p.h ? 1 : 2 }));
  const walls = r.board.walls.map((c) => ({ id: `w${c}`, x: c % r.board.W, y: Math.floor(c / r.board.W), w: 1, h: 1, wall: true }));
  const rp = r.board.pieces[r.red]!;
  const target = rp.h ? { x: r.target, y: rp.lane } : { x: rp.lane, y: r.target };
  return pic([...walls, ...ids], `b${r.red}`, target, [], { x: 0, y: 0, width: r.board.W, height: r.board.H }, { x: r.margin, y: r.margin, width: r.size, height: r.size });
};
const rowOf = (label: string, o: Open, ring: number) => `<td>${o.boundary.movable}/${o.boundary.blocks} (${pc(share(o.boundary))})</td><td>${o.boundary.walls} of ${ring}</td><td>${o.ring.movable}/${o.ring.blocks} (${pc(share(o.ring))})</td><td>${o.ring.walls}</td>`;
const runRows = runs.map((r) => `<tr><td class="l">${r.seed}</td><td class="l">${r.lib.size} + ring</td><td>${r.fewest}</td><td>${r.extra === r.extraMax ? r.extra : `${r.extra}–${r.extraMax}`}</td>${rowOf("", r.open, ringCellsOf(r))}<td>${(r.ms / 1000).toFixed(0)}</td><td>${r.evals}</td><td>${r.states.up.toLocaleString("en")}</td><td>${r.states.low.toLocaleString("en")}</td></tr>`).join("\n");
const oldRows = old.map((o) => `<tr><td class="l">${o.label}</td>${rowOf("", o.open, 4 * (gridOfTrial(GEN_TRIALS.find((t) => t.label === o.label)!).W - 5))}</tr>`).join("\n");
const best = [...runs].sort((a, b) => share(b.open.boundary) + share(b.open.ring) - b.open.boundary.walls / 20 - (share(a.open.boundary) + share(a.open.ring) - a.open.boundary.walls / 20)).slice(0, 3);
const pairsN = new Set(trials.map((t) => t.label.slice(0, 2))).size;
const msAll = runs.map((r) => r.ms / 1000);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Real extra moves in open rooms</title>
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
  .boards { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; } figure { margin: 0; } figcaption { font-size: 13px; color: var(--ink-2); max-width: 320px; }
  ul { max-width: 85ch; }
</style></head><body><main>
<p><a href="./">Reports</a></p>
<h1>Real extra moves in open rooms</h1>
<p class="sub">The rooms of reports/extra-gen.html had real extra moves (Σ over the blocks a shortest solution moves of (times moved − 1), red counting) but were sealed: their edge was a ring of blocks locked in place, which players saw at once ("no outer blocks loose"). Here the room is no longer sealed. Its goal is verified exactly for <i>any</i> surroundings by two bounds that must agree, so the blocks on its edge and the world's round it may move; and the edge is measured as the player sees it.</p>

<h2>Exact without a seal: two bounds</h2>
<ul>
<li><b>Upper bound</b>: the room's blocks (R) searched exactly, every other block frozen where it is and the board's edge a wall. Each solution it finds moves only R's blocks inside the room, so it is legal wherever the room stands, whatever happens round it: the real fewest is at most this, and these extra moves are reachable.</li>
<li><b>Lower bound</b>: R searched exactly while the world gives way. A world block that could ever move (it has a free cell, the board's edge, one of R's cells or another such block at an end of its lane) is <i>soft</i>: an R block may slide through it at one move more, after which it is gone for good. A world block that can never move is a wall; past the board every cell is free and R's blocks may slide out and back. Any real sequence of moves maps onto this one with no more moves: R's moves stay; when one of them passes a cell a world block had, that block must have moved at least once before (paid here as the toll, once); every other move of the world's is dropped. Where a real cell is free, the cell here is free or soft, so every R move stays legal. So the real fewest is at least this one's.</li>
<li><b>Agreeing</b> on the fewest and on the least and most extra moves over every shortest solution, they are exact in the endless world and on any board round the room (the trial board's frame included): a real shortest solution then maps onto a lower-bound solution of the same length, so it can move a world block only once (1 move, 0 extra), and its extra moves are R's, which both bounds pin. Unit-checked against a plain exact search on 330 small boards: the bounds never cross the truth, and in all 243 cases where they agree they equal it.</li>
<li><b>Why this answers "blocks beyond some ring can't matter"</b>: the world is never searched; each of its blocks costs at least one move to get out of the way, and that is all the proof needs. How far the world reaches doesn't matter, so no margin is chosen: the trial boards show 3 cells of world round the room only so the edge looks as it will in the world. The search stays the room's size (states below). Both searches also prune any state that can't finish within the upper bound (red's move plus one for every block on red's way: never more than the moves left), which keeps every state on a solution that short at its true depth.</li>
</ul>

<h2>What it takes</h2>
<ul>
<li><b>A room alone does not survive an open edge.</b> With nothing but the lower bound's free world round it, the 13 to 16-move library rooms fall to 2 to 5 moves (their blocks leave through the edge); the old trial rooms G1B and G2A, exact on their framed trial boards, are 7 and 5 moves in the open world (G1A and G2B, with no extra moves, stay exact). Annealing a room from empty against the lower bound (as extra-gen's B, 60 to 150 s a room) never got past 4 moves, nor did annealing a ring of blocks round a library room.</li>
<li><b>Opening a walled room up does</b> (makeOpenUp, open-gen-make.ts): a library room (no walls inside, 10 to 16 moves, 3+ extra: ${new Set(runs.map((r) => r.lib.size + r.lib.fewest)).size} kinds here) with a ring of walls round it, in the world (3 cells of it round, the game's density and 4% walls); each ring wall in turn, in a random order, removed or swapped for a block that sticks into the room, along the ring or out into the world, whichever leaves more blocks free to move, each kept only if the two bounds still agree at the room's fewest and 3+ extra moves. Every step is a full check of both bounds (${pct(runs.map((r) => r.ms / r.evals / 1000), 0.5).toFixed(1)} s at the median, ${Math.round(mean(runs.map((r) => r.states.low))).toLocaleString("en")} states for the lower bound on average).</li>
<li><b>Why some walls stay.</b> A block that must step aside and come back (an extra move) could, with an opening in its lane, leave through it instead for the same count: the fewest stays, but a shortest solution with fewer extra moves appears. So the walls that stay are the ones capping the lanes of the blocks that move twice; everywhere else the edge opens.</li>
</ul>

<h2>The edge now</h2>
<ul>
<li><b>Its blocks move</b>: on the room's edge ${pc(mean(fresh.map((r) => share(r.open.boundary))))} of the blocks can move at the start (old G rooms: ${pc(mean(old.map((r) => share(r.open.boundary))))}), in the ring just outside ${pc(mean(fresh.map((r) => share(r.open.ring))))} (old: ${pc(mean(old.map((r) => share(r.open.ring))))}; the world's own blocks: ${pc(world)}).</li>
<li><b>But it keeps walls, more than before</b>: ${mean(runs.map((r) => r.open.boundary.walls)).toFixed(1)} of the room edge's ${ringCellsOf(runs[0] ?? ({ size: 8 } as Line))} cells on average (${Math.min(...runs.map((r) => r.open.boundary.walls))} to ${Math.max(...runs.map((r) => r.open.boundary.walls))}), where the old rooms had ${mean(old.map((r) => r.open.boundary.walls)).toFixed(1)} and a ring of stuck blocks for the rest. The old opening turned walls into blocks locked in place; this one only keeps a block that can move, and where none will do, the wall stays. Those are the walls capping the lanes of the blocks that move twice (above): the stuck ring is gone, but the room shows as a square with a wall about every third cell of its edge, the world's blocks moving freely round it.</li>
<li><b>Fewer blocks on the edge</b>: ${mean(fresh.map((r) => r.open.boundary.blocks)).toFixed(1)} blocks touch it (old: ${mean(old.map((r) => r.open.boundary.blocks)).toFixed(1)}): a wall taken away mostly stays an empty cell, which opens a neighbour.</li>
</ul>

<h2>Extra moves against fewest</h2>
<p class="sub">Each room opened (dot), exact in any surroundings; rings are the trial boards (orange: many extra moves, green: none).</p>
<div class="card">${scatter()}</div>

<h2>Edge openness, old and new</h2>
<p class="sub">Blocks with at least one legal move at the start: those on the room's edge (a cell on its outer row or column; for the old G rooms the ring of walls they opened into blocks) and those in the ring just outside it (a cell one step out, diagonals too). The dashed line is the world's own share. Walls are counted separately in the tables.</p>
<div class="card">${legendOpen}${openChart()}</div>
<div class="card"><table><tr><th class="l">Old room</th><th>Edge blocks movable</th><th>Edge walls</th><th>Ring blocks movable</th><th>Ring walls</th></tr>
${oldRows}
</table></div>

<h2>Success and time</h2>
<p class="sub">Every room keeps its fewest and extra moves exactly at every step (nothing falls back on exactness); what takes time is opening. A room counts as open enough when at least half its edge blocks and half the ring's can move and at most a third of its edge cells are walls. Times on this VM, two runs at once, one room each; this is for a library made ahead, not the phone.</p>
<div class="card"><p class="legend"><span><i style="background:var(--s1)"></i>rooms open enough</span><span><i style="background:var(--s2)"></i>edge cells no longer walls (mean)</span></p>${tc.svg}</div>
<div class="card"><table><tr><th class="l">Seed</th><th class="l">Room</th><th>Fewest</th><th>Extra</th><th>Edge blocks movable</th><th>Edge walls</th><th>Ring blocks movable</th><th>Ring walls</th><th>Time, s</th><th>Checks</th><th>States, upper</th><th>States, lower</th></tr>
${runRows}
</table></div>
<p class="sub">${runs.length} rooms: median ${pct(msAll, 0.5).toFixed(0)} s, slowest ${Math.max(...msAll).toFixed(0)} s (a room stops when no wall left can go, or at 300 s). Open enough within ${tc.pts.map(([t, v]) => `${t / 1000} s: ${pc(v)}`).join(", ")}.</p>

<h2>Rooms</h2>
<p class="sub">The most open rooms: the room dashed, red and its target, walls dark; the world round it as it was.</p>
<div class="boards">${best.map((r) => `<figure>${runPic(r)}<figcaption>seed ${r.seed}: ${r.fewest} moves, ${r.extra} extra; edge ${r.open.boundary.movable}/${r.open.boundary.blocks} movable, ${r.open.boundary.walls} walls; ring ${r.open.ring.movable}/${r.open.ring.blocks}</figcaption></figure>`).join("\n")}</div>

<h2>Trials (blind)</h2>
<p class="sub">${pairsN} pairs, each a room with many extra moves against one with none at the same fewest and size, both opened up the same way, played on the room and 3 cells of the world round it (framed). Play each, note how it felt, then open the key.</p>
${[...Array(pairsN).keys()].map((k) => `<p class="links">Pair ${k + 1}: ${trials.filter((t) => t.label.startsWith(`H${k + 1}`)).map((t) => `<a href="../?trial=${t.label}">${t.label}</a>`).join("")}</p>`).join("\n")}
<details><summary>Answer key (open after playing)</summary>
<div class="card"><table><tr><th class="l">Trial</th><th class="l">Side</th><th>Fewest</th><th>Extra (every shortest)</th><th>Red moves</th><th>Blocks moved</th><th>Edge blocks movable</th><th>Edge walls</th><th>Ring blocks movable</th><th>Ring walls</th><th>States (upper / lower)</th></tr>
${trials.map((t) => `<tr><td class="l"><a href="../?trial=${t.label}">${t.label}</a></td><td class="l">${t.side}</td><td>${t.fewest}</td><td>${t.extra === t.extraMax ? t.extra : `${t.extra}–${t.extraMax}`}</td><td>${t.solution.filter((m) => m.id === t.red).length}</td><td>${new Set(t.solution.map((m) => m.id)).size}</td>${rowOf("", t.open, 4 * (t.room.width - 1))}<td>${t.states.up.toLocaleString("en")} / ${t.states.low.toLocaleString("en")}</td></tr>`).join("\n")}
</table></div>
<p class="sub">The room dashed; red, its target dashed; blue blocks move once in the proof, yellow ones more (the number is how often), grey ones not at all.</p>
<div class="boards">
${trials.map((t) => `<figure>${pic(t.blocks, t.red, t.target, t.solution, t.box, t.room)}<figcaption>${t.label}: ${t.side}, ${t.fewest} moves, ${t.extra} extra</figcaption></figure>`).join("\n")}
</div>
</details>
</main></body></html>
`;
writeFileSync("reports/open-gen.html", html);
console.log("reports/open-gen.html");
