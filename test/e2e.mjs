// Drives the built app in Chromium with real touch and mouse input and checks what is
// drawn by sampling canvas pixels. Square positions come from the PRNG, so the test reads
// them from the app's debug handle (window.unblock) and then checks the pixels.
// Run with `bun run e2e`; screenshots go to test/screenshots.
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const dist = new URL("../dist/", import.meta.url).pathname;
const shots = new URL("./screenshots/", import.meta.url).pathname;
await mkdir(shots, { recursive: true });

const server = createServer(async (req, res) => {
  const path = join(dist, req.url === "/" ? "index.html" : req.url.slice(1));
  try {
    res.writeHead(200, { "content-type": extname(path) === ".js" ? "text/javascript" : "text/html" });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const COLORS = {
  background: [243, 242, 238], dot: [211, 209, 202], border: [185, 182, 173],
  square: [79, 109, 143], moved: [63, 154, 122], tapped: [139, 95, 191], dragging: [224, 130, 61], circle: [214, 69, 69],
};
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

const rgbAt = (page, x, y) => page.evaluate(([x, y]) => {
  const c = document.querySelector("canvas");
  const d = c.width / c.clientWidth;
  return [...c.getContext("2d").getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data.slice(0, 3)];
}, [x, y]);
async function colorAt(page, x, y) {
  const rgb = await rgbAt(page, x, y);
  return Object.entries(COLORS).map(([n, c]) => [n, Math.hypot(...c.map((v, i) => v - rgb[i]))]).sort((a, b) => a[1] - b[1])[0][0];
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const expectColor = async (page, x, y, want, what) => {
  await frame(page);
  const got = await colorAt(page, x, y);
  check(got === want, `${what}: (${Math.round(x)},${Math.round(y)}) is ${got}${got === want ? "" : `, want ${want}`}`);
};
const camera = (page) => page.evaluate(() => ({ ...unblock.scene.camera }));
const toScreen = (cam, p) => ({ x: p.x * cam.scale + cam.offsetX, y: p.y * cam.scale + cam.offsetY });
const centerOf = (cam, s) => toScreen(cam, { x: s.x + s.size / 2, y: s.y + s.size / 2 });
const visible = (page) => page.evaluate(() => unblock.visibleSquares());
/** A point inside the border that is not on a square and not near the circle. */
const emptyPoint = (page) => page.evaluate(() => {
  const { scene } = unblock;
  const squares = unblock.visibleSquares();
  const c = scene.camera;
  for (let y = scene.height * 0.3; y < scene.height * 0.7; y += 7) {
    for (let x = scene.width * 0.3; x < scene.width * 0.7; x += 7) {
      const w = { x: (x - c.offsetX) / c.scale, y: (y - c.offsetY) / c.scale };
      const pad = 20 / c.scale;
      if (!squares.some((s) => w.x > s.x - pad && w.x < s.x + s.size + pad && w.y > s.y - pad && w.y < s.y + s.size + pad)) return { x, y };
    }
  }
  return null;
});

const browser = await chromium.launch();

// --- Phone: 400x800 CSS px at 2x, touch only.
{
  const context = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  // Fingers move in small steps like a real gesture.
  async function gesture(from, to, { steps = 12, during } = {}) {
    await touch("touchStart", from);
    for (let i = 1; i <= steps; i++) {
      const at = from.map(([x, y], f) => [x + (to[f][0] - x) * (i / steps), y + (to[f][1] - y) * (i / steps)]);
      await touch("touchMove", at);
      if (i === Math.floor(steps / 2) && during) await during(at);
    }
    await touch("touchEnd", []);
  }
  const panBy = async (dx, dy) => {
    const p = await emptyPoint(page);
    await gesture([[p.x, p.y]], [[p.x + dx, p.y + dy]]);
  };
  const fresh = async () => { await page.goto(url); await frame(page); };

  await fresh();
  const text = await page.evaluate(() => document.body.innerText.trim());
  check(/^\d+ fps · \d+ squares$/.test(text), `only text is the fps counter ("${text}")`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal scroll");
  let cam = await camera(page);
  let squares = await visible(page);
  check(squares.length >= 2, `a few squares are shown (${squares.length})`);
  for (const s of squares) {
    const c = centerOf(cam, s);
    if (c.x > 0 && c.x < 400 && c.y > 0 && c.y < 800) await expectColor(page, c.x, c.y, "square", `visible square ${s.id} is drawn`);
  }
  await page.screenshot({ path: shots + "phone-1-start.png" });

  // Culling: pan until some square is on screen but wholly outside the border, then make
  // sure it is not drawn, and that it appears once it crosses into the border.
  let culled = null;
  for (let i = 0; i < 12 && !culled; i++) {
    culled = await page.evaluate(() => {
      const ids = new Set(unblock.visibleSquares().map((s) => s.id));
      const c = unblock.scene.camera;
      return unblock.onScreen().find((s) => {
        const x = (s.x + s.size / 2) * c.scale + c.offsetX, y = (s.y + s.size / 2) * c.scale + c.offsetY;
        return !ids.has(s.id) && x > 2 && x < unblock.scene.width - 2 && y > 2 && y < unblock.scene.height - 2;
      }) ?? null;
    });
    if (!culled) await panBy(0, -97);
  }
  check(culled !== null, "found a square on screen but outside the border");
  if (culled) {
    cam = await camera(page);
    const c = centerOf(cam, culled);
    await expectColor(page, c.x, c.y, "background", `square ${culled.id} outside the border is not drawn`);
    await page.screenshot({ path: shots + "phone-2-culled.png" });
    // Pan it towards the screen centre; it must show up.
    const p = await emptyPoint(page);
    await gesture([[p.x, p.y]], [[p.x + (200 - c.x), p.y + (400 - c.y)]]);
    cam = await camera(page);
    const now = centerOf(cam, culled);
    const shown = (await visible(page)).some((s) => s.id === culled.id);
    check(shown, `square ${culled.id} is shown once inside the border`);
    if (shown) await expectColor(page, now.x, now.y, "square", `square ${culled.id} is drawn inside the border`);
  }

  // Same squares after panning away and back.
  await fresh();
  const before = await visible(page);
  for (let i = 0; i < 4; i++) await panBy(-120, -160);
  const away = (await visible(page)).map((s) => s.id).join();
  check(away !== before.map((s) => s.id).join(), "panning away shows other squares");
  for (let i = 0; i < 4; i++) await panBy(120, 160);
  check(JSON.stringify(await visible(page)) === JSON.stringify(before), "panning back shows the same squares in the same places");

  // Tap moves the circle.
  await fresh();
  let p = await emptyPoint(page);
  await gesture([[p.x, p.y]], [[p.x + 3, p.y + 2]], { steps: 2 });
  await expectColor(page, p.x, p.y, "circle", "tap puts the circle under the finger");
  const firstTap = p;
  await panBy(30, 40);
  p = await emptyPoint(page);
  await gesture([[p.x, p.y]], [[p.x, p.y]], { steps: 1 });
  await expectColor(page, p.x, p.y, "circle", "second tap moves the circle");
  await expectColor(page, firstTap.x + 30, firstTap.y + 40, "background", "old circle spot is cleared");

  // Tap a square: it turns purple, the circle stays where it was, and it is still purple
  // after panning it out of the border and back, and after a reload.
  cam = await camera(page);
  const tapTarget = (await visible(page)).find((s) => { const c = centerOf(cam, s); return c.x > 60 && c.x < 340 && c.y > 160 && c.y < 640; });
  const t = centerOf(cam, tapTarget);
  const circleBefore = await page.evaluate(() => unblock.scene.circle);
  await gesture([[t.x, t.y]], [[t.x + 3, t.y + 3]], { steps: 2 });
  await expectColor(page, t.x, t.y, "tapped", "tapping a square turns it purple");
  check(JSON.stringify(await page.evaluate(() => unblock.scene.circle)) === JSON.stringify(circleBefore), "tapping a square leaves the circle where it was");
  await page.screenshot({ path: shots + "phone-3-tapped-square.png" });
  await panBy(0, -350);
  await panBy(0, -350);
  await panBy(0, 350);
  await panBy(0, 350);
  await page.reload();
  await frame(page);
  cam = await camera(page);
  await expectColor(page, centerOf(cam, tapTarget).x, centerOf(cam, tapTarget).y, "tapped", "the tapped colour survives panning away and a reload");
  await gesture([[centerOf(cam, tapTarget).x, centerOf(cam, tapTarget).y]], [[centerOf(cam, tapTarget).x, centerOf(cam, tapTarget).y]], { steps: 1 });
  await expectColor(page, centerOf(cam, tapTarget).x, centerOf(cam, tapTarget).y, "square", "a second tap turns it back");

  // Drag a square: orange while dragging, green once dropped and stored, still there after reload.
  await page.evaluate(() => localStorage.clear());
  await fresh();
  cam = await camera(page);
  const square = (await visible(page)).find((s) => { const c = centerOf(cam, s); return c.x > 60 && c.x < 340 && c.y > 160 && c.y < 640; });
  const start = centerOf(cam, square);
  const target = { x: start.x < 200 ? start.x + 100 : start.x - 100, y: start.y < 400 ? start.y + 120 : start.y - 120 };
  let midDrag = null;
  let fpsWhileDragging = "";
  await gesture([[start.x, start.y]], [[target.x, target.y]], {
    during: async ([[x, y]]) => {
      await frame(page);
      midDrag = await colorAt(page, x, y);
      fpsWhileDragging = await page.evaluate(() => document.querySelector("#fps").textContent);
      await page.screenshot({ path: shots + "phone-4-dragging.png" });
    },
  });
  check(midDrag === "dragging", `square is orange while dragged (${midDrag})`);
  check(/^[1-9]\d* fps/.test(fpsWhileDragging), `fps counter counts frames during a drag ("${fpsWhileDragging}")`);
  await expectColor(page, target.x, target.y, "moved", "dropped square turns the stored colour");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("unblock-me:moved") ?? "[]"));
  check(stored.length === 1 && stored[0][0] === square.id, `move of ${square.id} is stored (${JSON.stringify(stored)})`);
  check(await page.evaluate(() => unblock.scene.tapped.size === 0), "dragging a square does not mark it as tapped");
  await page.screenshot({ path: shots + "phone-5-dropped.png" });
  await page.reload();
  await frame(page);
  await expectColor(page, target.x, target.y, "moved", "after a reload the moved square is restored, in the stored colour");
  const startEmpty = !(await visible(page)).some((s) => { const c = centerOf(cam, s); return Math.abs(c.x - start.x) < 45 && Math.abs(c.y - start.y) < 45; });
  check(startEmpty, "the square's generated spot stays empty after the move");

  // Pinch: spread around the centre and move down 100 px at once.
  await fresh();
  cam = await camera(page);
  const anchor = { x: (200 - cam.offsetX) / cam.scale, y: (400 - cam.offsetY) / cam.scale };
  await gesture([[175, 400], [225, 400]], [[150, 500], [250, 500]]);
  const after = await camera(page);
  check(Math.abs(after.scale / cam.scale - 2) < 0.01, `pinch doubles the zoom (${(after.scale / cam.scale).toFixed(3)}x)`);
  const anchorNow = toScreen(after, anchor);
  check(Math.hypot(anchorNow.x - 200, anchorNow.y - 500) < 1, `the point between the fingers followed them (${anchorNow.x.toFixed(1)},${anchorNow.y.toFixed(1)})`);
  await page.screenshot({ path: shots + "phone-5-pinch-pan.png" });

  // Zoom limits by pinching hard both ways.
  await gesture([[199, 400], [201, 400]], [[1, 400], [399, 400]]);
  let scale = (await camera(page)).scale;
  check(Math.abs(scale * 180 - 400) < 0.5, `max zoom: two squares fill the width (2 squares = ${(scale * 180).toFixed(1)} px)`);
  await page.screenshot({ path: shots + "phone-6-max-zoom.png" });
  await gesture([[1, 400], [399, 400]], [[199, 400], [201, 400]]);
  scale = (await camera(page)).scale;
  check(Math.abs(scale * 670 - 400 / 3) < 0.5, `min zoom: 670 world units fill a third of the width (${(scale * 670).toFixed(1)} px)`);
  const fpsText = await page.evaluate(() => document.querySelector("#fps").textContent);
  const counts = await page.evaluate(() => [unblock.visibleSquares().length, unblock.onScreen().length]);
  check(Number(fpsText.split(" · ")[1].split(" ")[0]) === counts[0] && counts[0] < counts[1],
    `zoomed out, only the ${counts[0]} squares inside the border are drawn, of ${counts[1]} on screen (${fpsText})`);
  await page.screenshot({ path: shots + "phone-7-min-zoom.png" });
  await context.close();
}

// --- Desktop: mouse and wheel; dots grow with zoom.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await frame(page);
  // Width of the dot at world (0,0), which is at the screen centre and not under a square.
  const dotWidth = async () => {
    const cam = await camera(page);
    const c = toScreen(cam, { x: 0, y: 0 });
    let w = 0;
    for (let x = Math.round(c.x) - 30; x <= Math.round(c.x) + 30; x++) if ((await colorAt(page, x, c.y)) === "dot") w++;
    return w;
  };
  const before = await dotWidth();
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -500);
  await frame(page);
  const zoom = (await camera(page)).scale;
  const afterZoom = await dotWidth();
  check(before >= 3 && afterZoom > before * 2, `dots grow with zoom (${before}px -> ${afterZoom}px at ${zoom.toFixed(2)}x)`);
  await page.screenshot({ path: shots + "desktop-zoomed.png" });

  const p = await emptyPoint(page);
  await page.mouse.click(p.x, p.y);
  await expectColor(page, p.x, p.y, "circle", "mouse click places the circle");
  const cam = await camera(page);
  const s = (await visible(page)).find((s) => { const c = centerOf(cam, s); return c.x > 200 && c.x < 1080 && c.y > 200 && c.y < 600; });
  const c = centerOf(cam, s);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 30, { steps: 8 });
  await expectColor(page, c.x + 60, c.y + 30, "dragging", "mouse drag colours the square");
  await page.mouse.up();
  await expectColor(page, c.x + 60, c.y + 30, "moved", "mouse drop stores the square");
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
