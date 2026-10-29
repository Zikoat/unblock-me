// Drives the built app in Chromium with real touch and mouse input and checks what is
// drawn by sampling canvas pixels. Block positions come from the PRNG, so the test reads
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

const UNIT = 60;
const COLORS = {
  background: [243, 242, 238], dot: [211, 209, 202], border: [185, 182, 173],
  block: [79, 109, 143], moved: [63, 154, 122], tapped: [139, 95, 191], dragging: [224, 130, 61], circle: [214, 69, 69],
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
  const name = Object.entries(COLORS).map(([n, c]) => [n, Math.hypot(...c.map((v, i) => v - rgb[i]))]).sort((a, b) => a[1] - b[1])[0][0];
  return name === "dot" ? "background" : name;
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const expectColor = async (page, x, y, want, what) => {
  await frame(page);
  const got = await colorAt(page, x, y);
  check(got === want, `${what}: (${Math.round(x)},${Math.round(y)}) is ${got}${got === want ? "" : `, want ${want}`}`);
};
const camera = (page) => page.evaluate(() => ({ ...unblock.scene.camera }));
const toScreen = (cam, p) => ({ x: p.x * cam.scale + cam.offsetX, y: p.y * cam.scale + cam.offsetY });
const centerOf = (cam, b) => toScreen(cam, { x: (b.x + b.w / 2) * UNIT, y: (b.y + b.h / 2) * UNIT });
const horizontal = (b) => b.w > b.h;
const visible = (page) => page.evaluate(() => unblock.visibleBlocks());
const range = (page, id) => page.evaluate((id) => unblock.slideRange(id), id);
/** A point inside the border that is not on a block and not near one. */
const emptyPoint = (page) => page.evaluate(() => {
  const { scene, UNIT } = unblock;
  const blocks = unblock.visibleBlocks();
  const c = scene.camera;
  for (let y = scene.height * 0.3; y < scene.height * 0.7; y += 7) {
    for (let x = scene.width * 0.3; x < scene.width * 0.7; x += 7) {
      const w = { x: (x - c.offsetX) / c.scale / UNIT, y: (y - c.offsetY) / c.scale / UNIT };
      const pad = 20 / c.scale / UNIT;
      if (!blocks.some((b) => w.x > b.x - pad && w.x < b.x + b.w + pad && w.y > b.y - pad && w.y < b.y + b.h + pad)) return { x, y };
    }
  }
  return null;
});
/** A visible block near the screen centre whose lane matches `test(block, lo, hi, pos)`. */
async function findBlock(page, test) {
  const cam = await camera(page);
  for (const b of await visible(page)) {
    const c = centerOf(cam, b);
    if (c.x < 60 || c.x > 340 || c.y < 200 || c.y > 600) continue;
    const { lo, hi } = await range(page, b.id);
    if (test(b, lo, hi, horizontal(b) ? b.x : b.y)) return { block: b, lo, hi };
  }
  return null;
}

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
  const fresh = async () => { await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.goto(url); await frame(page); };

  await fresh();
  const text = await page.evaluate(() => document.body.innerText.trim());
  check(/^\d+ fps · \d+ blocks$/.test(text), `only text is the fps counter ("${text}")`);
  let cam = await camera(page);
  let blocks = await visible(page);
  check(blocks.length >= 3, `blocks are shown (${blocks.length})`);
  check(blocks.every((b) => (b.w === 2 && b.h === 1) || (b.w === 1 && b.h === 2)), "every block is 2x1 or 1x2");
  check(blocks.every((b) => Number.isInteger(b.x) && Number.isInteger(b.y)), "every block sits on the lattice");
  for (const b of blocks) {
    const c = centerOf(cam, b);
    if (c.x > 0 && c.x < 400 && c.y > 0 && c.y < 800) await expectColor(page, c.x, c.y, "block", `block ${b.id} (${b.w}x${b.h}) is drawn`);
  }
  await page.screenshot({ path: shots + "phone-1-start.png" });

  // Slide a block one and a half cells along its axis while also moving sideways: it stays
  // in its lane, is orange during the drag and lands on the lattice two cells on.
  let found = await findBlock(page, (b, lo, hi, pos) => hi - pos >= 3);
  check(found !== null, "found a block with room to slide");
  if (found) {
    const { block } = found;
    cam = await camera(page);
    const cell = UNIT * cam.scale;
    const c = centerOf(cam, block);
    const to = horizontal(block) ? [c.x + 1.6 * cell, c.y + 0.8 * cell] : [c.x + 0.8 * cell, c.y + 1.6 * cell];
    let mid = null;
    await gesture([[c.x, c.y]], [to], {
      during: async () => {
        await frame(page);
        mid = await page.evaluate(() => ({ ...unblock.scene.dragging }));
        await page.screenshot({ path: shots + "phone-2-dragging.png" });
      },
    });
    check(mid && (horizontal(block) ? mid.y === block.y : mid.x === block.x), "while dragged the block stays in its lane");
    check(mid && !Number.isInteger(horizontal(block) ? mid.x : mid.y), "while dragged the block moves smoothly between cells");
    const midScreen = centerOf(cam, { ...block, x: mid.x, y: mid.y });
    const now = (await visible(page)).find((b) => b.id === block.id);
    const want = horizontal(block) ? { x: block.x + 2, y: block.y } : { x: block.x, y: block.y + 2 };
    check(now && now.x === want.x && now.y === want.y, `dropped two cells on, on the lattice (${now?.x},${now?.y})`);
    const landed = centerOf(cam, { ...block, ...want });
    await expectColor(page, landed.x, landed.y, "moved", "the moved block is drawn in the stored colour where it landed");
    await page.screenshot({ path: shots + "phone-3-dropped.png" });
    check(midScreen.x > 0, "drag position was on screen");
    await page.reload();
    await frame(page);
    const restored = (await visible(page)).find((b) => b.id === block.id);
    check(restored && restored.x === want.x && restored.y === want.y && restored.moved, "after a reload the block is where it was dropped");
  }

  // Drag a block hard towards a neighbour in its lane: it stops right in front of it.
  await fresh();
  found = await findBlock(page, (b, lo, hi, pos) => hi - pos >= 1 && hi - pos <= 3);
  check(found !== null, "found a block with a neighbour a few cells ahead");
  if (found) {
    const { block, hi } = found;
    cam = await camera(page);
    const cell = UNIT * cam.scale;
    const c = centerOf(cam, block);
    const to = horizontal(block) ? [c.x + 8 * cell, c.y] : [c.x, c.y + 8 * cell];
    let mid = null;
    await gesture([[c.x, c.y]], [to], { steps: 16, during: async () => { mid = await page.evaluate(() => ({ ...unblock.scene.dragging })); } });
    check(mid && (horizontal(block) ? mid.x : mid.y) <= hi + 1e-9, `even mid-drag the block never passes its neighbour (at ${(horizontal(block) ? mid.x : mid.y).toFixed(2)}, limit ${hi})`);
    const now = (await visible(page)).find((b) => b.id === block.id);
    check(now && (horizontal(block) ? now.x : now.y) === hi, `it stopped right before the neighbour (at ${horizontal(block) ? now?.x : now?.y}, limit ${hi})`);
    const after = await page.evaluate(() => unblock.visibleBlocks());
    const cells = new Set();
    let overlap = false;
    for (const b of after) for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) { const k = `${x},${y}`; if (cells.has(k)) overlap = true; cells.add(k); }
    check(!overlap, "no two blocks share a lattice cell");
    await page.screenshot({ path: shots + "phone-4-blocked.png" });
  }

  // A block touching a neighbour in its lane cannot move towards it at all.
  await fresh();
  // Walk the camera across the world until such a block sits in the middle of the screen.
  await page.evaluate(() => {
    const { scene, UNIT } = unblock;
    for (let i = 0; i < 400; i++) {
      scene.camera = { ...scene.camera, offsetX: 200 - (i % 20) * 3 * UNIT * scene.camera.scale, offsetY: 400 - Math.floor(i / 20) * 3 * UNIT * scene.camera.scale };
      const near = unblock.visibleBlocks().find((b) => {
        const c = scene.camera, x = (b.x + b.w / 2) * UNIT * c.scale + c.offsetX, y = (b.y + b.h / 2) * UNIT * c.scale + c.offsetY;
        const { lo, hi } = unblock.slideRange(b.id), pos = b.w > b.h ? b.x : b.y;
        return x > 60 && x < 340 && y > 200 && y < 600 && (lo === pos || hi === pos);
      });
      if (near) break;
    }
    unblock.redraw();
  });
  await frame(page);
  found = await findBlock(page, (b, lo, hi, pos) => lo === pos || hi === pos);
  check(found !== null, "found a block touching a neighbour");
  if (found) {
    const { block, lo } = found;
    cam = await camera(page);
    const c = centerOf(cam, block);
    const cell = UNIT * cam.scale;
    const sign = lo === (horizontal(block) ? block.x : block.y) ? -1 : 1; // towards the neighbour
    await gesture([[c.x, c.y]], [horizontal(block) ? [c.x + sign * 3 * cell, c.y] : [c.x, c.y + sign * 3 * cell]]);
    const now = (await visible(page)).find((b) => b.id === block.id);
    check(now && now.x === block.x && now.y === block.y && !now.moved, `block ${block.id} does not move into the neighbour it touches`);
  }

  // Taps: on the background the circle moves, on a block it turns purple.
  await fresh();
  const p = await emptyPoint(page);
  await gesture([[p.x, p.y]], [[p.x + 3, p.y + 2]], { steps: 2 });
  await expectColor(page, p.x, p.y, "circle", "tap on the background puts the circle there");
  cam = await camera(page);
  const tapTarget = (await visible(page)).find((b) => { const c = centerOf(cam, b); return c.x > 60 && c.x < 340 && c.y > 200 && c.y < 600; });
  const t = centerOf(cam, tapTarget);
  await gesture([[t.x, t.y]], [[t.x + 3, t.y + 3]], { steps: 2 });
  await expectColor(page, t.x, t.y, "tapped", "tap on a block turns it purple");
  await expectColor(page, p.x, p.y, "circle", "tap on a block leaves the circle");
  const still = (await visible(page)).find((b) => b.id === tapTarget.id);
  check(still.x === tapTarget.x && still.y === tapTarget.y, "a tap does not move the block");

  // Culling still works with blocks.
  await fresh();
  let culled = null;
  for (let i = 0; i < 12 && !culled; i++) {
    culled = await page.evaluate(() => {
      const ids = new Set(unblock.visibleBlocks().map((b) => b.id));
      const c = unblock.scene.camera;
      return unblock.onScreen().find((b) => {
        const x = (b.x + b.w / 2) * unblock.UNIT * c.scale + c.offsetX, y = (b.y + b.h / 2) * unblock.UNIT * c.scale + c.offsetY;
        return !ids.has(b.id) && x > 2 && x < unblock.scene.width - 2 && y > 2 && y < unblock.scene.height - 2;
      }) ?? null;
    });
    if (!culled) await panBy(0, -97);
  }
  check(culled !== null, "found a block on screen but outside the border");
  if (culled) {
    cam = await camera(page);
    const c = centerOf(cam, culled);
    await expectColor(page, c.x, c.y, "background", `block ${culled.id} outside the border is not drawn`);
  }

  // Pinch zooms and pans together; limits hold.
  await fresh();
  cam = await camera(page);
  const anchor = { x: (200 - cam.offsetX) / cam.scale, y: (400 - cam.offsetY) / cam.scale };
  await gesture([[175, 400], [225, 400]], [[150, 500], [250, 500]]);
  const after = await camera(page);
  check(Math.abs(after.scale / cam.scale - 2) < 0.01, `pinch doubles the zoom (${(after.scale / cam.scale).toFixed(3)}x)`);
  const anchorNow = toScreen(after, anchor);
  check(Math.hypot(anchorNow.x - 200, anchorNow.y - 500) < 1, "the point between the fingers followed them");
  await gesture([[199, 400], [201, 400]], [[1, 400], [399, 400]]);
  check(Math.abs((await camera(page)).scale * 2 * UNIT - 400) < 0.5, "max zoom: two cells fill the width");
  await page.screenshot({ path: shots + "phone-5-max-zoom.png" });
  await gesture([[1, 400], [399, 400]], [[199, 400], [201, 400]]);
  check(Math.abs((await camera(page)).scale * 670 - 400 / 3) < 0.5, "min zoom: 670 world units fill a third of the width");
  await page.screenshot({ path: shots + "phone-6-min-zoom.png" });
  await context.close();
}

// --- Desktop: mouse drag of a block, wheel zoom.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await frame(page);
  const cam = await camera(page);
  let pick = null;
  for (const b of await visible(page)) {
    const c = centerOf(cam, b);
    if (c.x < 300 || c.x > 980 || c.y < 200 || c.y > 600) continue;
    const { lo, hi } = await range(page, b.id);
    if (hi - (horizontal(b) ? b.x : b.y) >= 1) { pick = b; break; }
  }
  const c = centerOf(cam, pick);
  const cell = UNIT * cam.scale;
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  const to = horizontal(pick) ? { x: c.x + cell, y: c.y } : { x: c.x, y: c.y + cell };
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expectColor(page, to.x, to.y, "dragging", "mouse drag colours the block");
  await page.mouse.up();
  await expectColor(page, to.x, to.y, "moved", "mouse drop lands the block one cell on");
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await frame(page);
  check((await camera(page)).scale > cam.scale * 1.5, "wheel zooms in");
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
