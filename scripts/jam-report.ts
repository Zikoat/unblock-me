// A jam report: can blocks lock each other so that none of them can ever move? Measures
// random boards, plans how to free the hardest jam found, and builds the smallest frozen
// structures with walls. Writes dist/reports/jams-<time>.html and refreshes the list.
import { join } from "node:path";
import { frozen, lockDepths, planToFree, replay, smallestFrozen, type Move } from "../src/frozen";
import { fixedLayout, randomLayout, TRIES, type Block, type Layout, type Placed } from "../src/layout";
import { blocksIn, NO_CHANGES, slide } from "../src/rules";
import { escape, reportPage } from "./report-page";
import { reportsDir, writeReportsIndex } from "./reports-index";

const DENSITIES = [TRIES, 10, 15, 20, 30]; // tries per chunk
const SEEDS = [11, 22, 33];
const AREA = { x: 100, y: 100, width: 100, height: 100 };
const MARGIN = 15; // the hardest jam must sit this far inside the area, clear of its edge

// 1. Random boards: how many blocks are stuck, and how many frozen.
type Measured = { tries: number; blocks: number; stuck: number; frozen: number };
const measured: Measured[] = DENSITIES.map((tries) => {
  const m: Measured = { tries, blocks: 0, stuck: 0, frozen: 0 };
  for (const seed of SEEDS) {
    const layout = randomLayout(seed, { tries });
    const { depth } = lockDepths(layout, AREA);
    m.frozen += frozen(layout, AREA).size;
    for (const d of depth.values()) {
      m.blocks++;
      if (d > 0) m.stuck++;
    }
  }
  return m;
});
const sampled = measured.reduce((n, m) => n + m.blocks, 0);
const totalFrozen = measured.reduce((n, m) => n + m.frozen, 0);

// 2. The hardest jam on the densest boards: of the most deeply jammed blocks well inside the
// sample, the one that takes the most moves to free, with a plan checked by the rules.
const DENSE = DENSITIES.at(-1)!;
const CANDIDATES = 25;
type Jam = { seed: number; layout: Layout; target: Block; plan: Move[]; depth: number };
let jam: Jam | null = null;
let planned = 0;
for (const seed of SEEDS) {
  const layout = randomLayout(seed, { tries: DENSE });
  const { depth } = lockDepths(layout, AREA);
  const inner = (b: Block) => b.x >= AREA.x + MARGIN && b.y >= AREA.y + MARGIN && b.x < AREA.x + AREA.width - MARGIN && b.y < AREA.y + AREA.height - MARGIN;
  const deepest = blocksIn(layout, AREA, NO_CHANGES)
    .filter((b) => !b.wall && !b.ui && inner(b) && (depth.get(b.id) ?? 0) > 0)
    .sort((x, y) => depth.get(y.id)! - depth.get(x.id)!)
    .slice(0, CANDIDATES);
  for (const target of deepest) {
    const plan = planToFree(layout, target, { maxMoves: 14 });
    if (!plan) continue;
    planned++;
    if (!jam || plan.length > jam.plan.length) jam = { seed, layout, target, plan, depth: depth.get(target.id)! };
  }
}
// Play the plan with the game's rules: every move legal, and the target can move after.
const verified = jam ? (() => {
  const changes = replay(jam.layout, jam.plan);
  if (!changes) return false;
  const now = blocksIn(jam.layout, { x: jam.target.x, y: jam.target.y, width: 1, height: 1 }, changes)[0]!;
  const s = slide(jam.layout, now, changes);
  return s.hi > s.lo;
})() : false;

