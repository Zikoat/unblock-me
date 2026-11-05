// reports/world-ramp.html from world-ramp.ts's runs (their output in before-<seed>.log and
// after-<seed>.log in one folder), with the island's squares first:
//   bun test/experiments/world-ramp-report.ts <dir> reports/world-ramp.html
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { RAMP, RAMP_FROM, RAMP_TO, rampTarget } from "../../src/goal";
import { islandGoals, isLast, sideOf } from "../../src/island";
import { ISLAND_LEVELS } from "../../src/island-levels";

const [dir, out] = process.argv.slice(2);
type Row = { n: number; distance: number; proof: number; quick: number | null; quickAtLeast: number; long: number | null; longAtLeast: number; longUpper: number | null; target: number | null };
const runs: { seed: number; mode: string; rows: Row[] }[] = [];
// (From their logs, a row a line: a run stopped by its time limit still counts as far as it got.)
for (const f of (await readdir(dir!)).filter((f) => /^(before|after)-\d+\.log$/.test(f)).sort()) {
  const [mode, seed] = f.replace(".log", "").split("-") as [string, string];
  const rows = (await Bun.file(join(dir!, f)).text()).split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Row);
  runs.push({ seed: Number(seed), mode, rows });
}

// The island: each square's fewest moves (exact for all its goals together, tested in
// test/unit/island.test.ts), its goals', and its red block's way to the bay.
const island = ISLAND_LEVELS.map((level, k) => {
  const goals = islandGoals(k), red = level.blocks[0]!, side = sideOf(k);
  return { level: k + 1, side, goals: goals.length, fewest: level.fewest + (isLast(k) ? 2 : 0), each: goals.map((g) => g.solution.length), distance: side - red[0] + (isLast(k) ? 3 : 0) };
});

