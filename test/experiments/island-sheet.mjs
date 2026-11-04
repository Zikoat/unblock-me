// Contact sheet of island levels (from island-levels.ts): node test/experiments/island-sheet.mjs <levels.json> <out.png | out.html> [fewest,...]
import fs from "fs";
const [file, out, pick] = process.argv.slice(2);
let levels = JSON.parse(fs.readFileSync(file, "utf8"));
if (pick) { const want = pick.split(",").map(Number); levels = levels.filter((l) => want.includes(l.fewest)); }
const U = 28;
const svg = (l) => {
  let s = `<svg width="${10 * U}" height="${8 * U}" viewBox="${-U} ${-U} ${10 * U} ${8 * U}">`;
  for (let y = -1; y <= 6; y++) for (let x = -1; x <= 8; x++) {
    const ring = (x === -1 || x === 6 || y === -1 || y === 6) && x <= 6 && !(x === 6 && y === 2);
    const wall = ring || ((y === 1 || y === 3) && (x === 7 || x === 8)) || (y === 2 && x === 8);
    if (wall) s += `<rect x="${x * U + 1}" y="${y * U + 1}" width="${U - 2}" height="${U - 2}" rx="3" fill="#5f5d57"/>`;
  }
  s += `<rect x="${6 * U + 2}" y="${2 * U + 2}" width="${2 * U - 4}" height="${U - 4}" rx="6" fill="none" stroke="#e33" stroke-width="2" stroke-dasharray="4 3"/>`;
  l.pieces.forEach((p, i) => {
    const x = p.h ? l.pos[i] : p.lane, y = p.h ? p.lane : l.pos[i];
    s += `<rect x="${x * U + 2}" y="${y * U + 2}" width="${(p.h ? 2 : 1) * U - 4}" height="${(p.h ? 1 : 2) * U - 4}" rx="7" fill="${i ? "#4a7fd4" : "#e33"}"/>`;
  });
  return s + "</svg>";
};
const cardsHtml = levels.map((l) => `<div class="card"><b>${l.fewest} moves</b> · ${l.pieces.length} blocks<br>${svg(l)}</div>`).join("");
if (out.endsWith(".html")) {
  fs.writeFileSync(out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Island candidates</title>
<meta name="date" content="${new Date().toISOString().slice(0, 10)}">
<style>
  :root { color-scheme: light dark; --bg: #f9f9f7; --ink: #0b0b0b; --ink-2: #52514e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0d0d; --ink: #f0efec; --ink-2: #c3c2b7; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 56px; }
  .back { color: var(--ink-2); text-decoration: none; font-size: 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  svg { max-width: 100%; height: auto; }
</style></head><body><main>
<a class="back" href="./">← Reports</a>
<h1>Island candidates</h1>
<p>6×6 squares with only 2×1 blocks (test/experiments/island-levels.ts): random boards, each shuffled to the state farthest from solved. The red block leaves through the gap on the right into its goal (dashed).</p>
<div class="grid">${cardsHtml}</div>
</main></body></html>
`);
  process.exit(0);
}
const html = `<body style="margin:0;background:#f4f1ea;font:14px sans-serif;display:flex;flex-wrap:wrap;gap:8px;padding:8px;width:${(10 * U + 16) * 4}px">${cardsHtml}</body>`;
const { chromium } = await import("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: (10 * U + 16) * 4 + 16, height: 400 } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
