// Picks the trial pairs from extra-moves.ts output: at each move level, a goal with many extra
// moves and one with none or few, the same fewest moves and as close in decisions as can be
// found, each pair's two sides labelled A and B at random (the labels are blind). Writes the
// boards for ?trial= (src/trials.ts) and the answer key (reports/extra-moves.html):
//   bun test/experiments/extra-pick.ts data/extra/6x6.jsonl data/extra/7x7.jsonl ...
import { readFileSync, writeFileSync } from "node:fs";

type Piece = { h: boolean; lane: number };
type Line = {
  size: string; seed: number; walls: number[]; pieces: Piece[]; pos: number[]; red: number; target: number;
  fewest: number; states: number; dagStates: number;
  extra: { least: number; most: number; bfs: number; bfsNoRed: number };
  measure: { moves: number | null; atLeast: number | null };
  proof: { from: string; blocks: number[]; extra: number; extraNoRed: number; redMoves: number };
  decisions: number; stages: number[]; solution: [number, number, number][];
};
const lines: Line[] = process.argv.slice(2).flatMap((f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)));
const LEVELS = [8, 12, 16];
const dims = (l: Line) => l.size.split("x").map(Number) as [number, number];

/** How good a pair is: the gap in extra moves (every shortest solution's), less the
 * decisions' difference, less a little for boards of different sizes or a level missed. */
function pairScore(hi: Line, lo: Line, level: number): number {
  return hi.extra.least - lo.extra.most - 0.6 * Math.abs(hi.decisions - lo.decisions) - (hi.size === lo.size ? 0 : 2) - 1.5 * Math.abs(hi.fewest - level) - (lo.extra.most > 1 ? 3 : 0) - (lo.decisions === 0 || hi.decisions === 0 ? 1 : 0);
}
const used = new Set<number>();
const pairs: { level: number; hi: Line; lo: Line }[] = [];
for (const level of LEVELS) {
  let best: { hi: Line; lo: Line; score: number } | null = null;
  for (let f = level - 1; f <= level + 1; f++) {
    const at = lines.filter((l) => l.fewest === f && !used.has(l.seed));
    const his = at.filter((l) => l.extra.least >= 3), los = at.filter((l) => l.extra.most <= 2);
    for (const hi of his) for (const lo of los) {
      if (hi.seed === lo.seed) continue;
      const score = pairScore(hi, lo, level);
      if (!best || score > best.score) best = { hi, lo, score };
    }
  }
  if (!best) throw new Error(`no pair at ${level}`);
  used.add(best.hi.seed).add(best.lo.seed);
  pairs.push({ level, hi: best.hi, lo: best.lo });
}

// The sides' labels: a fixed shuffle, so A is not always the high one.
const flips = [true, false, true];
type Trial = { label: string; side: "high" | "low"; level: number; line: Line };
const trials: Trial[] = pairs.flatMap((p, k) => {
  const [a, b] = flips[k] ? [p.lo, p.hi] : [p.hi, p.lo];
  return [a, b].map((line, j) => ({ label: `${p.level}${"AB"[j]}`, side: line === p.hi ? ("high" as const) : ("low" as const), level: p.level, line }));
});

/** The board as the game places it: walls round the square and inside, the blocks b0, b1, ..;
 * the square's top-left at (ox, oy), so its middle is near the origin. */
