// A density report: samples blocks on random boards from sparse to dense and charts how
// stuck they are. Writes dist/reports/density-<time>.html and refreshes the report list.
import { join } from "node:path";
import { randomLayout, TRIES } from "../src/layout";
import { summarize, type Summary } from "../src/stats";
import { reportPage } from "./report-page";
import { reportsDir, writeReportsIndex } from "./reports-index";

const SWEEP = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 24, 30]; // tries per chunk
const SEEDS = [11, 22, 33];
// Away from the UI blocks in the middle, so every sampled block is an ordinary one.
const AREA = { x: 100, y: 100, width: 100, height: 100 };

type Row = Summary & { tries: number };

function measure(tries: number): Row {
  const runs = SEEDS.map((seed) => summarize(randomLayout(seed, { tries }), AREA));
  const total = runs.reduce((n, r) => n + r.blocks, 0);
  // Shares and means are weighted by each run's block count; counts are summed.
  const mean = (key: keyof Summary) => runs.reduce((n, r) => n + r[key] * r.blocks, 0) / total;
  return {
    tries,
    blocks: total,
    coverage: runs.reduce((n, r) => n + r.coverage, 0) / runs.length,
    blocksPer100Cells: runs.reduce((n, r) => n + r.blocksPer100Cells, 0) / runs.length,
    stuck: mean("stuck"),
    oneStep: mean("oneStep"),
    twoSteps: mean("twoSteps"),
    threePlus: mean("threePlus"),
    medianSteps: [...runs.map((r) => r.medianSteps)].sort((a, b) => a - b)[1]!,
    meanBlocking: mean("meanBlocking"),
  };
}

const rows = SWEEP.map(measure);
const sampled = rows.reduce((n, r) => n + r.blocks, 0);
const made = new Date();
const stamp = made.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const description = `${SWEEP.length} densities, ${sampled.toLocaleString("en")} blocks sampled`;

