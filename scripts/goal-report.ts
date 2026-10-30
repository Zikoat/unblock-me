// A goal report: makes goals the way the game does on random boards from sparse to dense,
// measures each one's difficulty, and charts the spread per density (5th, 25th, 50th, 75th
// and 95th percentile). Goals from sent play data (play-data/*.json, newest file) are drawn
// on top. Writes dist/reports/goals-<time>.html and refreshes the report list. Run it capped:
//   scripts/capped.sh 1500 900 bun scripts/goal-report.ts [boards per density]
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { difficulty, starsEarned, starsFor } from "../src/difficulty";
import type { Goal } from "../src/goal";
import { makeGoalFast } from "../src/goal-fast";
import { randomLayout, TRIES } from "../src/layout";
import { reportPage } from "./report-page";
import { reportsDir, writeReportsIndex } from "./reports-index";

const SWEEP = [1, 2, 4, 7, 10, 13, 15, 20, 25, 30];
const BOARDS = Number(process.argv[2] ?? 30);

type Sample = { score: number; moves: number; capped: boolean; branching: number; distance: number; solution: number; makeMs: number; measureMs: number; stars: number };
const METRICS = [
  { key: "score", name: "Difficulty", sub: "log2(branching^fewest moves); the star range is the 5th to 95th percentile", digits: 1 },
  { key: "moves", name: "Fewest moves", sub: "One move is one block sliding any distance. Capped searches give a lower bound (marked ≥).", digits: 0 },
  { key: "branching", name: "Moves to choose from", sub: "Average moves available on a board along the way", digits: 0 },
  { key: "distance", name: "Distance", sub: "Cells from the red block's start to its target", digits: 0 },
  { key: "solution", name: "Moves in the made solution", sub: "The generator's own solution, an upper bound on fewest moves", digits: 0 },
  { key: "stars", name: "Stars it is worth", sub: "0 to 10, from its difficulty within its density's usual range", digits: 0 },
  { key: "measureMs", name: "Time to measure difficulty (ms)", sub: "On this VM; phones are several times slower", digits: 0 },
  { key: "makeMs", name: "Time to make the goal (ms)", sub: "On this VM", digits: 0 },
] as const;
type Key = (typeof METRICS)[number]["key"];

const quantiles = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
  return { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
};

const rows = SWEEP.map((tries) => {
  const samples: Sample[] = [];
  for (let seed = 1; seed <= BOARDS; seed++) {
    const layout = randomLayout(seed * 7919, { tries });
    const near = { x: (seed % 5) * 7, y: 6 + (seed % 3) * 5 };
    let t = performance.now();
    const goal = makeGoalFast(layout, near, { effort: 12, perCell: 6 }, { prune: true, lookahead: true, goalBudget: 50_000 });
    const makeMs = performance.now() - t;
    if (!goal) continue;
    t = performance.now();
    const d = difficulty(layout, new Map(), goal);
    const measureMs = performance.now() - t;
    const red = layout.byId(goal.id)!;
    samples.push({
      score: d.score, moves: d.moves ?? d.atLeast, capped: d.moves === null, branching: d.branching,
      distance: Math.abs(goal.target.x - red.x) + Math.abs(goal.target.y - red.y), solution: goal.solution.length,
      makeMs, measureMs, stars: starsFor(d.score, tries),
    });
  }
  const stats = Object.fromEntries(METRICS.map((m) => [m.key, quantiles(samples.map((s) => s[m.key]))])) as Record<Key, ReturnType<typeof quantiles>>;
  console.log(`tries ${tries}: ${samples.length} goals, difficulty median ${stats.score.p50.toFixed(1)}`);
  return { tries, goals: samples.length, capped: samples.filter((s) => s.capped).length, stats };
});

// The player's goals, from the newest play data sent from the game.
type Played = { tries: number; score: number; moves: number; capped: boolean; branching: number; distance: number; solution: number; used: number | null; stars: number; earned: number | null };
const played: Played[] = [];
let playedFrom = "";
try {
  const dir = join(import.meta.dir, "..", "play-data");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length) {
    playedFrom = files.at(-1)!;
    const data = JSON.parse(await readFile(join(dir, playedFrom), "utf8"));
    const stored = Object.entries(data.stored as Record<string, unknown>).find(([k]) => k.endsWith(":goal"))?.[1] as { tries: number; done?: Goal[] } | undefined;
    for (const g of stored?.done ?? []) {
      const d = g.difficulty;
      if (!d) continue;
      const tries = g.tries ?? stored!.tries;
      const stars = starsFor(d.score, tries);
      played.push({
        tries, score: d.score, moves: d.moves ?? d.atLeast, capped: d.moves === null, branching: d.branching,
        distance: g.start ? Math.abs(g.target.x - g.start.x) + Math.abs(g.target.y - g.start.y) : NaN, solution: g.solution.length,
        used: g.used ?? null, stars, earned: g.used ? starsEarned(stars, d.moves ?? d.atLeast, g.used) : null,
      });
    }
  }
} catch {
  // No play data sent yet.
}