function placed(l: Line) {
  const [W, H] = dims(l), ox = -Math.floor(W / 2), oy = -Math.floor(H / 2);
  const wall = new Set(l.walls), out: { id: string; x: number; y: number; w: number; h: number; wall?: true }[] = [];
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    const inside = x >= 0 && y >= 0 && x < W && y < H;
    if (!inside || wall.has(y * W + x)) out.push({ id: `wall ${x + ox},${y + oy}`, x: x + ox, y: y + oy, w: 1, h: 1, wall: true });
  }
  const at = (p: Piece, v: number) => (p.h ? { x: v + ox, y: p.lane + oy } : { x: p.lane + ox, y: v + oy });
  l.pieces.forEach((p, i) => out.push({ id: `b${i}`, ...at(p, l.pos[i]!), w: p.h ? 2 : 1, h: p.h ? 1 : 2 }));
  // The proof's moves, from where each block is to where it goes.
  const now = l.pos.slice();
  const solution = l.solution.map(([j, x, y]) => {
    const p = l.pieces[j]!, v = p.h ? x : y, from = at(p, now[j]!);
    now[j] = v;
    return { id: `b${j}`, from, to: at(p, v) };
  });
  return { blocks: out, red: `b${l.red}`, target: at(l.pieces[l.red]!, l.target), solution };
}

const ts = `// Trial boards for feeling out extra moves (reports/extra-moves.html, made by
// test/experiments/extra-pick.ts from extra-moves.ts's search): pairs at a few move counts, one
// side with many extra moves, the other with none or few; ?trial=<label> opens one. Which
// side is which is only in the report, so they can be played blind.
import type { Point } from "./camera";
import type { Placed } from "./layout";
import type { Move } from "./rules";

export type Trial = { label: string; blocks: Placed[]; red: string; target: Point; fewest: number; solution: Move[] };

export const TRIALS: Trial[] = [
${trials.map((t) => { const p = placed(t.line); return `  {
    label: ${JSON.stringify(t.label)}, red: ${JSON.stringify(p.red)}, target: ${JSON.stringify(p.target)}, fewest: ${t.line.fewest},
    blocks: ${JSON.stringify(p.blocks)},
    solution: ${JSON.stringify(p.solution)},
  },`; }).join("\n")}
];
`;
writeFileSync("src/trials.ts", ts.replace(/"(\w+)":/g, "$1:"));

// The report.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function picture(l: Line, cell = 26): string {
  const [W, H] = dims(l), p = placed(l), ox = -Math.floor(W / 2), oy = -Math.floor(H / 2);
  const moved = new Set(l.proof.blocks), times = new Map<number, number>();
  l.proof.blocks.forEach((j) => times.set(j, (times.get(j) ?? 0) + 1));
  let s = `<svg viewBox="${-cell} ${-cell} ${(W + 2) * cell} ${(H + 2) * cell}" width="${(W + 2) * cell}" role="img" aria-label="Board ${esc(l.size)}">`;
  for (const b of p.blocks) {
    const x = (b.x - ox) * cell, y = (b.y - oy) * cell;
    if (b.wall) { s += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#55524b"/>`; continue; }
    const j = Number(b.id.slice(1)), red = b.id === p.red;
    const fill = red ? "#e0453a" : (times.get(j) ?? 0) > 1 ? "#f2b632" : moved.has(j) ? "#8fb3d9" : "#d8d4ca";
    s += `<rect x="${x + 2}" y="${y + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="${fill}"/>`;
    if ((times.get(j) ?? 0) > 1) s += `<text x="${x + (b.w * cell) / 2}" y="${y + (b.h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${times.get(j)}</text>`;
  }
  const red = p.blocks.find((b) => b.id === p.red)!;
  s += `<rect x="${(p.target.x - ox) * cell + 1}" y="${(p.target.y - oy) * cell + 1}" width="${red.w * cell - 2}" height="${red.h * cell - 2}" rx="5" fill="none" stroke="#e0453a" stroke-width="2.5" stroke-dasharray="5 3"/>`;
  return s + "</svg>";
}

const all = lines.length;
const row = (t: Trial) => {
  const l = t.line, e = l.extra;
  return `<tr><td><a href="../?trial=${t.label}">${t.label}</a></td><td class="${t.side}">${t.side}</td><td>${l.fewest}</td><td>${e.least === e.most ? e.least : `${e.least}–${e.most}`}</td><td>${l.proof.extra} (${l.proof.extraNoRed} without red; red moves ${l.proof.redMoves}×)</td><td>${l.decisions}</td><td>${new Set(l.proof.blocks).size}</td><td>${l.size}, ${l.pieces.length} blocks, ${l.walls.length} walls</td><td>${l.states.toLocaleString("en")}</td><td>${l.proof.from === "measure" ? "the measure's" : "breadth-first (the measure found none)"}</td></tr>`;
};