const html = reportPage({
  title: "Density report",
  description,
  css: `
  .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--ink-2); margin: 4px 0 4px; }
  .legend span::before { content: ""; display: inline-block; width: 14px; height: 2px; border-radius: 1px; background: var(--key); vertical-align: middle; margin-right: 6px; }
  svg { display: block; width: 100%; overflow: visible; touch-action: pan-y; }
  svg text { font: 11px system-ui, sans-serif; fill: var(--muted); font-variant-numeric: tabular-nums; }
  svg .label { fill: var(--ink-2); font-size: 12px; }
  svg .marker-label { fill: var(--ink-2); }
  .tip { position: fixed; pointer-events: none; background: var(--surface); border: 1px solid var(--ring); border-radius: 8px; padding: 8px 10px; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,.12); display: none; min-width: 190px; z-index: 2; }
  .tip .head { color: var(--ink-2); margin-bottom: 4px; }
  .tip .row { display: flex; align-items: center; gap: 8px; }
  .tip .row i { width: 12px; height: 2px; border-radius: 1px; background: var(--key); flex: none; }
  .tip .row b { font-variant-numeric: tabular-nums; min-width: 44px; }
  .tip .row span { color: var(--ink-2); }
  details { margin-top: 18px; }
  summary { cursor: pointer; color: var(--ink-2); }
  tr.app td { font-weight: 600; }`,
  body: `
  <h1>Density report</h1>
  <p class="lede">How stuck blocks get as boards fill up. Each density is ${SEEDS.length} random boards of
  ${AREA.width}×${AREA.height} cells; the x axis is the share of cells covered by blocks. The vertical line
  marks the density the game uses now (${TRIES} tries per chunk). Made ${made.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>

  <section class="card">
    <h2>How far blocks can slide</h2>
    <p class="sub">Share of blocks, by the number of cells they can slide in total (both directions)</p>
    <div class="legend" id="legend"></div>
    <svg id="moves" height="260" role="img" aria-label="Share of blocks that are stuck, can slide 1, 2, or 3 or more cells, by density"></svg>
  </section>
  <section class="card">
    <h2>Blocks per 100 cells</h2>
    <svg id="count" height="170" role="img" aria-label="Blocks per 100 cells by density"></svg>
  </section>
  <section class="card">
    <h2>Median cells a block can slide</h2>
    <svg id="steps" height="170" role="img" aria-label="Median cells a block can slide by density"></svg>
  </section>
  <section class="card">
    <h2>Blocks each block is blocking</h2>
    <p class="sub">Mean number of blocks it touches end-on in their lane, so they cannot move towards it at all</p>
    <svg id="blocking" height="170" role="img" aria-label="Mean blocks each block is blocking by density"></svg>
  </section>

  <details>
    <summary>Table</summary>
    <div class="table-wrap"><table id="table"></table></div>
  </details>
  <ul class="notes">
    <li>Blocks are 2×1 or 1×2. Each 4×4-cell chunk tries a number of random blocks and keeps those that fit, so more tries means a denser board.</li>
    <li>"Steps" counts how many cells a block could move along its axis before touching another block, both directions added up, capped at 400 by the game's search reach.</li>
    <li>${sampled.toLocaleString("en")} blocks sampled in total.</li>
  </ul>

<div class="tip" id="tip" role="status"></div>
</div>
`,
  script: `
const ROWS = ${JSON.stringify(rows)};
const APP_TRIES = ${TRIES};
const MOVES = [
  { key: "stuck", name: "Stuck", color: "--s1" },
  { key: "oneStep", name: "1 cell", color: "--s2" },
  { key: "twoSteps", name: "2 cells", color: "--s3" },
  { key: "threePlus", name: "3 or more", color: "--s4" },
];
const CHARTS = [
  { id: "moves", series: MOVES, percent: true, max: 1 },
  { id: "count", series: [{ key: "blocksPer100Cells", name: "Blocks per 100 cells", color: "--s1" }] },
  { id: "steps", series: [{ key: "medianSteps", name: "Median cells it can slide", color: "--s1" }] },
  { id: "blocking", series: [{ key: "meanBlocking", name: "Blocks it is blocking", color: "--s1", digits: 2 }] },
];
const NS = "http://www.w3.org/2000/svg";
const css = (name) => getComputedStyle(document.querySelector(".viz-root")).getPropertyValue(name).trim();
const pct = (v) => Math.round(v * 100) + "%";
const fmt = (s, v) => (s.percent ? pct(v) : v.toFixed(s.digits ?? 1));
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
};
function nice(max) {
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

const legend = document.getElementById("legend");
for (const s of MOVES) {
  const item = document.createElement("span");
  item.textContent = s.name;
  item.style.setProperty("--key", "var(" + s.color + ")");
  legend.appendChild(item);
}

const xMax = Math.ceil(Math.max(...ROWS.map((r) => r.coverage)) * 10) / 10;
const appRow = ROWS.find((r) => r.tries === APP_TRIES);
const charts = [];

function render() {
  charts.length = 0;
  for (const chart of CHARTS) {
    const svg = document.getElementById(chart.id);
    svg.replaceChildren();
    const width = svg.clientWidth;
    const height = +svg.getAttribute("height");
    // The same margins on every chart, so their x axes line up under one crosshair.
    const pad = { l: 38, r: 96, t: 16, b: 24 };
    const yMax = chart.max ?? nice(Math.max(...ROWS.flatMap((r) => chart.series.map((s) => r[s.key]))));
    const x = (v) => pad.l + (v / xMax) * (width - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / yMax) * (height - pad.t - pad.b);
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      el("line", { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), stroke: css(i ? "--grid" : "--axis"), "stroke-width": 1 }, svg);
      el("text", { x: pad.l - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = chart.percent ? pct(v) : +v.toFixed(2);
    }
    for (let v = 0; v <= xMax + 1e-9; v += 0.1) {
      if (Math.round(v * 10) % 2) continue;
      el("text", { x: x(v), y: height - 6, "text-anchor": "middle" }, svg).textContent = pct(v);
    }
    // The game's current density.
    el("line", { x1: x(appRow.coverage), x2: x(appRow.coverage), y1: pad.t - 6, y2: height - pad.b, stroke: css("--ink-2"), "stroke-width": 1, opacity: 0.6 }, svg);
    el("text", { x: x(appRow.coverage) + 4, y: pad.t - 2, class: "marker-label" }, svg).textContent = "game now";
    const last = ROWS[ROWS.length - 1];
    for (const s of chart.series) {
      const d = ROWS.map((r, i) => (i ? "L" : "M") + x(r.coverage).toFixed(1) + " " + y(r[s.key]).toFixed(1)).join(" ");
      el("path", { d, fill: "none", stroke: css(s.color), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      el("circle", { cx: x(last.coverage), cy: y(last[s.key]), r: 4, fill: css(s.color), stroke: css("--surface"), "stroke-width": 2 }, svg);
    }
    if (chart.series.length > 1) {
      // End labels, spread at least 15 px apart, each tied to its line end by a leader.
      const labels = chart.series.map((s) => ({ s, end: y(last[s.key]), at: y(last[s.key]) })).sort((a, b) => a.end - b.end);
      for (let i = 1; i < labels.length; i++) labels[i].at = Math.max(labels[i].at, labels[i - 1].at + 15);
      const lx = x(last.coverage);
      for (const l of labels) {
        if (Math.abs(l.at - l.end) > 1) el("line", { x1: lx + 5, y1: l.end, x2: lx + 14, y2: l.at, stroke: css("--axis"), "stroke-width": 1 }, svg);
        el("text", { x: lx + 16, y: l.at + 4, class: "label" }, svg).textContent = l.s.name + " " + pct(last[l.s.key]);
      }
    }
    const cross = el("line", { y1: pad.t, y2: height - pad.b, stroke: css("--ink-2"), "stroke-width": 1, visibility: "hidden" }, svg);
    const dots = chart.series.map((s) => el("circle", { r: 4, fill: css(s.color), stroke: css("--surface"), "stroke-width": 2, visibility: "hidden" }, svg));
    charts.push({ chart, svg, x, y, cross, dots });
  }
}

const tip = document.getElementById("tip");
function show(index, clientX, clientY) {
  const row = ROWS[index];
  for (const c of charts) {
    c.cross.setAttribute("x1", c.x(row.coverage));
    c.cross.setAttribute("x2", c.x(row.coverage));
    c.cross.setAttribute("visibility", "visible");
    c.chart.series.forEach((s, i) => {
      c.dots[i].setAttribute("cx", c.x(row.coverage));
      c.dots[i].setAttribute("cy", c.y(row[s.key]));
      c.dots[i].setAttribute("visibility", "visible");
    });
  }
  tip.replaceChildren();
  const head = document.createElement("div");
  head.className = "head";
  head.textContent = pct(row.coverage) + " covered · " + row.tries + " tries" + (row.tries === APP_TRIES ? " (game now)" : "");
  tip.appendChild(head);
  for (const c of CHARTS) for (const s of c.series) {
    const line = document.createElement("div");
    line.className = "row";
    const key = document.createElement("i");
    key.style.setProperty("--key", "var(" + s.color + ")");
    const value = document.createElement("b");
    value.textContent = fmt({ ...s, percent: c.percent }, row[s.key]);
    const name = document.createElement("span");
    name.textContent = s.name;
    line.append(key, value, name);
    tip.appendChild(line);
  }
  tip.style.display = "block";
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, clientX + 14)) + "px";
  tip.style.top = Math.min(innerHeight - h - 8, Math.max(8, clientY - h / 2)) + "px";
}
function hide() {
  tip.style.display = "none";
  for (const c of charts) {
    c.cross.setAttribute("visibility", "hidden");
    c.dots.forEach((d) => d.setAttribute("visibility", "hidden"));
  }
}
for (const chart of CHARTS) {
  const svg = document.getElementById(chart.id);
  svg.addEventListener("pointermove", (e) => {
    const c = charts.find((c) => c.svg === svg);
    const box = svg.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    ROWS.forEach((r, i) => { if (Math.abs(c.x(r.coverage) - px) < Math.abs(c.x(ROWS[best].coverage) - px)) best = i; });
    show(best, e.clientX, e.clientY);
  });
  svg.addEventListener("pointerleave", hide);
}

const table = document.getElementById("table");
const columns = [
  ["Tries", (r) => r.tries], ["Covered", (r) => pct(r.coverage)], ["Blocks", (r) => r.blocks.toLocaleString("en")],
  ["Per 100 cells", (r) => r.blocksPer100Cells.toFixed(1)], ["Stuck", (r) => pct(r.stuck)], ["1 cell", (r) => pct(r.oneStep)],
  ["2 cells", (r) => pct(r.twoSteps)], ["3+", (r) => pct(r.threePlus)], ["Median cells", (r) => r.medianSteps],
  ["Blocking", (r) => r.meanBlocking.toFixed(2)],
];
const headRow = table.insertRow();
for (const [name] of columns) { const th = document.createElement("th"); th.textContent = name; headRow.appendChild(th); }
for (const r of ROWS) {
  const tr = table.insertRow();
  if (r.tries === APP_TRIES) tr.className = "app";
  for (const [, value] of columns) tr.insertCell().textContent = value(r);
}

render();
addEventListener("resize", render);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
`,
});

const file = `density-${stamp}.html`;
await Bun.write(join(reportsDir, file), html);
await writeReportsIndex();
console.log(`Wrote ${join(reportsDir, file)}`);
