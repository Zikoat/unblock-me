// Film the red block's soul in the game, for reports/soul.html: a goal reached on a small
// board, its finish skipped with a tap, then the soul from the old red block to the next one
// frame by frame on Playwright's clock. Styles (src/finish-fx.ts SOUL_STYLES) given with
// --films get an mp4 at full speed, one at a quarter speed and stills along the way; those
// given with --stills one still in flight.
//   node test/experiments/soul-look.mjs --films comet,ember --stills rim,drop (needs dist/ built and ffmpeg)
import { createServer } from "http";
import { execFileSync } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join, extname } from "path";
import { chromium } from "playwright";
const root = new URL("../../dist/", import.meta.url).pathname;
const out = new URL("../../reports/soul/", import.meta.url).pathname;
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? [] : process.argv[i + 1].split(",");
};
const films = arg("--films"), stills = arg("--stills");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain" };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  const body = await readFile(path).catch(() => null);
  if (body) res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(body);
  else res.writeHead(req.method === "POST" ? 200 : 404).end();
}).listen(0);
const url = `http://localhost:${server.address().port}/`;
await mkdir(out, { recursive: true });
const b = await chromium.launch();
const SIZE = 400, STILLS = [0, 100, 200, 300, 450, 600, 750, 900, 1000, 1100, 1250], IN_FLIGHT = 800;
const H = (id, x, y) => ({ id, x, y, w: 2, h: 1 }), V = (id, x, y) => ({ id, x, y, w: 1, h: 2 });
const Wall = (x, y) => ({ id: `wall${x},${y}`, x, y, w: 1, h: 1, wall: true });
// r slides right onto its target; the blocks round it are the next goal's candidates.
const board = [Wall(-4, 4), H("r", -3, 4), Wall(3, 4), V("n", 4, 6), H("b", -2, 7), V("c", -4, 0), H("d", 2, 1)];
const jpg = (png, file) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-vf", "scale=400:-1", "-q:v", "3", join(out, file)]);
const mp4 = (dir, file) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(dir, "f%04d.png"), "-vf", "scale=400:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", join(out, file)]);

/** A page in `style` with the goal just reached, its finish skipped and the soul set off:
 * the clock paused, time passing only as the caller lets it. */
async function soulSetOff(style) {
  const page = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.log(style, "pageerror", e.message));
  await page.clock.install();
  await page.goto(`${url}?island=0&soul=${style}`);
  await page.evaluate(() => unblock.forget());
  await page.goto(`${url}?island=0&soul=${style}`);
  await page.clock.runFor(500);
  await page.evaluate((board) => {
    unblock.place(board, { id: "r", target: { x: 1, y: 4 }, solution: [] });
    unblock.scene.camera = { scale: 1, offsetX: 200 - 0.5 * 60, offsetY: 200 - 5 * 60 };
    unblock.redraw();
  }, board);
  // Paused from here (the worker's wait for the next goal would otherwise let the finish end
  // and the soul fly unfilmed).
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.mouse.click(200 - 2 * 60, 200 - 0.5 * 60); // r: pushed onto its target
  await page.clock.runFor(600);
  await page.waitForFunction(() => unblock.scene.goal && unblock.scene.goal.id !== "r", null, { timeout: 15000, polling: 100 }).catch(() => {});
  if (!(await page.evaluate(() => unblock.scene.goal?.id))) {
    console.log(style, "no next goal");
    await page.close();
    return null;
  }
  await page.mouse.click(SIZE - 6, SIZE - 6); // skips the finish
  await page.evaluate(() => (unblock.scene.hover = null)); // (no hover hint left from the taps)
  // The finish ends on the next frame, the soul setting off on the one after.
  for (let i = 0; i < 20 && !((await page.evaluate(() => unblock.soul()?.born)) >= 0); i++) await page.clock.runFor(16);
  return page;
}

/** Frames `step` ms of page time apart for `ms`, into a fresh folder. */
async function frames(page, dir, step, ms) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let i = 0, t = 0; t <= ms; i++, t += step) {
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, "0")}.png`) });
    await page.clock.runFor(step);
  }
}

for (const style of films) {
  let page = await soulSetOff(style);
  if (!page) continue;
  const full = join(out, `${style}-full`);
  await frames(page, full, 1000 / 30, 1700);
  mp4(full, `${style}.mp4`);
  for (const ms of STILLS) jpg(join(full, `f${String(Math.round(ms / (1000 / 30))).padStart(4, "0")}.png`), `${style}-${ms}.jpg`);
  await rm(full, { recursive: true, force: true });
  await page.close();
  // A quarter speed: the same again, frames 1000/120 ms apart at 30 a second.
  page = await soulSetOff(style);
  const slow = join(out, `${style}-slow`);
  await frames(page, slow, 1000 / 120, 1600);
  mp4(slow, `${style}-slow.mp4`);
  await rm(slow, { recursive: true, force: true });
  await page.close();
  console.log(style, "filmed");
}
for (const style of stills) {
  const page = await soulSetOff(style);
  if (!page) continue;
  await page.clock.runFor(IN_FLIGHT);
  const png = join(out, `${style}-flight.png`);
  await page.screenshot({ path: png });
  jpg(png, `${style}-flight.jpg`);
  await rm(png);
  await page.close();
  console.log(style, "still taken");
}
await b.close();
server.close();
