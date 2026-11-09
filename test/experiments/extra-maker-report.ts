// reports/extra-maker.html: the maker before and after it weighed extra moves, from
// extra-maker.ts's files (the same seeds both times; before-*.jsonl made on the commit before),
// two Bench runs (bench/results JSON, judged here as the Judge now counts, against today's
// Records) and maker-trials.ts's pairs:
//   bun test/experiments/extra-maker-report.ts --before-bench <results.json> --after-bench <results.json> [--data data/extra-maker]
import { readFileSync, writeFileSync } from "node:fs";
import type { Case } from "../../bench/cases";
import type { Records, Result } from "../../bench/run";
import { judge } from "../../src/judge";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1]! : fallback;
};
const dir = arg("data", "data/extra-maker");
type Line = { found: boolean; proof: number; aim: number | null; exact: boolean; extra: number; redMoves: number; decisions: number; ms: number };
const read = (f: string): Line[] => readFileSync(`${dir}/${f}.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN; };
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
const f1 = (x: number) => x.toFixed(1), pc = (x: number) => `${Math.round(100 * x)}%`;

function stats(rows: Line[]) {
  const ok = rows.filter((r) => r.found);
  const share = (f: (r: Line) => boolean) => ok.filter(f).length / Math.max(1, ok.length);
  return {
    boards: rows.length, found: ok.length / rows.length, fewestMed: pct(ok.map((r) => r.proof), 0.5), fewestMean: mean(ok.map((r) => r.proof)),
    off: ok[0]?.aim == null ? null : mean(ok.map((r) => Math.abs(r.proof - r.aim!))), exact: share((r) => r.exact),
    // Proved: counted only where the maker's measure proved the proof shortest (as the Judge
    // counts them on the Bench); the proof's own count can be an artefact of a longer proof.
    extra: mean(ok.map((r) => (r.exact ? r.extra : 0))), proofExtra: mean(ok.map((r) => r.extra)),
    hist: [0, 1, 2].map((k) => share((r) => (r.exact ? r.extra : 0) === k)).concat(share((r) => r.exact && r.extra >= 3)),
    red2: share((r) => r.redMoves >= 2), decisions: mean(ok.map((r) => r.decisions)), msMed: pct(rows.map((r) => r.ms), 0.5), ms95: pct(rows.map((r) => r.ms), 0.95),
  };
}
type S = ReturnType<typeof stats>;
const RUNS = [
  ["e0", "0", "12", "0", "12 (the trials')"], ["e0", "0.04", "12", "4%", "12 (the trials')"], ["e0", "0.12", "12", "12%", "12 (the trials')"],
  ["e0", "0", "6", "0", "6 (ramp, early)"], ["e0", "0.04", "6", "4%", "6 (ramp, early)"],
  ["e0", "0", "none", "0", "none (after the ramp)"], ["e0", "0.04", "none", "4%", "none (after the ramp)"], ["e0", "0.12", "none", "12%", "none (after the ramp)"],
  ["e2", "0", "12", "0", "12"], ["e2", "0.04", "12", "4%", "12"], ["e2", "0.12", "12", "12%", "12"], ["e2", "0", "none", "0", "none"], ["e2", "0.04", "none", "4%", "none"], ["e2", "0.12", "none", "12%", "none"],
] as const;
const cell = (b: number, a: number, fmt: (x: number) => string) => `${fmt(b)} → <b>${fmt(a)}</b>`;
const rows = RUNS.map(([e, w, aim, wl, aiml]) => {
  const b = stats(read(`before-${e}-w${w}-a${aim}`)), a = stats(read(`after-${e}-w${w}-a${aim}`));
  const hist = (s: S) => s.hist.map(pc).join(" / ");
  return `<tr><td>${e === "e0" ? "0 (waited for)" : "2 (made ahead)"}</td><td>${wl}</td><td>${aiml}</td><td>${b.boards}</td><td>${cell(b.extra, a.extra, (x) => x.toFixed(2))}</td><td>${cell(b.proofExtra, a.proofExtra, f1)}</td><td class="l">${hist(b)}<br><b>${hist(a)}</b></td><td>${cell(b.red2, a.red2, pc)}</td><td>${cell(b.fewestMed, a.fewestMed, String)}</td><td>${cell(b.fewestMean, a.fewestMean, f1)}</td><td>${b.off === null ? "–" : cell(b.off, a.off!, f1)}</td><td>${cell(b.decisions, a.decisions, f1)}</td><td>${cell(b.found, a.found, pc)}</td><td>${cell(b.exact, a.exact, pc)}</td><td>${cell(b.msMed, a.msMed, (x) => String(Math.round(x)))}</td><td>${cell(b.ms95, a.ms95, (x) => String(Math.round(x)))}</td></tr>`;
});

// The Bench: both runs judged as the Judge now counts, against today's Records.
const cases = new Map((JSON.parse(readFileSync("bench/cases-full.json", "utf8")) as Case[]).map((c) => [c.name, c]));
const records: Records = JSON.parse(readFileSync("bench/records.json", "utf8"));
function bench(file: string) {
  const { results } = JSON.parse(readFileSync(file, "utf8")) as { results: Result[] };
  const q: number[] = [], extra: number[] = [], moves: number[] = [];
  for (const r of results) {
    if (!r.goal || !r.verdict?.ok || !r.audit) { q.push(0); continue; }
    const t = judge(cases.get(r.name)!.request, r.goal, { fewest: r.audit.fewest, shorter: r.audit.shorter?.moves, proved: r.audit.exact });
    q.push(t.fitness / records[r.name]!.fitness);
    extra.push(t.extra);
    moves.push(t.moves);
  }
  const ms = results.map((r) => r.ms);
  return { cases: results.length, legal: results.filter((r) => r.verdict?.ok).length / results.length, qMed: pct(q, 0.5), q5: pct(q, 0.05), msMed: pct(ms, 0.5), ms95: pct(ms, 0.95), extra: mean(extra), moves: mean(moves), padded: results.filter((r) => r.audit?.padding).length };
}
const bb = bench(arg("before-bench", "")), ba = bench(arg("after-bench", ""));
const f2 = (x: number) => x.toFixed(2);

// The trial pairs.
type Pair = { label: string; seed: number; walls: number; sides: { label: string; side: "before" | "after"; box: { x: number; y: number; width: number; height: number }; blocks: { id: string; x: number; y: number; w: number; h: number; wall?: boolean }[]; goal: { red: string; target: { x: number; y: number }; fewest: number; exact: boolean; extra: number; redMoves: number; decisions: number; solution: { id: string }[]; endless: { proof: number; extra: number } } }[] };
const pairs: Pair[] = JSON.parse(readFileSync(`${dir}/trials.json`, "utf8"));
function picture(p: Pair["sides"][number], cell = 22) {
  const { box, goal: g } = p, X = (x: number) => (x - box.x + 1) * cell, Y = (y: number) => (y - box.y + 1) * cell;
  const times = new Map<string, number>();
  g.solution.forEach((m) => times.set(m.id, (times.get(m.id) ?? 0) + 1));
  let s = `<svg viewBox="0 0 ${(box.width + 2) * cell} ${(box.height + 2) * cell}" width="${(box.width + 2) * cell}" role="img" aria-label="${p.label} board">`;
  for (const b of p.blocks) {
    if (b.wall) { s += `<rect x="${X(b.x)}" y="${Y(b.y)}" width="${cell}" height="${cell}" fill="var(--wall)"/>`; continue; }
    const n = times.get(b.id) ?? 0, fill = b.id === g.red ? "var(--red)" : n > 1 ? "var(--again)" : n ? "var(--once)" : "var(--still)";
    s += `<rect x="${X(b.x) + 2}" y="${Y(b.y) + 2}" width="${b.w * cell - 4}" height="${b.h * cell - 4}" rx="4" fill="${fill}"/>`;
    if (n > 1) s += `<text x="${X(b.x) + (b.w * cell) / 2}" y="${Y(b.y) + (b.h * cell) / 2 + 4}" text-anchor="middle" font-size="11" fill="#1d1d1f">${n}</text>`;
  }
  const red = p.blocks.find((b) => b.id === g.red)!;
  return s + `<rect x="${X(g.target.x) + 1}" y="${Y(g.target.y) + 1}" width="${red.w * cell - 2}" height="${red.h * cell - 2}" rx="5" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-dasharray="5 3"/></svg>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The maker and extra moves</title>
<meta name="date" content="${new Date().toISOString().slice(0, 10)}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --wall: #55524b; --red: #e0453a; --again: #f2b632; --once: #8fb3d9; --still: #d8d4ca; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --wall: #8a877f; --still: #4a4944; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 56px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 19px; margin: 34px 0 8px; }
  .sub { color: var(--ink-2); max-width: 85ch; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; margin-bottom: 10px; }
  table { border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 9px; border-bottom: 1px solid var(--line); text-align: right; vertical-align: top; }
  td.l, th.l { text-align: left; } th { color: var(--ink-2); font-weight: 600; }
  .links a { display: inline-block; margin: 4px 8px 4px 0; padding: 8px 16px; border-radius: 8px; background: var(--ink); color: var(--bg); text-decoration: none; font-weight: 600; }
  details { margin-top: 18px; } summary { cursor: pointer; font-weight: 600; }
  .boards { display: flex; flex-wrap: wrap; gap: 18px; } figure { margin: 0; } figcaption { font-size: 13px; color: var(--ink-2); max-width: 340px; }
  ul { max-width: 85ch; }
</style></head><body><main>
<p><a href="./">Reports</a></p>
<h1>The maker and extra moves</h1>
<p class="sub">Extra moves: Σ over the blocks a solution moves of (times moved − 1), red counting (reports/extra-moves.html: in blind pairs the side with more was preferred at 12 and 16 moves). The Judge now weighs them: its balance multiplies by (1 + extra moves / fewest moves)^4, a share, so a goal is not better for being longer. The maker weighs them the same way in its rank of the candidates and its pick among the finalists, but only those its measure vouches for (src/goal-search.ts extraOf): all of a proof it proved shortest, else no more than the fewest it is known to need less the blocks the proof moves. A push's proof is tidied first (no move, nor two moves of one block, it can drop), and the Referee's tidy rule now also rejects two moves of one block that can be dropped together. Before is the commit before the change, on the same seeds.</p>

<h2>The goals picked, before → after</h2>
<p class="sub">Fresh boards at the game's density (12), the goal made round the origin, ${RUNS.length} runs. Extra moves and the fewest are the maker's proof's (the measure's shortest where it finished: "exact"). Extra histogram: shares with 0 / 1 / 2 / 3 / 4+ extra moves. Off aim: mean moves from the aim. Times on this VM, two runs at once on its 2 cores (relative, not the Gate's).</p>
<div class="card"><table><tr><th class="l">Effort</th><th>Walls</th><th>Aim</th><th>Boards</th><th>Extra, proved</th><th>Extra, the proof's</th><th class="l">Proved extra 0 / 1 / 2 / 3+</th><th>Red moves 2×+</th><th>Fewest, median</th><th>Fewest, mean</th><th>Off aim</th><th>Decisions</th><th>Found</th><th>Exact</th><th>Maker ms, median</th><th>95%</th></tr>
${rows.join("\n")}
</table></div>

<h2>The Bench</h2>
<p class="sub">Today's maker at effort 0 on the full set (${ba.cases} cases, no walls), both runs judged as the Judge now counts against today's Records (the Records judged again too: bench/rejudge.ts).</p>
<div class="card"><table><tr><th class="l">Run</th><th>Legal</th><th>Quality, median</th><th>Worst 5%</th><th>ms, median</th><th>Slowest 5%</th><th>Extra, mean</th><th>Fewest, mean</th><th>Padded</th></tr>
${([["before", bb], ["after", ba]] as const).map(([n, s]) => `<tr><td class="l">${n}</td><td>${pc(s.legal)}</td><td>${f2(s.qMed)}</td><td>${f2(s.q5)}</td><td>${Math.round(s.msMed)}</td><td>${Math.round(s.ms95)}</td><td>${f1(s.extra)}</td><td>${f1(s.moves)}</td><td>${s.padded}</td></tr>`).join("\n")}
</table></div>

<h2>What it does and does not do</h2>
<ul>
<li><b>It hardly changes which goal is picked</b>: none of the boards at aim 12, 1 to 5 in 100 at aim 6, and 5 to 11 in 100 with no aim (shorter goals with an extra move the measure proved). The fewest moves, decisions and found rate stay as they were; the time is about the same (the tidying is a few percent).</li>
<li><b>Because the extra moves on the maker's proofs are mostly not there.</b> A first version weighed the proof's own count: at aim 12 its goals' extra moves went from 0.4 up to 1.5, and with no aim from 1.2 up to 3.0 (with longer goals). But six of those goals, with 3 to 8 extra moves on proofs of 15 to 24 moves, searched to 1.5 million boards, each had a shortest solution 2 to 10 moves shorter with none (data/extra-maker/deep-audit.jsonl): a push's proof, or the measure's within its window, is a detour that moves blocks again where a shortest solution does not. It picked long detours, and the game would have shown them as the fewest.</li>
<li><b>And the goals with real extra moves are hardly ever there.</b> Every candidate within a move of 12, measured with 50,000 boards and the blocks that matter (as effort 2 does): of the 234 the measure proved shortest on 60 boards at 0 and 4% walls, none had more than 1 extra move; of the goals the maker picked whose fewest it proved, none of 391 had 2 or more. At 12% walls 2 of 15 boards had one (2 and 4 extra), at density 20 none. Extra moves come from confined space (the trials' walled squares); the game's boards near the player are open.</li>
<li>So the pool is the limit, but not its reach: pushes stop at their tick share (about 11 cells at effort 0, nearly all of it the cost per cell), and letting red step back for a block to pass when a push is stuck added nothing. The re-moved blocks in reports/walls.html were counted on the same proofs, so they were mostly detours too.</li>
<li>The Referee never discouraged extra moves (a shortest solution with them is tidy and well under 100 moves); its new pair rule only rejects padding, which a shortest solution never has. The Judge counts extra moves on the Auditor's shorter solution when it finds one, and only when it proved the fewest.</li>
<li>Given time to spare (30 finalists measured with 50,000 boards each, 2 to 21 s a goal at effort 0), the maker hits the aim (off by 0.3 at 4% walls, 2.2 before) and at 12% walls finds proved goals with 2 to 4 extra moves on 5 of 100 boards, where the maker without it found 3 of them too, unproved. The trial below is the one where it picked a different goal and both held up on their own cut of the board.</li>
</ul>

<h2>Trials: before or after (blind)</h2>
<p class="sub">One pair, on one board (seed 1200012, 12% walls, aim 12): the goal the maker picked before, and the one it picks given time to spare (above), each on its own cut of the board (2 cells past every cell its proof uses, walled round) and measured again there as far as the Auditor looks. Only one board in 100 gave such a pair. Play both, note which felt better, then open the key. Their play is logged (play-data/trial-&lt;label&gt;-*.json).</p>
${pairs.map((p) => `<p class="links">Board ${p.label.slice(1)}: ${p.sides.map((s) => `<a href="../?trial=${s.label}">${s.label}</a>`).join("")}</p>`).join("\n")}
<details><summary>Answer key (open after playing)</summary>
<div class="card"><table><tr><th class="l">Trial</th><th class="l">Maker</th><th>Fewest</th><th>Extra</th><th>Red moves</th><th>Decisions</th><th>Blocks moved</th><th class="l">Board</th></tr>
${pairs.flatMap((p) => p.sides.map((s) => `<tr><td class="l"><a href="../?trial=${s.label}">${s.label}</a></td><td class="l">${s.side === "after" ? "after (with time to spare)" : "before"}</td><td>${s.goal.fewest}${s.goal.exact ? "" : " (not proved fewest)"}</td><td>${s.goal.extra}</td><td>${s.goal.redMoves}</td><td>${s.goal.decisions}</td><td>${new Set(s.goal.solution.map((m) => m.id)).size}</td><td class="l">seed ${p.seed}, ${p.walls ? `${p.walls * 100}% walls` : "no walls"}, ${s.box.width}×${s.box.height}</td></tr>`)).join("\n")}
</table></div>
<p class="sub">Red, its target dashed; blue blocks move once in the proof, yellow ones more (the number is how often), grey ones not at all.</p>
<div class="boards">
${pairs.flatMap((p) => p.sides.map((s) => `<figure>${picture(s)}<figcaption>${s.label}: ${s.side}, ${s.goal.fewest} moves, ${s.goal.extra} extra (on the endless board: ${s.goal.endless.proof} moves, ${s.goal.endless.extra} extra)</figcaption></figure>`)).join("\n")}
</div>
</details>
</main></body></html>
`;
writeFileSync("reports/extra-maker.html", html);
console.log("reports/extra-maker.html");
