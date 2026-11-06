// Film the red block's soul in each style (src/finish-fx.ts SOUL_STYLES) for reports/soul.html:
// a goal reached on a small board, its finish skipped with a tap, then the soul's flight and
// arrival frame by frame on Playwright's clock: an mp4 at full speed, one at a quarter speed,
// and stills. node test/experiments/soul-look.mjs [styles...] (needs dist/ built and ffmpeg)
import { createServer } from "http";
import { execFileSync } from "child_process";
import { mkdir, readFile, rm } from "fs/promises";
import { join, extname } from "path";
import { chromium } from "playwright";
const root = new URL("../../dist/", import.meta.url).pathname;
const out = new URL("../../reports/soul/", import.meta.url).pathname;
const styles = process.argv.slice(2).length ? process.argv.slice(2) : ["classic", "ember", "comet", "sparks", "ghost"];
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
const SIZE = 400, STILLS = [0, 150, 300, 450, 600, 750, 900, 1050, 1250];
const H = (id, x, y) => ({ id, x, y, w: 2, h: 1 }), V = (id, x, y) => ({ id, x, y, w: 1, h: 2 });
const Wall = (x, y) => ({ id: `wall${x},${y}`, x, y, w: 1, h: 1, wall: true });
// r slides right onto its target; the blocks round it are the next goal's candidates.
const board = [Wall(-4, 4), H("r", -3, 4), Wall(3, 4), V("n", 4, 6), H("b", -2, 7), V("c", -4, 0), H("d", 2, 1)];

for (const style of styles) {
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
  // Paused from here, time passing only as each step lets it (the worker's wait for the next
  // goal would otherwise let the finish end and the soul fly unfilmed).
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.mouse.click(200 - 2 * 60, 200 - 0.5 * 60); // r: pushed onto its target
  await page.clock.runFor(600);
  // The next goal is made by the worker (in real time), then a tap skips the finish.
  await page.waitForFunction(() => unblock.scene.goal && unblock.scene.goal.id !== "r", null, { timeout: 15000, polling: 100 }).catch(() => {});
  const next = await page.evaluate(() => unblock.scene.goal?.id);
  if (!next) {
    console.log(style, "no next goal");
    await page.close();
    continue;
  }
  await page.mouse.click(SIZE - 6, SIZE - 6);
  await page.evaluate(() => (unblock.scene.hover = null)); // (no hover hint left from the taps)
  // The finish ends on the next frame, the soul setting off on the one after.
  for (let i = 0; i < 20 && !((await page.evaluate(() => unblock.soul()?.born)) >= 0); i++) await page.clock.runFor(16);
  const film = async (name, step, ms) => {
    const dir = join(out, `${style}-${name}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (let i = 0, t = 0; t <= ms; i++, t += step) {
      await page.screenshot({ path: join(dir, `f${String(i).padStart(4, "0")}.png`) });
      await page.clock.runFor(step);
    }
    return dir;
  };
  // Full speed: 30 frames a second of page time; then a quarter speed (the same flight again).
  const full = await film("full", 1000 / 30, 1700);
  const mp4 = (dir, file) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(dir, "f%04d.png"), "-vf", "scale=400:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", join(out, file)]);
  mp4(full, `${style}.mp4`);
  // The stills: from the full-speed frames nearest each time.
  for (const ms of STILLS) {
    const i = Math.round(ms / (1000 / 30));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(full, `f${String(i).padStart(4, "0")}.png`), "-vf", "scale=400:-1", "-q:v", "3", join(out, `${style}-${ms}.jpg`)]);
  }
  await rm(full, { recursive: true, force: true });
  await page.close();
  console.log(style, "filmed, the soul flying to", next);
}
// The quarter-speed films: each style once more, frames 1000/120 ms apart at 30 a second.
for (const style of styles) {
  const page = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
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
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.mouse.click(200 - 2 * 60, 200 - 0.5 * 60);
  await page.clock.runFor(600);
  await page.waitForFunction(() => unblock.scene.goal && unblock.scene.goal.id !== "r", null, { timeout: 15000, polling: 100 }).catch(() => {});
  await page.mouse.click(SIZE - 6, SIZE - 6);
  await page.evaluate(() => (unblock.scene.hover = null)); // (no hover hint left from the taps)
  for (let i = 0; i < 20 && !((await page.evaluate(() => unblock.soul()?.born)) >= 0); i++) await page.clock.runFor(16);
  const dir = join(out, `${style}-slow`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (let i = 0, t = 0; t <= 1600; i++, t += 1000 / 120) {
    await page.screenshot({ path: join(dir, `f${String(i).padStart(4, "0")}.png`) });
    await page.clock.runFor(1000 / 120);
  }
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-i", join(dir, "f%04d.png"), "-vf", "scale=400:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", join(out, `${style}-slow.mp4`)]);
  await rm(dir, { recursive: true, force: true });
  await page.close();
  console.log(style, "slow filmed");
}
await b.close();
server.close();