const data = { runs, island, ramp: { goals: RAMP, from: RAMP_FROM, to: RAMP_TO, targets: Array.from({ length: RAMP }, (_, n) => rampTarget(n)!) } };
const date = new Date().toISOString().slice(0, 10);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>World ramp</title>
<meta name="date" content="${date}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --card: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --line: #e1e0d9; --old: #8a8d91; --new: #d64545; --target: #3a6fb0; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --card: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --line: #2c2c2a; --old: #9a9da2; --new: #e86a6a; --target: #7aa6e0; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 900px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  h1 { font-size: 24px; margin: 10px 0 4px; } h2 { font-size: 18px; margin: 28px 0 8px; }
  .sub { color: var(--ink-2); margin: 0 0 12px; max-width: 72ch; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .tile .big { font-size: 28px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .tile .what { font-size: 13px; color: var(--ink-2); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px; overflow-x: auto; }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--ink-2); margin-bottom: 6px; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .legend i.dash { height: 0; border-top: 2px dashed var(--target); border-radius: 0; vertical-align: 3px; }
  svg { display: block; width: 100%; height: auto; }
  svg text { fill: var(--ink-2); font-size: 11px; }
  table { border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  th, td { padding: 5px 12px; border-bottom: 1px solid var(--line); text-align: left; }
  th { color: var(--ink-2); font-weight: 600; }
  details { margin-top: 10px; } summary { cursor: pointer; color: var(--ink-2); }
  ul { padding-left: 20px; } li { max-width: 70ch; margin: 4px 0; }
</style></head><body><main>
<a class="back" href="./">← All reports</a>
<h1>World ramp</h1>
<p class="sub">The island's squares, then the first 40 goals of the generated world, as a player who plays each goal's proof gets them: before the ramp (each goal the best the search finds near the last) and after it (the goals nearest a target number of fewest moves first, the target rising from ${RAMP_FROM} to ${RAMP_TO} over the first ${RAMP} goals; then none, as before). Seeds: <span id="seeds"></span>.</p>
<div class="tiles" id="tiles"></div>

<h2>What it shows</h2>
<ul>
  <li>Without the ramp the world is flat from its first goal: about 10 fewest moves at the median, spikes over 20, right after the island's last square (15).</li>
  <li>With it the goals follow the target closely: 6 at first, 10 by goal 30, nearly every goal within a move of it, the red block nearer its target too (4-8 cells at the median, against 5-10).</li>
  <li>Past goal 30 (no target) both are alike, as they should be: varied again, 4 to over 20.</li>
  <li>An earlier try capped the fewest moves instead (8 rising to 20): it trimmed the spikes but hardly moved the median (8 for goals 1-10, about 10 by goal 30), as the search seldom picks a goal near the cap.</li>
  <li>The game's quick measure agrees with the long one as tuned: the long one found fewer moves than the goal's proof for 4-7% of goals, 0.1-0.2 moves on average.</li>
</ul>

<h2>The island</h2>
<p class="sub">Fewest moves are exact, for all of a square's goals together (a breadth-first search over every board; a goal counts as its block lands on its target). The last square's include the blocker past its bay and the way on to its target. Distance: cells the red block goes, to its bay (the last: its target).</p>
<div class="card"><table id="island"></table></div>

<h2>Fewest moves, goal by goal</h2>
<p class="sub">The long measure's fewest moves (or its lower bound where it stopped) per goal after the island: the line is the median over the seeds, the band the lowest to highest.</p>
<div class="card"><div class="legend"><span><i style="background:var(--old)"></i>Before</span><span><i style="background:var(--new)"></i>After</span><span><i class="dash"></i>Target</span></div><svg id="fewest" role="img" aria-label="Fewest moves per goal, before and after the ramp"></svg></div>

<h2>Distance to the target</h2>
<p class="sub">Cells between the red block and its target when the goal is shown, median and range.</p>
<div class="card"><div class="legend"><span><i style="background:var(--old)"></i>Before</span><span><i style="background:var(--new)"></i>After</span></div><svg id="distance" role="img" aria-label="Distance to the target per goal, before and after the ramp"></svg></div>

<h2>Quick and long measures</h2>
<p class="sub">Quick: what the game knows when it shows the goal (its search's own measure: exact, or a lower bound and its proof's length). Long: measured again with up to 200,000 boards in a wider window (3 cells round the red block's run, blocks two lanes away free to move).</p>
<div class="card"><table id="measures"></table></div>

<h2>Every goal</h2>
<details><summary>Per seed, goal by goal</summary><div class="card" style="margin-top:8px"><table id="all"></table></div></details>

<h2>Notes</h2>
<ul id="notes">
  <li>Fewest moves count one block's slide, however far, as one move.</li>
  <li>The simulated player plays each goal's proof, so the board goes on as the game's own solutions leave it; real players leave it otherwise.</li>
  <li>The world's first goal is made while you wait (effort 0) in both runs; in the game it is now made while the island is played (effort 3).</li>
</ul>
<script>
const DATA = ${JSON.stringify(data)};
const $ = (id) => document.getElementById(id);
const fewest = (r) => r.long ?? r.longAtLeast;
const median = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const modes = ["before", "after"];
const byMode = Object.fromEntries(modes.map((m) => [m, DATA.runs.filter((r) => r.mode === m)]));
$("seeds").textContent = [...new Set(DATA.runs.map((r) => r.seed))].join(", ");
const goals = Math.max(...DATA.runs.map((r) => r.rows.length));
const per = (mode, f) => Array.from({ length: goals }, (_, n) => byMode[mode].map((r) => r.rows[n]).filter((r) => r && !r.none).map(f));
const span = (mode, f, from, to) => median(byMode[mode].flatMap((r) => r.rows.slice(from, to).filter((r) => !r.none).map(f)));

const tiles = [
  [span("before", fewest, 0, 10), "fewest moves, goals 1-10, before (median)"],
  [span("after", fewest, 0, 10), "fewest moves, goals 1-10, after (median)"],
  [span("before", fewest, 30, 40), "goals 31-40, before (median)"],
  [span("after", fewest, 30, 40), "goals 31-40, after (median)"],
  [DATA.island.at(-1).fewest, "fewest moves, the island's last square"],
];
$("tiles").innerHTML = tiles.map(([v, w]) => '<div class="tile"><div class="big">' + (Number.isFinite(v) ? v : "–") + '</div><div class="what">' + w + "</div></div>").join("");

$("island").innerHTML = "<tr><th>Level</th><th>Size</th><th>Goals</th><th>Fewest (all goals)</th><th>Each goal's proof</th><th>Distance</th></tr>" +
  DATA.island.map((s) => "<tr><td>" + s.level + "</td><td>" + s.side + "×" + s.side + "</td><td>" + s.goals + "</td><td>" + s.fewest + "</td><td>" + s.each.join(" + ") + "</td><td>" + s.distance + "</td></tr>").join("");

function chart(svg, f, target) {
  const W = 860, H = 300, L = 36, R = 10, T = 10, B = 28;
  const series = modes.map((m) => per(m, f));
  const top = Math.max(...series.flat(2), ...(target ? DATA.ramp.targets : [])) + 1;
  const x = (n) => L + (n / (goals - 1)) * (W - L - R), y = (v) => T + (1 - v / top) * (H - T - B);
  let s = "";
  for (let v = 0; v <= top; v += 5) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
  for (let n = 0; n < goals; n += 5) s += '<text x="' + x(n) + '" y="' + (H - 8) + '" text-anchor="middle">' + (n + 1) + "</text>";
  modes.forEach((m, i) => {
    const color = i ? "var(--new)" : "var(--old)", v = series[i];
    const ok = v.map((a, n) => [a, n]).filter(([a]) => a.length);
    const band = ok.map(([a, n]) => x(n) + "," + y(Math.max(...a))).join(" ") + " " + ok.reverse().map(([a, n]) => x(n) + "," + y(Math.min(...a))).join(" ");
    s += '<polygon points="' + band + '" fill="' + color + '" opacity="0.15"/>';
    const line = v.map((a, n) => (a.length ? x(n) + "," + y(median(a)) : null)).filter(Boolean).join(" ");
    s += '<polyline points="' + line + '" fill="none" stroke="' + color + '" stroke-width="2"/>';
    v.forEach((a, n) => { if (a.length) s += '<circle cx="' + x(n) + '" cy="' + y(median(a)) + '" r="5" fill="' + color + '" opacity="0.001"><title>' + m + ", goal " + (n + 1) + ": median " + median(a) + ", " + Math.min(...a) + "–" + Math.max(...a) + " (" + a.length + " seeds)</title></circle>"; });
  });
  if (target) s += '<polyline points="' + DATA.ramp.targets.map((c, n) => x(n) + "," + y(c)).join(" ") + '" fill="none" stroke="var(--target)" stroke-width="2" stroke-dasharray="5 4"/>';
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.innerHTML = s;
}
chart($("fewest"), fewest, true);
chart($("distance"), (r) => r.distance, false);

$("measures").innerHTML = "<tr><th></th><th>Goals</th><th>Quick exact</th><th>Long exact</th><th>Long found fewer than the proof</th><th>Proof's extra moves (mean)</th></tr>" +
  modes.filter((m) => byMode[m].length).map((m) => {
    const rows = byMode[m].flatMap((r) => r.rows.filter((r) => !r.none));
    const pct = (k) => Math.round((100 * k) / rows.length) + "%";
    const extra = rows.filter((r) => r.long !== null).map((r) => r.proof - r.long);
    return "<tr><td>" + m + "</td><td>" + rows.length + "</td><td>" + pct(rows.filter((r) => r.quick !== null).length) + "</td><td>" + pct(rows.filter((r) => r.long !== null).length) + "</td><td>" + pct(rows.filter((r) => r.long !== null && r.long < r.proof).length) + "</td><td>" + (extra.reduce((a, b) => a + b, 0) / Math.max(1, extra.length)).toFixed(1) + "</td></tr>";
  }).join("");

const shown = (v, low) => (v ?? "≥" + low);
$("all").innerHTML = "<tr><th>Run</th><th>Goal</th><th>Target</th><th>Quick</th><th>Long</th><th>Proof</th><th>Distance</th></tr>" +
  DATA.runs.flatMap((run) => run.rows.filter((r) => !r.none).map((r) => "<tr><td>" + run.mode + " " + run.seed + "</td><td>" + (r.n + 1) + "</td><td>" + (r.target ?? "") + "</td><td>" + shown(r.quick, r.quickAtLeast) + "</td><td>" + shown(r.long, r.longAtLeast) + "</td><td>" + r.proof + "</td><td>" + r.distance + "</td></tr>")).join("");
</script>
</main></body></html>
`;
await Bun.write(out!, html);
console.log(`wrote ${out}: ${runs.length} runs`);