// What goes with extra moves, over every goal searched.
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const byFewest = [6, 8, 10, 12, 14, 16].map((f) => {
  const at = lines.filter((l) => l.fewest >= f && l.fewest < f + 2);
  const zeroOne = at.filter((l) => l.extra.most <= 1).length, three = at.filter((l) => l.extra.least >= 3).length;
  return `<tr><td>${f}–${f + 1}</td><td>${at.length}</td><td>${mean(at.map((l) => l.extra.least)).toFixed(1)}</td><td>${at.length ? Math.round((100 * zeroOne) / at.length) : 0}%</td><td>${at.length ? Math.round((100 * three) / at.length) : 0}%</td><td>${mean(at.map((l) => (l.proof.redMoves > 1 ? 1 : 0))).toFixed(2)}</td><td>${mean(at.map((l) => l.decisions)).toFixed(1)}</td><td>${mean(at.map((l) => l.pieces.length)).toFixed(1)}</td></tr>`;
});
const mid = lines.filter((l) => l.fewest >= 10 && l.fewest <= 14);
const lowMid = mid.filter((l) => l.extra.most <= 1), highMid = mid.filter((l) => l.extra.least >= 4);
const highBoards = new Set(highMid.map((l) => l.seed)).size, sharedBoards = [...new Set(highMid.map((l) => l.seed))].filter((seed) => lowMid.some((l) => l.seed === seed)).length;
const varies = lines.filter((l) => l.extra.least !== l.extra.most).length;
const measureMissed = lines.filter((l) => l.measure.moves === null).length, measureLonger = lines.filter((l) => l.measure.moves !== null && l.measure.moves > l.fewest).length;
const redShare = mean(lines.filter((l) => l.proof.extra > 0).map((l) => (l.proof.extra - l.proof.extraNoRed) / l.proof.extra));
const contrast = (f: (l: Line) => number, digits = 1) => `${mean(lowMid.map(f)).toFixed(digits)} against ${mean(highMid.map(f)).toFixed(digits)}`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Extra moves: trial pairs</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #f6f5f1; max-width: 980px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-size: 24px; margin-bottom: 4px; } h2 { font-size: 18px; margin-top: 32px; }
  .links a { display: inline-block; margin: 4px 8px 4px 0; padding: 8px 16px; border-radius: 8px; background: #1d1d1f; color: #f3f2ee; text-decoration: none; font-weight: 600; }
  table { border-collapse: collapse; margin: 12px 0; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 10px; border-bottom: 1px solid #dedad0; text-align: left; vertical-align: top; }
  td.high { color: #b5341e; font-weight: 600; } td.low { color: #2f6db5; font-weight: 600; }
  details { margin-top: 24px; } summary { cursor: pointer; font-weight: 600; font-size: 17px; }
  .boards { display: flex; flex-wrap: wrap; gap: 20px; }
  .boards figure { margin: 0; } figcaption { font-size: 13px; color: #55524b; }
  .what { color: #55524b; }
</style></head><body>
<h1>Extra moves: trial pairs</h1>
<p class="what">Extra moves (cycle complexity): Σ over the blocks a solution moves of (times moved − 1), the moves less the distinct blocks moved; red counts. In a shortest solution a block never moves twice in a row, so each extra move is a block that has to come back after others moved. Each pair below has one goal with many extra moves and one with none or few, at the same fewest moves; which is which is in the answer key. Play each, note how it felt, then open the key.</p>

<h2>Play (blind)</h2>
${pairs.map((p, k) => `<p class="links">About ${p.level} moves: ${trials.slice(2 * k, 2 * k + 2).map((t) => `<a href="../?trial=${t.label}">${t.label}</a>`).join("")}</p>`).join("\n")}
<p class="what">A trial opens its board with its one goal and its label at the bottom left; nothing is stored, and a reload starts it over.</p>

<details><summary>Answer key (open after playing)</summary>
<table><tr><th>Trial</th><th>Side</th><th>Fewest</th><th>Extra (every shortest)</th><th>Extra, the proof</th><th>Decisions</th><th>Blocks moved</th><th>Board</th><th>States</th><th>Proof</th></tr>
${trials.map(row).join("\n")}
</table>
<p class="what">Fewest: exact, by a breadth-first search of every state the board can reach. Extra (every shortest): the least and the most over every shortest solution (one number when all agree). Decisions: the Judge's, along the proof. In the pictures: red, its target dashed; blue blocks move once in the proof, yellow ones more often (the number is how many times), grey ones not at all.</p>
<div class="boards">
${trials.map((t) => `<figure>${picture(t.line)}<figcaption>${t.label}: ${t.side}, ${t.line.fewest} moves, ${t.line.extra.least} extra, ${t.line.decisions} decisions</figcaption></figure>`).join("\n")}
</div>
</details>

<h2>What goes with extra moves</h2>
<p class="what">${all.toLocaleString("en")} goals of 6 moves or more on random walled boards (6x6 with 10 to 14 blocks and up to 2 walls inside; 7x7 with 13 to 17 blocks and up to 4 walls), each goal a block to a place in its lane, its fewest exact.</p>
<table><tr><th>Fewest</th><th>Goals</th><th>Extra, mean</th><th>0–1 extra</th><th>3+ extra</th><th>Red moves twice+</th><th>Decisions, mean</th><th>Blocks on board</th></tr>
${byFewest.join("\n")}
</table>
<ul>
<li>Extra moves grow with the length: under 8 moves almost every goal has none or one, past 14 almost none does. A long goal with none is a long chain, each block in the way of the one before and every one moving once.</li>
<li>At the same length (10 to 14 moves) the board hardly tells them apart: goals with 0–1 extra and those with 4+ have about as many blocks (${contrast((l) => l.pieces.length)}), walls inside (${contrast((l) => l.walls.length)}) and reachable states (median ${median(lowMid.map((l) => l.states)).toLocaleString("en")} and ${median(highMid.map((l) => l.states)).toLocaleString("en")}), and ${sharedBoards} of the ${highBoards} boards with a 4+ goal also hold a 0–1 one. It is the goal: which block, and where to. With many extra moves red moves more often (${contrast((l) => l.proof.redMoves)} times), the busiest block more often (${contrast((l) => Math.max(...l.proof.blocks.map((j) => l.proof.blocks.filter((k) => k === j).length)))}), and the decisions are more (${contrast((l) => l.decisions)}): fewer blocks, taking turns, rather than many blocks each stepping aside once. So a maker that wants them can search goals on a board, not boards: score each candidate by its proof's extra moves.</li>
<li>Red itself is ${Math.round(100 * redShare)}% of the extra moves in the proofs that have any (red going part way, then on once the way is cleared further).</li>
<li>Shortest solutions rarely differ in their extra moves: ${varies} of ${all} goals have shortest solutions with different counts, so the proof's count is nearly always what the player is held to.</li>
<li>The game's measure found no solution within its window and budget for ${measureMissed} of these goals, and a longer one than the fewest for ${measureLonger}; their proof here is a breadth-first one.</li>
</ul>
</body></html>
`;
function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}
writeFileSync("reports/extra-moves.html", html);
for (const t of trials) console.log(t.label, t.side, t.line.size, t.line.seed, "fewest", t.line.fewest, "extra", t.line.extra, "decisions", t.line.decisions, "blocks", t.line.pieces.length);