const made = new Date();
const stamp = made.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const total = rows.reduce((n, r) => n + r.goals, 0);
const description = `${total} goals over ${SWEEP.length} densities${played.length ? `, ${played.length} played` : ""}`;

const html = reportPage({
  title: "Goal report",
  description,
  css: `
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--ink-2); margin: 4px 0 4px; }
  .legend .box::before { content: ""; display: inline-block; width: 8px; height: 12px; border-radius: 2px; background: var(--s1); opacity: .35; vertical-align: middle; margin-right: 6px; }
  .legend .mid::before { content: ""; display: inline-block; width: 10px; height: 2px; background: var(--s1); vertical-align: middle; margin-right: 6px; }
  .legend .you::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--s2); vertical-align: middle; margin-right: 6px; }
  svg { display: block; width: 100%; overflow: visible; touch-action: pan-y; }
  svg text { font: 11px system-ui, sans-serif; fill: var(--muted); font-variant-numeric: tabular-nums; }
  .tip { position: fixed; pointer-events: none; background: var(--surface); border: 1px solid var(--ring); border-radius: 8px; padding: 8px 10px; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.12); display: none; min-width: 170px; z-index: 2; font-variant-numeric: tabular-nums; }
  .tip .head { color: var(--ink-2); margin-bottom: 4px; }
  details { margin-top: 18px; }
  summary { cursor: pointer; color: var(--ink-2); }
  tr.app td { font-weight: 600; }`,
  body: `
  <h1>Goal report</h1>
  <p class="lede">Goals made the way the game makes them, ${BOARDS} random boards per density (tries per chunk; the game uses
  ${TRIES} now). Each bar shows the middle half of the goals (25th to 75th percentile), the line through it the median, and the
  whiskers the 5th to 95th percentile.${played.length ? ` Orange dots are your ${played.length} reached goals (from ${playedFrom}).` : " No play data has been sent yet; send it with the upload block in the game."}
  Made ${made.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>
  <div class="legend"><span class="box">Middle half</span><span class="mid">Median</span>${played.length ? `<span class="you">Your goals</span>` : ""}</div>
  ${METRICS.map((m) => `
  <section class="card">
    <h2>${m.name}</h2>
    <p class="sub">${m.sub}</p>
    <svg id="${m.key}" height="200" role="img" aria-label="${m.name} by density"></svg>
  </section>`).join("")}
  ${played.length ? `<section class="card">
    <h2>Your goals</h2>
    <p class="sub">Fewest moves against the moves you used: on the diagonal is a perfect solve</p>
    <svg id="you" height="240" role="img" aria-label="Your moves used against the fewest moves"></svg>
  </section>` : ""}
  <details>
    <summary>Table</summary>
    <div class="table-wrap"><table id="table"></table></div>
  </details>
  <ul class="notes">
    <li>Difficulty: an A* search finds the fewest moves in a window around the goal, sliding only the blocks the made solution moves and the blocks in their lanes. It is capped at 50,000 boards; ${rows.reduce((n, r) => n + r.capped, 0)} of ${total} goals hit the cap, and then the fewest moves is a lower bound.</li>
    <li>Goals are made near a point away from the middle, on untouched boards (no moved blocks).</li>
  </ul>
<div class="tip" id="tip" role="status"></div>
`,
  script: `
const ROWS = ${JSON.stringify(rows)};
const PLAYED = ${JSON.stringify(played)};
const METRICS = ${JSON.stringify(METRICS)};
const APP_TRIES = ${TRIES};
const NS = "http://www.w3.org/2000/svg";
const css = (name) => getComputedStyle(document.querySelector(".viz-root")).getPropertyValue(name).trim();
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
};
function nice(max) {
  if (max <= 0) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}
const tip = document.getElementById("tip");
function showTip(lines, e) {
  tip.replaceChildren(...lines.map((t, i) => { const d = document.createElement("div"); if (!i) d.className = "head"; d.textContent = t; return d; }));
  tip.style.display = "block";
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14) + "px";
  tip.style.top = Math.min(innerHeight - tip.offsetHeight - 8, Math.max(8, e.clientY - tip.offsetHeight / 2)) + "px";
}
const hideTip = () => (tip.style.display = "none");

function axes(svg, width, height, pad, yMax, y) {
  for (let i = 0; i <= 4; i++) {
    const v = (yMax / 4) * i;
    el("line", { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), stroke: css(i ? "--grid" : "--axis"), "stroke-width": 1 }, svg);
    el("text", { x: pad.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = +v.toFixed(1);
  }
}

function render() {
  for (const m of METRICS) {
    const svg = document.getElementById(m.key);
    svg.replaceChildren();
    const width = svg.clientWidth, height = +svg.getAttribute("height");
    const pad = { l: 40, r: 10, t: 10, b: 26 };
    const mine = PLAYED.map((p) => p[m.key]).filter((v) => Number.isFinite(v));
    const yMax = nice(Math.max(...ROWS.map((r) => r.stats[m.key].p95), ...mine, 0) * 1.05);
    const y = (v) => height - pad.b - (v / yMax) * (height - pad.t - pad.b);
    const slot = (width - pad.l - pad.r) / ROWS.length;
    const x = (i) => pad.l + slot * (i + 0.5);
    axes(svg, width, height, pad, yMax, y);
    const box = Math.min(22, slot * 0.45);
    ROWS.forEach((r, i) => {
      const s = r.stats[m.key];
      el("text", { x: x(i), y: height - 8, "text-anchor": "middle", fill: r.tries === APP_TRIES ? css("--ink") : css("--muted") }, svg).textContent = r.tries;
      el("line", { x1: x(i), x2: x(i), y1: y(s.p5), y2: y(s.p95), stroke: css("--s1"), "stroke-width": 1.5 }, svg);
      for (const v of [s.p5, s.p95]) el("line", { x1: x(i) - box / 4, x2: x(i) + box / 4, y1: y(v), y2: y(v), stroke: css("--s1"), "stroke-width": 1.5 }, svg);
      el("rect", { x: x(i) - box / 2, y: y(s.p75), width: box, height: Math.max(1, y(s.p25) - y(s.p75)), rx: 3, fill: css("--s1"), "fill-opacity": 0.3, stroke: css("--surface"), "stroke-width": 1 }, svg);
      el("line", { x1: x(i) - box / 2, x2: x(i) + box / 2, y1: y(s.p50), y2: y(s.p50), stroke: css("--s1"), "stroke-width": 2.5 }, svg);
      const hit = el("rect", { x: x(i) - slot / 2, y: pad.t, width: slot, height: height - pad.t - pad.b, fill: "transparent" }, svg);
      const f = (v) => v.toFixed(m.digits);
      hit.addEventListener("pointermove", (e) => showTip([r.tries + " tries · " + r.goals + " goals" + (m.key === "moves" && r.capped ? " (" + r.capped + " capped, ≥)" : ""),
        "95th " + f(s.p95), "75th " + f(s.p75), "median " + f(s.p50), "25th " + f(s.p25), "5th " + f(s.p5)], e));
      hit.addEventListener("pointerleave", hideTip);
    });
    // Your goals, at their density's slot, spread a little sideways.
    PLAYED.forEach((p, j) => {
      const v = p[m.key];
      if (!Number.isFinite(v)) return;
      let i = ROWS.findIndex((r) => r.tries >= p.tries);
      if (i < 0) i = ROWS.length - 1;
      const dot = el("circle", { cx: x(i) + box / 2 + 6 + (j % 3) * 4, cy: y(v), r: 4, fill: css("--s2"), stroke: css("--surface"), "stroke-width": 1.5 }, svg);
      dot.addEventListener("pointermove", (e) => showTip(["Your goal at " + p.tries + " tries", m.name + ": " + v.toFixed(m.digits)], e));
      dot.addEventListener("pointerleave", hideTip);
    });
  }
  const you = document.getElementById("you");
  if (you) {
    you.replaceChildren();
    const width = you.clientWidth, height = +you.getAttribute("height");
    const pad = { l: 40, r: 10, t: 10, b: 30 };
    const used = PLAYED.filter((p) => p.used !== null);
    const max = nice(Math.max(...used.map((p) => Math.max(p.used, p.moves)), 1) * 1.1);
    const x = (v) => pad.l + (v / max) * (width - pad.l - pad.r);
    const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
    axes(you, width, height, pad, max, y);
    for (let i = 0; i <= 4; i++) el("text", { x: x((max / 4) * i), y: height - 14, "text-anchor": "middle" }, you).textContent = +((max / 4) * i).toFixed(1);
    el("text", { x: (width + pad.l) / 2, y: height - 1, "text-anchor": "middle" }, you).textContent = "fewest moves";
    el("line", { x1: x(0), y1: y(0), x2: x(max), y2: y(max), stroke: css("--axis"), "stroke-dasharray": "4 4" }, you);
    for (const p of used) {
      const dot = el("circle", { cx: x(p.moves), cy: y(p.used), r: 5, fill: css("--s2"), stroke: css("--surface"), "stroke-width": 1.5 }, you);
      dot.addEventListener("pointermove", (e) => showTip(["Your goal at " + p.tries + " tries", "Fewest " + (p.capped ? "≥" : "") + p.moves + ", you used " + p.used, "Difficulty " + p.score.toFixed(1) + ", stars " + p.earned + " of " + p.stars], e));
      dot.addEventListener("pointerleave", hideTip);
    }
  }
}

const table = document.getElementById("table");
const head = table.insertRow();
for (const t of ["Tries", "Goals", "Capped", ...METRICS.map((m) => m.name + " (median)")]) { const th = document.createElement("th"); th.textContent = t; head.appendChild(th); }
for (const r of ROWS) {
  const tr = table.insertRow();
  if (r.tries === APP_TRIES) tr.className = "app";
  for (const v of [r.tries, r.goals, r.capped, ...METRICS.map((m) => r.stats[m.key].p50.toFixed(m.digits))]) tr.insertCell().textContent = v;
}
render();
addEventListener("resize", render);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
`,
});

const file = `goals-${stamp}.html`;
await Bun.write(join(reportsDir, file), html);
await writeReportsIndex();
console.log(`Wrote ${join(reportsDir, file)}`);
