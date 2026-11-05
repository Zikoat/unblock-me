// Look at the island in a phone-sized browser: a fresh start, then each goal solved with its
// own solution, a screenshot at each. node test/experiments/island-look.mjs <outdir>
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { chromium } from "playwright";
const root = new URL("../../dist/", import.meta.url).pathname, out = process.argv[2] ?? ".";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  const body = await readFile(path).catch(() => null);
  if (body) res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(body);
  else res.writeHead(req.method === "POST" ? 200 : 404).end();
}).listen(0);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 393, height: 700 }, deviceScaleFactor: 2, hasTouch: true });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForTimeout(1500);
const goal = () => page.evaluate(() => window.unblock.scene.goal && JSON.parse(JSON.stringify(window.unblock.scene.goal)));
/** Screen point of a lattice point, by the camera now. */
const screen = (x, y) => page.evaluate(([x, y]) => { const c = window.unblock.scene.camera; return { x: x * 60 * c.scale + c.offsetX, y: y * 60 * c.scale + c.offsetY }; }, [x, y]);
const LAST = 9;
let prev = null;
for (let n = 0; n < 40; n++) {
  // Wait for the next goal, and for the view to settle on it.
  for (let i = 0; i < 100 && ((await goal())?.id ?? prev) === prev; i++) await page.waitForTimeout(200);
  const g = await goal();
  await page.waitForTimeout(600);
  const name = g ? g.id.replace(/ /g, "-") : "none";
  await page.screenshot({ path: `${out}/${name}.png` });
  if (!g || !g.id.startsWith("isle ")) {
    const prefetched = await page.evaluate(() => (localStorage.getItem("unblock-me:log") ?? "").includes('"prefetched"'));
    console.log("after the island:", g?.id ?? "no goal", prefetched ? "(made while the island was played)" : "(made after it)");
    break;
  }
  prev = g.id;
  const k = Number(g.id.split(" ")[1]);
  console.log(k, g.id, "fewest", g.difficulty.moves, "unrated", !!g.unrated, "step", !!g.step, "scale", await page.evaluate(() => window.unblock.scene.camera.scale.toFixed(2)));
  for (const m of g.solution) {
    const blocks = await page.evaluate(() => window.unblock.visibleBlocks());
    const b = blocks.find((b) => b.id === m.id);
    // The red block's last drag stops a cell short (its target is out of view): it slides in.
    const short = !g.step && m === g.solution.at(-1) ? 1 : 0;
    const from = await screen(m.from.x + b.w / 2, m.from.y + b.h / 2), to = await screen(m.to.x - short + b.w / 2, m.to.y + b.h / 2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let s = 1; s <= 8; s++) await page.mouse.move(from.x + ((to.x - from.x) * s) / 8, from.y + ((to.y - from.y) * s) / 8);
    await page.mouse.up();
    // (The last square's bay reveals the world: the view glides out before the next drag.)
    await page.waitForTimeout(k === LAST ? 2200 : 150);
    if (k === LAST && m === g.solution.at(-3)) await page.screenshot({ path: `${out}/island-bay.png` });
  }
  if (g.step) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${name}-reached.png` });
    continue;
  }
  if (k === LAST) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/island-reveal.png` });
    continue;
  }
  // Its finish plays in a card; the next button cuts to the next square.
  await page.waitForSelector("#next:not([hidden])", { timeout: 20000 }).catch(() => console.log("no next button"));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/island-${k}-done.png` });
  await page.click("#next").catch(() => {});
}
await page.screenshot({ path: `${out}/island-end.png` });
// The whole island from afar, its squares numbered.
await page.evaluate(() => { const s = 0.085; window.unblock.scene.camera = { scale: s, offsetX: 393 / 2 - 40 * 60 * s, offsetY: 700 / 2 - 0 * 60 * s }; window.unblock.redraw(); });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/island-overview.png` });
await b.close(); server.close();
