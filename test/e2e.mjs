// Drives the built app in Chromium with real touch and mouse input and checks what is
// drawn by sampling canvas pixels. Most checks place an exact board with unblock.place();
// the rest use the app's random layout and its reset block.
// Run with `bun run e2e`; screenshots go to test/screenshots.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  block: [79, 109, 143], moved: [63, 154, 122], tapped: [139, 95, 191], dragging: [224, 130, 61],
  circle: [214, 69, 69], reset: [29, 29, 31],
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
const expectColor = async (page, [x, y], want, what) => {
  await frame(page);
  const got = await colorAt(page, x, y);
  check(got === want, `${what}: (${Math.round(x)},${Math.round(y)}) is ${got}${got === want ? "" : `, want ${want}`}`);
};
const block = (page, id) => page.evaluate((id) => unblock.visibleBlocks().find((b) => b.id === id), id);
const blockIds = (page) => page.evaluate(() => unblock.visibleBlocks().map((b) => `${b.id}@${b.x},${b.y}`).sort().join(" "));

const browser = await chromium.launch();

// --- Phone: 400x800 CSS px at 2x, touch only. The view starts centred on the reset cell
// (0,0), so lattice point (x,y) is at screen (170 + 60x, 370 + 60y); the border spans
// about x -2.1..3.1, y -4.8..5.8.
{
  const context = await browser.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const cell = (x, y) => [170 + x * UNIT, 370 + y * UNIT];
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
  const tap = (p) => gesture([p], [[p[0] + 2, p[1] + 2]], { steps: 1 });
  const fresh = async () => { await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.goto(url); await frame(page); };
  const place = async (blocks) => { await page.evaluate((b) => unblock.place(b), blocks); await frame(page); };
  const H = (id, x, y) => ({ id, x, y, w: 2, h: 1 });
  const V = (id, x, y) => ({ id, x, y, w: 1, h: 2 });
  const UI = [
    { id: "border", x: -1, y: 0, w: 1, h: 1, ui: "border" },
    { id: "reset", x: 0, y: 0, w: 1, h: 1, ui: "reset" },
    { id: "fullscreen", x: 1, y: 0, w: 1, h: 1, ui: "fullscreen" },
  ];

  // Random layout with the UI blocks in the middle.
  await fresh();
  const text = await page.evaluate(() => document.body.innerText.trim());
  check(/^\d+ fps · \d+ blocks$/.test(text), `only text is the fps counter ("${text}")`);
  for (const [x, what] of [[-0.85, "border toggle"], [0.15, "reset"], [1.15, "fullscreen"]]) {
    await expectColor(page, cell(x, 0.15), "reset", `the ${what} block is black, in the middle row`);
  }
  const iconPixels = await page.evaluate(() => {
    const c = document.querySelector("canvas"), d = c.width / c.clientWidth;
    const data = c.getContext("2d").getImageData(170 * d, 370 * d, 60 * d, 60 * d).data;
    let light = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200) light++;
    return light / (data.length / 4);
  });
  check(iconPixels > 0.05 && iconPixels < 0.4, `the reset block shows a light icon (${(iconPixels * 100).toFixed(0)}% of its middle)`);
  const random = await page.evaluate(() => unblock.visibleBlocks());
  check(random.length >= 12, `the random layout is dense (${random.length} blocks inside the border)`);
  check(random.every((b) => b.ui || (b.w === 2 && b.h === 1) || (b.w === 1 && b.h === 2)), "every block is 2x1 or 1x2");
  check(random.filter((b) => b.ui).every((b) => b.w === 1 && b.h === 1), "UI blocks are 1x1");
  await page.screenshot({ path: shots + "phone-1-random.png" });

  // Reset: change something, tap the black block, get a new seed and new blocks, nothing kept.
  const seedBefore = await page.evaluate(() => unblock.seed());
  const blocksBefore = await blockIds(page);
  const movable = await page.evaluate(() => unblock.visibleBlocks().find((b) => {
    if (b.ui) return false;
    const { lo, hi } = unblock.slideRange(b.id), pos = b.w > b.h ? b.x : b.y;
    const x = 170 + (b.x + b.w / 2) * 60, y = 370 + (b.y + b.h / 2) * 60;
    return hi > pos && x > 20 && x < 380 && y > 100 && y < 700;
  }));
  const from = cell(movable.x + movable.w / 2, movable.y + movable.h / 2);
  await gesture([from], [movable.w > movable.h ? [from[0] + 60, from[1]] : [from[0], from[1] + 60]]);
  check((await block(page, movable.id)).moved, `a random block (${movable.id}) was moved before the reset`);
  await page.reload();
  await frame(page);
  check((await page.evaluate(() => unblock.seed())) === seedBefore && (await block(page, movable.id))?.moved, "the seed and the move survive a reload");
  await tap(cell(0.5, 0.5));
  await frame(page);
  const seedAfter = await page.evaluate(() => unblock.seed());
  check(seedAfter !== seedBefore, `tapping the reset block changes the seed (${seedBefore} -> ${seedAfter})`);
  check((await blockIds(page)) !== blocksBefore, "and lays out different blocks");
  check(await page.evaluate(() => unblock.scene.moved.size === 0 && unblock.scene.tapped.size === 0 && unblock.scene.circle === null), "and forgets every move, mark and the circle");
  await expectColor(page, cell(0.15, 0.15), "reset", "the reset block is still in the middle");
  await page.screenshot({ path: shots + "phone-2-after-reset.png" });
  const afterReset = await blockIds(page);
  await page.reload();
  await frame(page);
  check((await page.evaluate(() => unblock.seed())) === seedAfter && (await blockIds(page)) === afterReset, "the new layout survives a reload");

  // Dragging a UI block pans instead.
  const cam = await page.evaluate(() => ({ ...unblock.scene.camera }));
  await gesture([cell(0.5, 0.5)], [cell(1.5, 1.5)]);
  const camAfter = await page.evaluate(() => ({ ...unblock.scene.camera }));
  check(Math.abs(camAfter.offsetX - cam.offsetX - 60) < 0.5 && (await block(page, "reset")).x === 0, "dragging the reset block pans the board, the block stays");

  // The border toggle: off culls to the screen edge and hides the border line.
  await fresh();
  const borderLine = [40.5, 200]; // on the left edge of the 80% border
  await expectColor(page, borderLine, "border", "the border line is drawn");
  const withBorder = (await page.evaluate(() => unblock.visibleBlocks())).length;
  // The middle of the switch: the light track when on, dark when off.
  await expectColor(page, cell(-0.5, 0.5), "background", "the switch in the toggle block is on (light track)");
  await tap(cell(-0.5, 0.5));
  await frame(page);
  const withoutBorder = (await page.evaluate(() => unblock.visibleBlocks())).length;
  check(await page.evaluate(() => unblock.scene.border === false), "tapping the border toggle turns the border off");
  check(withoutBorder > withBorder, `more blocks are drawn without the border (${withBorder} -> ${withoutBorder})`);
  check((await colorAt(page, ...borderLine)) !== "border", "and the border line is gone");
  await expectColor(page, cell(-0.5, 0.5), "reset", "and the switch in the toggle block is off (dark track)");
  await page.screenshot({ path: shots + "phone-2b-border-off.png" });
  await page.reload();
  await frame(page);
  check(await page.evaluate(() => unblock.scene.border === false), "the border setting survives a reload");
  await tap(cell(-0.5, 0.5));
  await expectColor(page, borderLine, "border", "tapping it again brings the border back");

  // The fullscreen block.
  await tap(cell(1.5, 0.5));
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.fullscreenElement !== null), "tapping the fullscreen block enters fullscreen");
  await page.screenshot({ path: shots + "phone-2c-fullscreen.png" });
  await tap(cell(1.5, 0.5));
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.fullscreenElement === null), "tapping it again leaves fullscreen");

  // Exact boards from here on.
  await fresh();
  await place([H("a", -2, 0), H("b", 2, 0)]); // a can slide right to x = 0
  let mid = null;
  await gesture([cell(-1, 0.5)], [cell(3, 2)], {
    during: async () => {
      mid = await page.evaluate(() => ({ ...unblock.scene.dragging }));
      await expectColor(page, cell(mid.x + 1, 0.5), "dragging", "the dragged block is orange");
      await page.screenshot({ path: shots + "phone-3-dragging.png" });
    },
  });
  check(mid.y === 0 && mid.x > -2 && mid.x <= 0, `mid-drag the block stays in its row and before its neighbour (x ${mid.x.toFixed(2)})`);
  check((await block(page, "a")).x === 0, "it stops right in front of its neighbour");
  await expectColor(page, cell(1, 0.5), "moved", "the moved block is green");
  await expectColor(page, cell(2.5, 0.5), "block", "the neighbour did not move");

  await place([V("v", 0, -2)]);
  await gesture([cell(0.5, -1)], [cell(2, 1.3)]); // 2.3 down, 1.5 right
  check((await block(page, "v")).y === 0 && (await block(page, "v")).x === 0, "a vertical block slides only vertically and snaps (2.3 cells -> 2)");

  await place([H("a", -1, 0), V("l", -2, -1), V("r", 1, 0)]);
  await gesture([cell(0, 0.5)], [cell(2, 0.5)]);
  await gesture([cell(0, 0.5)], [cell(-2, 0.5)]);
  check(!(await block(page, "a")).moved, "a boxed-in block does not move either way");

  await place([...UI, H("a", 2, 1), V("b", 0, 2)]);
  await gesture([cell(0.5, 3)], [cell(0.5, -3)]);
  check((await block(page, "b")).y === 1, "the UI blocks block other blocks");

  // Taps on an exact board.
  await place([H("a", -1, 2)]);
  await tap(cell(0, 2.5));
  await expectColor(page, cell(0, 2.5), "tapped", "a tapped block turns purple");
  check(await page.evaluate(() => unblock.scene.circle === null), "a tap on a block does not move the circle");
  await tap(cell(-1.5, -3));
  await expectColor(page, cell(-1.5, -3), "circle", "a tap on the background puts the circle there");

  // Pinch zooms and pans together; limits hold.
  await place([]);
  const before = await page.evaluate(() => ({ ...unblock.scene.camera }));
  await gesture([[175, 400], [225, 400]], [[150, 500], [250, 500]]);
  const after = await page.evaluate(() => ({ ...unblock.scene.camera }));
  check(Math.abs(after.scale / before.scale - 2) < 0.01 && Math.abs(after.offsetY - 500 - (before.offsetY - 400) * 2) < 1, "pinch doubles the zoom and follows the fingers");
  await gesture([[199, 400], [201, 400]], [[1, 400], [399, 400]]);
  check(Math.abs((await page.evaluate(() => unblock.scene.camera.scale)) * 2 * UNIT - 400) < 0.5, "max zoom: two cells fill the width");
  // Live reload: a new build id makes an open page reload itself, keeping the view.
  await page.evaluate(() => { unblock.scene.camera = { ...unblock.scene.camera, offsetX: 111, offsetY: 222 }; });
  const buildFile = join(dist, "build.txt");
  const build = await readFile(buildFile, "utf8");
  const reloaded = page.waitForEvent("load", { timeout: 5000 }).then(() => true, () => false);
  await writeFile(buildFile, "a-newer-build");
  const didReload = await reloaded;
  await writeFile(buildFile, build);
  await frame(page);
  check(didReload, "a new build reloads the open page by itself");
  const kept = await page.evaluate(() => unblock.scene.camera);
  check(kept.offsetX === 111 && kept.offsetY === 222, "and the view stays where it was");
  await context.close();
}

// --- Desktop: mouse drag and wheel on an exact board.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await page.evaluate(() => unblock.place([{ id: "a", x: 2, y: 0, w: 2, h: 1 }]));
  await frame(page);
  const at = (x, y) => [610 + x * UNIT, 370 + y * UNIT];
  await page.mouse.move(...at(3, 0.5));
  await page.mouse.down();
  await page.mouse.move(...at(4.2, 0.5), { steps: 8 });
  await expectColor(page, at(4.2, 0.5), "dragging", "mouse drag colours the block");
  await page.mouse.up();
  check((await block(page, "a")).x === 3, "mouse drop snaps one cell on");
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await frame(page);
  check((await page.evaluate(() => unblock.scene.camera.scale)) > 1.5, "wheel zooms in");
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
