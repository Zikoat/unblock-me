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
  const url = req.url.split("?")[0];
  const path = join(dist, url.endsWith("/") ? url + "index.html" : url);
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": extname(path) === ".js" ? "text/javascript" : "text/html" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const UNIT = 60;
const COLORS = {
  background: [243, 242, 238], dot: [211, 209, 202], border: [185, 182, 173],
  block: [79, 109, 143], moved: [63, 154, 122], dragging: [224, 130, 61],
  goal: [214, 69, 69], circle: [58, 57, 54], reset: [29, 29, 31], wall: [95, 93, 87],
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
  const place = async (blocks, goal = null) => { await page.evaluate(([b, g]) => unblock.place(b, g), [blocks, goal]); await frame(page); };
  const H = (id, x, y) => ({ id, x, y, w: 2, h: 1 });
  const V = (id, x, y) => ({ id, x, y, w: 1, h: 2 });
  const Wall = (x, y) => ({ id: `wall${x},${y}`, x, y, w: 1, h: 1, wall: true });
  const UI = [
    { id: "home", x: -1, y: -1, w: 1, h: 1, ui: "home" },
    { id: "undo", x: 0, y: -1, w: 1, h: 1, ui: "undo" },
    { id: "tapmode", x: 1, y: -1, w: 1, h: 1, ui: "tapmode" },
    { id: "ease", x: 2, y: -1, w: 1, h: 1, ui: "ease" },
    { id: "density", x: -2, y: 0, w: 1, h: 1, ui: "density" },
    { id: "border", x: -1, y: 0, w: 1, h: 1, ui: "border" },
    { id: "reset", x: 0, y: 0, w: 1, h: 1, ui: "reset" },
    { id: "fullscreen", x: 1, y: 0, w: 1, h: 1, ui: "fullscreen" },
    { id: "reports", x: 2, y: 0, w: 1, h: 1, ui: "reports" },
  ];

  // Random layout with the UI blocks in the middle.
  await fresh();
  const text = await page.evaluate(() => document.body.innerText.trim());
  check(/^\d+ fps · \d+[smhd] ago · 7 tries$/.test(text), `only text is the debug counter: fps, build age, density ("${text}")`);
  for (const [x, what] of [[-1.85, "density"], [-0.85, "border toggle"], [0.15, "reset"], [1.15, "fullscreen"], [2.15, "reports"]]) {
    await expectColor(page, cell(x, 0.15), "reset", `the ${what} block is black, in the lower UI row`);
  }
  for (const [x, what] of [[-0.85, "home"], [0.15, "undo"], [1.15, "tap mode"], [2.15, "ease"]]) {
    await expectColor(page, cell(x, -0.85), "reset", `the ${what} block is black, in the upper UI row`);
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
  // Turn the border off, pan, and leave another page's key on this origin, then reset.
  await tap(cell(-0.5, 0.5));
  await gesture([cell(0.5, 0.5)], [cell(1.5, 1.2)]);
  await page.evaluate(() => localStorage.setItem("someone-else", "keep me"));
  const resetReload = page.waitForEvent("load", { timeout: 5000 }).then(() => true, () => false);
  await tap(cell(1.5, 1.2)); // the reset block, after the pan
  check(await resetReload, "tapping the reset block reloads the page");
  await frame(page);
  const seedAfter = await page.evaluate(() => unblock.seed());
  check(seedAfter !== seedBefore, `with a new seed (${seedBefore} -> ${seedAfter})`);
  check((await blockIds(page)) !== blocksBefore, "and different blocks");
  check(await page.evaluate(() => unblock.scene.moved.size === 0 && unblock.scene.history.length === 0 && unblock.scene.circle === null), "and no moves, history or circle");
  check(await page.evaluate(() => unblock.scene.border === false), "and the border back off");
  check(await page.evaluate(() => unblock.scene.camera.offsetX === 170 && unblock.scene.camera.offsetY === 370 && unblock.scene.camera.scale === 1), "and the view centred");
  await page.evaluate(() => unblock.goalReady());
  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
  const { "unblock-me:v5:goal": storedGoal, ...rest } = stored;
  check(JSON.stringify(rest) === JSON.stringify({
    "someone-else": "keep me",
    "unblock-me:border": "false",
    "unblock-me:ease": '"Ease out cubic"',
    "unblock-me:speed": "1",
    "unblock-me:tap-mode": '"topright"',
    "unblock-me:tries": "7",
    "unblock-me:v5:history": "[]",
    "unblock-me:v5:moved": "[]",
    "unblock-me:v5:seed": String(seedAfter),
  }), `storage holds only fresh defaults, and other pages' keys are left alone (${JSON.stringify(rest)})`);
  check(JSON.parse(storedGoal ?? "null")?.seed === seedAfter, "and a new goal for the new seed");
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

  // The border toggle: off by default, culling to the screen edge; on draws the smaller
  // border and culls to it.
  await fresh();
  const borderLine = [40.5, 200]; // on the left edge of the 80% border
  check(await page.evaluate(() => unblock.scene.border === false), "the border is off by default");
  check((await colorAt(page, ...borderLine)) !== "border", "so no border line is drawn");
  // The middle of the switch: the light track when on, dark when off.
  await expectColor(page, cell(-0.5, 0.5), "reset", "and the switch in the toggle block is off (dark track)");
  const withoutBorder = (await page.evaluate(() => unblock.visibleBlocks())).length;
  await tap(cell(-0.5, 0.5));
  await frame(page);
  const withBorder = (await page.evaluate(() => unblock.visibleBlocks())).length;
  check(await page.evaluate(() => unblock.scene.border === true), "tapping the border toggle turns the border on");
  await expectColor(page, borderLine, "border", "and draws the border line");
  check(withBorder < withoutBorder, `fewer blocks are drawn with the border (${withoutBorder} -> ${withBorder})`);
  await expectColor(page, cell(-0.5, 0.5), "background", "and the switch in the toggle block is on (light track)");
  await page.screenshot({ path: shots + "phone-2b-border-on.png" });
  await page.reload();
  await frame(page);
  check(await page.evaluate(() => unblock.scene.border === true), "the border setting survives a reload");
  await tap(cell(-0.5, 0.5));
  await frame(page);
  check((await colorAt(page, ...borderLine)) !== "border", "tapping it again turns the border off");

  // The fullscreen block.
  await tap(cell(1.5, 0.5));
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.fullscreenElement !== null), "tapping the fullscreen block enters fullscreen");
  await page.screenshot({ path: shots + "phone-2c-fullscreen.png" });
  await tap(cell(1.5, 0.5));
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.fullscreenElement === null), "tapping it again leaves fullscreen");

  // The density slider: its knob follows the finger, and the board follows the knob.
  // Track: x from 0.24 to 0.76 of the block, at y 0.7; 7 tries puts the knob at 6/29.
  await fresh();
  const sparse = (await page.evaluate(() => unblock.visibleBlocks())).length;
  const track = { left: cell(-2 + 0.24, 0)[0], width: 0.52 * UNIT, y: cell(0, 0.7)[1] };
  const knob = [track.left + track.width * (6 / 29), track.y];
  let underFinger = [];
  await gesture([knob], [[knob[0] + 10, knob[1]]], {
    steps: 10,
    during: async ([[x, y]]) => {
      await frame(page);
      // Light (the knob) right under the finger, dark track a few px beside it.
      underFinger = [await colorAt(page, x, y), await colorAt(page, x + 8, y - 6)];
      await page.screenshot({ path: shots + "phone-2d-sliding.png" });
    },
  });
  check(underFinger[0] === "background" && underFinger[1] === "reset", `the knob stays under the finger while dragging (${underFinger.join(", ")})`);
  // 10 px on a 31.2 px track from 6/29: round(1 + 29 * (6/29 + 10/31.2)) = 16.
  check(await page.evaluate(() => unblock.tries() === 16), `dragging the knob 10 px right sets 16 tries (${await page.evaluate(() => unblock.tries())})`);
  const dense = (await page.evaluate(() => unblock.visibleBlocks())).length;
  check(dense > sparse, `and the board fills up (${sparse} -> ${dense} blocks)`);
  check(await page.evaluate(() => unblock.scene.camera.offsetX === 170), "without panning");
  await page.screenshot({ path: shots + "phone-2d-dense.png" });
  await page.reload();
  await frame(page);
  check(await page.evaluate(() => unblock.tries() === 16), "the density survives a reload");
  await gesture([[track.left + track.width * (15 / 29), track.y]], [[track.left - 200, track.y]]);
  check(await page.evaluate(() => unblock.tries() === 1), "and stops at 1 try at the left end");

  // Walls are drawn grey and do not move.
  await place([{ id: "w", x: -1, y: 2, w: 1, h: 1, wall: true }]);
  await expectColor(page, cell(-0.5, 2.5), "wall", "a wall is grey");
  await gesture([cell(-0.5, 2.5)], [cell(1.5, 2.5)]);
  check((await block(page, "w")).x === -1, "dragging a wall moves the view, not the wall");

  // A ?board= link opens exactly that board, here the frozen pinwheel from the jam report;
  // none of its blocks can be dragged anywhere, and nothing is stored.
  const W = (x, y) => ({ id: `w${x},${y}`, x, y, w: 1, h: 1, wall: true });
  const pinwheel = [H("a", 0, 0), V("b", 2, 0), H("c", 1, 2), V("d", 0, 1), W(-1, 0), W(2, -1), W(3, 2), W(0, 3)];
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?board=${encodeURIComponent(JSON.stringify(pinwheel))}`);
  await frame(page);
  check((await page.evaluate(() => unblock.visibleBlocks().map((b) => b.id).sort().join())) === pinwheel.map((b) => b.id).sort().join(), "a ?board= link shows exactly its blocks");
  for (const [id, x, y] of [["a", 1, 0.5], ["b", 2.5, 1], ["c", 2, 2.5], ["d", 0.5, 2]]) {
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) await gesture([cell(x, y)], [cell(x + dx, y + dy)]);
  }
  check(await page.evaluate(() => unblock.visibleBlocks().every((b) => !b.moved)), "no block of the frozen pinwheel moves, however it is dragged");
  check(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith("unblock-me:"))), "and nothing is stored while a shared board is open");

  // The reports block opens the list of reports, which links back to the game.
  await fresh();
  await fresh();
  await Promise.all([page.waitForURL("**/reports/"), tap(cell(2.5, 0.5))]);
  check(page.url().endsWith("/reports/"), `tapping the reports block opens the report list (${page.url()})`);
  check((await page.textContent("h1")) === "Reports", "which is the report list");
  await Promise.all([page.waitForURL(url), page.click("a.back")]);
  check(await page.evaluate(() => typeof unblock === "object"), "and its back link returns to the game");

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

  // Quick push: a tap slides a block to the end of its room. Row 2, walls at x -2 and 3.
  await place([...UI, Wall(-2, 2), H("a", -1, 2), Wall(3, 2)]);
  await tap(cell(0, 2.5));
  check((await block(page, "a")).x === 1, "a tap slides a free block right (the default mode) to the wall");
  await page.waitForTimeout(450); // the slide is animated
  await expectColor(page, cell(2, 2.5), "moved", "and it is drawn there");
  check(await page.evaluate(() => unblock.scene.circle === null), "a tap on a block does not move the circle");
  await tap(cell(2, 2.5));
  check((await block(page, "a")).x === -1, "against the wall, a tap sends it all the way back");
  await page.waitForTimeout(450);
  // The slide is animated: just after the tap the block is drawn between its old and new cells.
  await tap(cell(0, 2.5)); // right again, animated
  await page.waitForTimeout(60);
  const midway = await colorAt(page, ...cell(0.5, 2.5)); // a cell it passes through
  await page.waitForTimeout(500);
  check(midway === "moved" && (await colorAt(page, ...cell(0.5, 2.5))) === "background", `a tapped block glides over the cells between (${midway} on the way, gone after)`);
  await tap(cell(0.5, -0.5)); // undo that extra push
  await page.waitForTimeout(450);

  // Undo, with the undo block (top row, middle).
  await tap(cell(0.5, -0.5));
  check((await block(page, "a")).x === 1, "the undo block takes back the last move");
  await tap(cell(0.5, -0.5));
  check((await block(page, "a")).x === -1 && !(await block(page, "a")).moved, "and the one before, back to the start");
  // The tap mode block: switch to the nearer end.
  await place([...UI, Wall(-3, 2), H("a", -1, 2), Wall(5, 2)]); // 1 cell of room left, 4 right
  await expectColor(page, cell(1.5, -0.3), "background", "the tap mode switch is on (up/right) by default");
  await tap(cell(1.5, -0.5));
  check(await page.evaluate(() => unblock.scene.tapMode === "nearest"), "tapping the tap mode block switches to the nearer end");
  await expectColor(page, cell(1.5, -0.3), "reset", "and its switch shows off");
  await tap(cell(0, 2.5));
  check((await block(page, "a")).x === -2, "in nearer-end mode a free block goes to the closer wall (left, 1 cell)");
  await tap(cell(-1.5, -3));
  await expectColor(page, cell(-1.5, -3), "circle", "a tap on the background puts the circle there");

  // The ease block opens a list of eases, each a name and a graph; picking one is stored.
  await fresh();
  await tap(cell(2.5, -0.5));
  const menu = await page.evaluate(() => {
    const m = document.querySelector("#eases");
    return { shown: getComputedStyle(m).display === "block", rows: [...m.querySelectorAll("button")].map((b) => [b.textContent, !!b.querySelector("svg polyline"), b.getAttribute("aria-pressed")]) };
  });
  check(menu.shown && menu.rows.length >= 8 && menu.rows.every(([name, graph]) => name && graph), `the ease block opens a list of ${menu.rows.length} eases, each a name and a graph`);
  check(menu.rows.find(([, , on]) => on === "true")?.[0] === "Ease out cubic", "ease out cubic is picked by default");
  await page.screenshot({ path: shots + "phone-5b-eases.png" });
  await page.waitForTimeout(400); // the list ignores clicks right after it opens
  await page.click("#eases button:nth-child(1)");
  check(await page.evaluate(() => getComputedStyle(document.querySelector("#eases")).display === "none" && localStorage.getItem("unblock-me:ease") === '"Linear"'), "picking Linear closes the list and stores it");

  // Its slider sets the speed: dragging the knob from the middle (1x) to the right end is 4x.
  const easeKnob = [cell(2 + 0.24, 0)[0] + 0.52 * UNIT * 0.5, cell(0, -1 + 0.7)[1]];
  await gesture([easeKnob], [[easeKnob[0] + 40, easeKnob[1]]]);
  check(await page.evaluate(() => localStorage.getItem("unblock-me:speed") === "4"), `dragging the ease block's knob right sets 4x speed (${await page.evaluate(() => localStorage.getItem("unblock-me:speed"))})`);
  check(await page.evaluate(() => getComputedStyle(document.querySelector("#eases")).display === "none"), "and does not open the list");

  // The goal: a red block and a dashed red target, made by the worker; solving fills it in.
  await fresh();
  await page.evaluate(() => unblock.goalReady());
  const goal = await page.evaluate(() => unblock.scene.goal);
  check(goal && goal.solution.length > 0, `a goal arrives from the worker (red block ${goal?.id}, ${goal?.solution.length} moves)`);
  const red = await block(page, goal.id);
  if (red) await expectColor(page, cell(red.x + 0.25, red.y + 0.5), "goal", "the goal block is red");
  await page.screenshot({ path: shots + "phone-6-goal.png" });
  // Solve one on an exact board: tap the red block to push it onto its target.
  // Row 2, walls at x -4 and 3: r (x -3..-2) can go right to x 1, where the target is.
  await place([...UI, Wall(-4, 2), H("r", -3, 2), Wall(3, 2)], { id: "r", target: { x: 1, y: 2 }, solution: [] });
  // The outline is dashed: some points down its left edge are red.
  const edge = [];
  for (let y = 2.1; y < 2.9; y += 0.1) edge.push(await colorAt(page, cell(1, 0)[0] + 3, cell(0, y)[1]));
  check(edge.filter((c) => c === "goal").length >= 3 && edge.includes("background"), `the target has a dashed red outline (${edge.join(" ")})`);
  await tap(cell(-2, 2.5));
  check((await block(page, "r")).x === 1, "a tap pushes the red block onto its target");
  // The check's corner point, a little left of and below the block's middle.
  await expectColor(page, [cell(2, 2.5)[0] - 2.5, cell(2, 2.5)[1] + 6], "background", "and a white check shows it is solved");
  await page.screenshot({ path: shots + "phone-7-solved.png" });

  // The home block goes to the homepage (here the test server's root).
  const home = page.waitForEvent("load", { timeout: 5000 }).then(() => true, () => false);
  await tap(cell(-0.5, -0.5));
  check(await home && new URL(page.url()).pathname === "/", `the home block opens the homepage (${page.url()})`);

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
  // Hovering a UI block explains it.
  await page.evaluate(() => unblock.place([{ id: "tapmode", x: 1, y: -1, w: 1, h: 1, ui: "tapmode" }]));
  await frame(page);
  await page.mouse.move(...at(1.5, -0.5));
  const tipText = await page.evaluate(() => getComputedStyle(document.querySelector("#tip")).display === "block" && document.querySelector("#tip").textContent);
  check(typeof tipText === "string" && tipText.includes("up (vertical blocks) or right"), `hovering the tap mode block shows what it does ("${tipText}")`);
  await page.screenshot({ path: shots + "desktop-tooltip.png" });
  await page.mouse.move(...at(4, 3));
  check(await page.evaluate(() => getComputedStyle(document.querySelector("#tip")).display === "none"), "and the tooltip goes away off the block");
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await frame(page);
  check((await page.evaluate(() => unblock.scene.camera.scale)) > 1.5, "wheel zooms in");
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
