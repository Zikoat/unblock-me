// Records where a tapped block is drawn on every frame of a few slides, and writes an SVG
// graph (time across, position up) to test/screenshots/slide-frames.svg.
//   scripts/capped.sh 1500 60 node test/experiments/slide-frames.mjs [url]
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:8000/unblock-me/";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(url);
await page.evaluate(() => {
  localStorage.setItem("unblock-me:ease", '"Ease out cubic"');
  localStorage.setItem("unblock-me:speed", "1.5");
});
await page.reload();
await page.waitForTimeout(300);
// Row 2, walls at x -4 and 3: a 2-wide block bouncing between x -3 and 1.
await page.evaluate(() => unblock.place([
  { id: "wl", x: -4, y: 2, w: 1, h: 1, wall: true }, { id: "a", x: -3, y: 2, w: 2, h: 1 }, { id: "wr", x: 3, y: 2, w: 1, h: 1, wall: true },
]));
const cam = await page.evaluate(() => unblock.scene.camera);
const runs = [];
for (let i = 0; i < 4; i++) {
  const a = await page.evaluate(() => unblock.visibleBlocks().find((b) => b.id === "a"));
  const x = cam.offsetX + (a.x + 1) * 60 * cam.scale, y = cam.offsetY + 2.5 * 60 * cam.scale;
  await page.evaluate(() => (unblock.frames = []));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 0 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const tapAt = await page.evaluate(() => performance.now());
  await page.waitForTimeout(700);
  const frames = await page.evaluate(() => unblock.frames);
  runs.push({ from: a.x, frames: frames.map((f) => ({ t: f.t - frames[0].t, x: f.x })), tapAt });
}
await browser.close();

// Per run: any frame drawn outside the from..to range, or going backwards, is a glitch.
const report = runs.map((r, i) => {
  const xs = r.frames.map((f) => f.x);
  const to = r.from === -3 ? 1 : -3;
  const lo = Math.min(r.from, to), hi = Math.max(r.from, to);
  const outside = xs.filter((x) => x < lo - 1e-6 || x > hi + 1e-6);
  const backwards = xs.slice(1).filter((x, k) => Math.sign(x - xs[k]) === -Math.sign(to - r.from) && Math.abs(x - xs[k]) > 1e-6);
  return { run: i + 1, frames: xs.length, first: xs[0]?.toFixed(3), outside: outside.length, backwards: backwards.length };
});
console.table(report);

const W = 640, H = 360, pad = 40;
const tMax = Math.max(...runs.flatMap((r) => r.frames.map((f) => f.t)), 1);
const colors = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const sx = (t) => pad + (t / tMax) * (W - 2 * pad);
const sy = (x) => H - pad - ((x + 3.5) / 7) * (H - 2 * pad);
const lines = runs.map((r, i) => {
  const pts = r.frames.map((f) => `${sx(f.t).toFixed(1)},${sy(f.x).toFixed(1)}`).join(" ");
  const dots = r.frames.map((f) => `<circle cx="${sx(f.t).toFixed(1)}" cy="${sy(f.x).toFixed(1)}" r="2.5" fill="${colors[i]}"/>`).join("");
  return `<polyline points="${pts}" fill="none" stroke="${colors[i]}" stroke-width="1.5"/>${dots}`;
}).join("\n");
const grid = [-3, 0, 3].map((x) => `<line x1="${pad}" x2="${W - pad}" y1="${sy(x)}" y2="${sy(x)}" stroke="#e1e0d9"/><text x="${pad - 6}" y="${sy(x) + 4}" text-anchor="end" font-size="11" fill="#898781">x ${x}</text>`).join("");
await writeFile(new URL("../screenshots/slide-frames.svg", import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="system-ui"><rect width="100%" height="100%" fill="#fcfcfb"/>${grid}
<text x="${W / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#898781">ms since the first frame (${tMax.toFixed(0)} ms)</text>
${lines}</svg>`);