// 3. The smallest frozen structures with walls, found by search and checked by the rules.
type Built = { name: string; about: string; grid: string; blocks: Placed[] };
const searches: { name: string; about: string; w: number; h: number; opts: Parameters<typeof smallestFrozen>[2] }[] = [
  { name: "One block, two walls", about: "The smallest frozen structure: nothing waits on another block.", w: 4, h: 1, opts: {} },
  { name: "A line", about: "Blocks in a row between two walls hold each other: the first waits on the second, which waits on a wall.", w: 6, h: 1, opts: { minSliders: 2, chained: true } },
  { name: "A pinwheel", about: "Four blocks around an empty cell, each pushing its end against the next one's side: a cycle, held in by a wall at each outer end.", w: 5, h: 5, opts: { minSliders: 4, chained: true } },
  { name: "A corner", about: "Two lines meeting at one shared corner wall. Every block is held by another block, with only three walls.", w: 6, h: 6, opts: { minSliders: 4, chained: true } },
];
const built: Built[] = [];
for (const s of searches) {
  const found = smallestFrozen(s.w, s.h, s.opts);
  if (!found) continue;
  const placed = found.map((b, i) => ({ ...b, id: b.wall ? `wall${i}` : String.fromCharCode(65 + built.length * 0 + i) }));
  // Checked by the same rules the game plays by: every sliding block is frozen.
  const sliders = placed.filter((b) => !b.wall).map((b) => b.id!).sort();
  const isFrozen = [...frozen(fixedLayout(placed), { x: -2, y: -2, width: s.w + 4, height: s.h + 4 })].sort();
  if (JSON.stringify(sliders) !== JSON.stringify(isFrozen)) throw new Error(`${s.name} is not frozen`);
  built.push({ name: s.name, about: s.about, grid: `${s.w}×${s.h}`, blocks: placed });
}

// Drawing: a board as SVG. Colours come from the page's tokens, so dark mode follows.
type Shape = { id?: string; x: number; y: number; w: number; h: number; wall?: boolean };
function boardSvg(blocks: Shape[], { cell, fill, label, frame = [] }: {
  cell: number;
  fill: (b: Shape) => string;
  label?: (b: Shape) => string | null;
  /** Extra shapes that only widen the drawn area. */
  frame?: Shape[];
}): string {
  const extent = [...blocks, ...frame];
  const minX = Math.min(...extent.map((b) => b.x)) - 0.5;
  const minY = Math.min(...extent.map((b) => b.y)) - 0.5;
  const maxX = Math.max(...extent.map((b) => b.x + b.w)) + 0.5;
  const maxY = Math.max(...extent.map((b) => b.y + b.h)) + 0.5;
  const px = (v: number, min: number) => ((v - min) * cell).toFixed(1);
  const centre = (b: Shape) => [((b.x + b.w / 2 - minX) * cell).toFixed(1), ((b.y + b.h / 2 - minY) * cell).toFixed(1)];
  const parts: string[] = [];
  for (let x = Math.ceil(minX); x <= maxX; x++) for (let y = Math.ceil(minY); y <= maxY; y++) {
    parts.push(`<rect x="${px(x, minX)}" y="${px(y, minY)}" width="2" height="2" transform="translate(-1 -1)" style="fill:var(--grid)"/>`);
  }
  const gap = Math.max(1.5, cell * 0.06);
  for (const b of blocks) {
    parts.push(`<rect x="${(+px(b.x, minX) + gap).toFixed(1)}" y="${(+px(b.y, minY) + gap).toFixed(1)}" width="${(b.w * cell - 2 * gap).toFixed(1)}" height="${(b.h * cell - 2 * gap).toFixed(1)}" rx="${b.wall ? 2 : Math.min(6, cell * 0.18)}" style="fill:var(${fill(b)})"/>`);
    const text = label?.(b);
    if (text) {
      const [cx, cy] = centre(b);
      parts.push(`<text x="${cx}" y="${cy}" class="in" style="fill:var(${fill(b)}-ink)">${escape(text)}</text>`);
    }
  }
  const w = ((maxX - minX) * cell).toFixed(0);
  const h = ((maxY - minY) * cell).toFixed(0);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="board" role="img">
  ${parts.join("\n  ")}
</svg>`;
}

const gameLink = (blocks: Shape[]) => `../?board=${encodeURIComponent(JSON.stringify(blocks.map(({ id, x, y, w, h, wall }) => ({ id, x, y, w, h, ...(wall ? { wall } : {}) }))))}`;

// The hardest jam's window: the target and the blocks to move, with a margin.
let jamSection = "";
if (jam) {
  const { layout, target, plan } = jam;
  const ids = new Set(plan.map((m) => m.id));
  const involved = [target, ...plan.map((m) => ({ ...layout.byId(m.id)!, ...m.to }))];
  const pad = 2;
  const all = [...involved, ...plan.map((m) => layout.byId(m.id)!)];
  const x0 = Math.min(...all.map((b) => b.x)) - pad;
  const y0 = Math.min(...all.map((b) => b.y)) - pad;
  const x1 = Math.max(...all.map((b) => b.x + b.w)) + pad;
  const y1 = Math.max(...all.map((b) => b.y + b.h)) + pad;
  const window = blocksIn(layout, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, NO_CHANGES)
    .filter((b) => b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1);
  const order = new Map(plan.map((m, i) => [m.id, i + 1]));
  const after = window.map((b) => { const m = plan.find((m) => m.id === b.id); return m ? { ...b, ...m.to } : b; });
  const style = {
    cell: 26,
    fill: (b: Shape) => (b.id === target.id ? "--target" : ids.has(b.id!) ? "--mover" : "--d0"),
    label: (b: Shape) => (order.has(b.id!) ? String(order.get(b.id!)) : null),
  };
  // The same frame for both boards, so blocks line up between them.
  const frame = [{ x: x0, y: y0, w: 1, h: 1 }, { x: x1 - 1, y: y1 - 1, w: 1, h: 1 }];
  const svg = `<figure><figcaption>Before</figcaption>${boardSvg(window, { ...style, frame })}</figure>
    <figure><figcaption>After ${plan.length} moves</figcaption>${boardSvg(after, { ...style, frame })}</figure>`;
  const dir = (m: Move) => (m.to.x > m.from.x ? "right" : m.to.x < m.from.x ? "left" : m.to.y > m.from.y ? "down" : "up");
  const cells = (m: Move) => Math.abs(m.to.x - m.from.x) + Math.abs(m.to.y - m.from.y);
  const steps = plan.map((m, i) => `<li>Block ${i + 1}: ${dir(m)} ${cells(m)} cell${cells(m) > 1 ? "s" : ""}</li>`).join("");
  jamSection = `
  <section class="card">
    <h2>The hardest jam found: ${plan.length} moves to free one block</h2>
    <p class="sub">${DENSE} tries per chunk (the densest setting), seed ${jam.seed}. Of the ${planned} most deeply jammed blocks
    planned for (at least ${MARGIN} cells from the sample's edge), this one needs the most moves.</p>
    <div class="legend"><span><i style="background:var(--target)"></i>stuck block</span><span><i style="background:var(--mover)"></i>blocks to move, numbered in order</span><span><i style="background:var(--d0)"></i>other blocks</span></div>
    <div class="board-wrap pair">${svg}</div>
    <p>The orange block can't slide either way. To free it, move these blocks in this order:</p>
    <ol class="steps">${steps}</ol>
    <p><b>${verified ? `Checked with the game's rules: each move is a legal slide when it is made, and afterwards the orange block can move.` : "Checked with the game's rules: the plan does NOT work. This is a bug in the planner."}</b>
    So even at this density the jam unwinds; it just takes ${plan.length} moves. <a href="${gameLink(window)}">Open this jam in the game</a> and try it.</p>
  </section>`;
}

const builtSection = built.map((b) => `
  <section class="card structure">
    <h2>${escape(b.name)}</h2>
    <p class="sub">${b.blocks.filter((p) => p.wall).length} walls, ${b.blocks.filter((p) => !p.wall).length} sliding blocks. Smallest in a ${b.grid} grid.</p>
    <div class="board-wrap">${boardSvg(b.blocks, { cell: 34, fill: (p) => (p.wall ? "--wall" : "--frozen") })}</div>
    <p>${escape(b.about)} <a href="${gameLink(b.blocks)}">Try it in the game</a>.</p>
  </section>`).join("");

const rowsHtml = measured.map((m) => `<tr${m.tries === TRIES ? ' class="app"' : ""}><td>${m.tries}${m.tries === TRIES ? " (game now)" : ""}</td><td>${m.blocks.toLocaleString("en")}</td><td>${Math.round((100 * m.stuck) / m.blocks)}%</td><td>${m.frozen}</td></tr>`).join("");

const made = new Date();
const stamp = made.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const html = reportPage({
  title: "Jam report",
  description: `can blocks freeze each other? ${sampled.toLocaleString("en")} blocks, ${totalFrozen} frozen`,
  css: `
  .viz-root { --d0: #e1e0d9;
    --wall: #5f5d57; --frozen: #4f6d8f; --target: #eb6834; --target-ink: #0b0b0b; --mover: #2a78d6; --mover-ink: #ffffff; --d0-ink: #0b0b0b; }
  @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .viz-root { --d0: #383835; } }
  .answer { font-size: 17px; margin: 0 0 6px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; color: var(--ink-2); margin: 0 0 10px; }
  .legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; margin-right: 6px; }
  .board-wrap { overflow-x: auto; }
  .board { display: block; max-width: 100%; height: auto; }
  .board .in { font: 600 13px system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }
  .pair { display: flex; flex-wrap: wrap; gap: 18px; }
  figure { margin: 0; }
  figcaption { font-size: 13px; color: var(--ink-2); margin-bottom: 4px; }
  .steps { padding-left: 20px; color: var(--ink-2); }
  .structures { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .structures .card { margin: 0; }
  tr.app td { font-weight: 600; }`,
  body: `
  <h1>Jam report</h1>
  <p class="lede">Can blocks lock each other so that none of them can ever move, whatever you do?
  Made ${made.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>

  <section class="card">
    <p class="answer"><b>No. Not with sliding blocks alone, at any density.</b></p>
    <p>Out of ${sampled.toLocaleString("en")} blocks on random boards from the game's density up to the densest setting,
    ${totalFrozen} could never move. Plenty are stuck, some several layers deep, but every jam can be undone by
    moving blocks from its outside in.</p>
    <p>Why: take any group of sliding blocks that are all stuck, and look at its top row. A vertical block
    whose top is in that row would need something above it to stop it, and there is nothing of the group up
    there, so the top row holds only horizontal blocks. The leftmost of those needs something to its left in
    the same row to stop it, and there is nothing there either. So that block can move, and the group is not
    frozen. A finite frozen structure needs something that never moves: walls.</p>
    <div class="table-wrap"><table>
      <tr><th>Tries per chunk</th><th>Blocks</th><th>Stuck</th><th>Frozen</th></tr>
      ${rowsHtml}
    </table></div>
  </section>
  ${jamSection}
  <h2 style="margin: 26px 0 4px">Frozen structures, built with walls</h2>
  <p class="sub">Grey squares are walls (1×1, never move); blue blocks slide but are frozen here. Each is the smallest
  the search found in its grid, and each is checked frozen by the game's own rules: every sliding block touches something
  at both ends, and nothing it touches can ever move.</p>
  <div class="structures">${builtSection}</div>
  <ul class="notes">
    <li>"Stuck": cannot slide either way. The plan to free a block is found by working back from it: to step into a cell, the block in that cell has to slide out of the way, which may need others out of its way first. Plans are short but not proven shortest.</li>
    <li>Random boards: ${SEEDS.length} boards of ${AREA.width}×${AREA.height} cells per density. The hardest jam was picked from blocks at least ${MARGIN} cells from the edge.</li>
    <li>The search tries every arrangement of walls and sliding blocks in its grid, so a smaller structure could only exist in a bigger grid.</li>
  </ul>`,
});

const file = `jams-${stamp}.html`;
await Bun.write(join(reportsDir, file), html);
await writeReportsIndex();
console.log(`Wrote ${join(reportsDir, file)}`);
