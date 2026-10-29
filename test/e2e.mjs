// Drives the built app in Chromium with real touch and mouse input and checks what is
// drawn by sampling canvas pixels. Run with `bun run e2e`; screenshots go to test/screenshots.
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

const COLORS = { background: [243, 242, 238], dot: [211, 209, 202], square: [79, 109, 143], dragging: [224, 130, 61], circle: [214, 69, 69] };
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

async function colorAt(page, x, y) {
  const rgb = await page.evaluate(([x, y]) => {
    const c = document.querySelector("canvas");
    const d = c.width / c.clientWidth;
    return [...c.getContext("2d").getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data.slice(0, 3)];
  }, [x, y]);
  const [name] = Object.entries(COLORS)
    .map(([n, c]) => [n, Math.hypot(...c.map((v, i) => v - rgb[i]))])
    .sort((a, b) => a[1] - b[1])[0];
  return name === "dot" ? "background" : name;
}
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const expectColor = async (page, x, y, want, what) => {
  await frame(page);
  const got = await colorAt(page, x, y);
  check(got === want, `${what}: (${x},${y}) is ${got}${got === want ? "" : `, want ${want}`}`);
};

const browser = await chromium.launch();

// --- Phone: 400x800 CSS px at 2x, touch only. World (0,0) starts at the screen centre,
// so square 1 covers (240..330, 280..370) and square 2 covers (80..170, 460..550).
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
      const t = i / steps;
      await touch("touchMove", from.map(([x, y], f) => [x + (to[f][0] - x) * t, y + (to[f][1] - y) * t]));
      if (i === Math.floor(steps / 2) && during) await during(from.map(([x, y], f) => [x + (to[f][0] - x) * t, y + (to[f][1] - y) * t]));
    }
    await touch("touchEnd", []);
  }
  const fresh = async () => { await page.goto(url); await frame(page); };

  await fresh();
  check((await page.evaluate(() => document.body.innerText.trim())) === "", "no text in the UI");
  check((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), "no horizontal scroll");
  await expectColor(page, 285, 325, "square", "square 1 drawn");
  await expectColor(page, 125, 505, "square", "square 2 drawn");
  await page.screenshot({ path: shots + "phone-1-start.png" });

  await gesture([[100, 300]], [[103, 302]], { steps: 2 }); // a tap with a little finger wobble
  await expectColor(page, 100, 300, "circle", "tap puts the circle under the finger");
  await gesture([[300, 650]], [[300, 650]], { steps: 1 });
  await expectColor(page, 300, 650, "circle", "second tap moves the circle");
  await expectColor(page, 100, 300, "background", "old circle spot is cleared");
  await gesture([[285, 325]], [[285, 325]], { steps: 1 });
  await expectColor(page, 285, 325, "circle", "tap on a square also moves the circle");
  await page.screenshot({ path: shots + "phone-2-tapped.png" });

  await fresh();
  await gesture([[100, 150]], [[160, 200]]);
  await expectColor(page, 380, 410, "square", "background drag pans: square 1 followed the finger");
  await expectColor(page, 245, 285, "background", "background drag pans: old square 1 corner is empty");
  await expectColor(page, 160, 200, "background", "a pan does not place the circle");

  await fresh();
  let midDrag = null;
  await gesture([[125, 505]], [[325, 205]], {
    during: async ([[x, y]]) => { await frame(page); midDrag = await colorAt(page, x, y); await page.screenshot({ path: shots + "phone-3-dragging.png" }); },
  });
  check(midDrag === "dragging", `square changes colour while dragged (${midDrag})`);
  await expectColor(page, 325, 205, "square", "dropped square is back to the normal colour at the drop point");
  await expectColor(page, 125, 505, "background", "dragged square left its old spot");
  await expectColor(page, 285, 325, "square", "the camera did not move during a square drag");
  await page.screenshot({ path: shots + "phone-4-dropped.png" });

  await fresh();
  // Fingers spread to twice the distance around the screen centre: 2x zoom there.
  // Square 1 (world 40..130, -120..-30) then covers x 280..460, y 160..340.
  await gesture([[150, 400], [250, 400]], [[100, 400], [300, 400]]);
  await expectColor(page, 290, 170, "square", "pinch zooms: square 1 grew towards the corner");
  await expectColor(page, 275, 170, "background", "pinch zooms: left of the zoomed square is empty");
  await expectColor(page, 150, 400, "background", "a pinch does not place the circle");
  await page.screenshot({ path: shots + "phone-5-pinched.png" });

  await fresh();
  // Spread and move both fingers down 100 px at once: zoom and pan together.
  await gesture([[150, 400], [250, 400]], [[100, 500], [300, 500]]);
  await expectColor(page, 290, 270, "square", "pinch also pans: square 1 moved down with the fingers");
  await expectColor(page, 290, 255, "background", "pinch also pans: above it is empty");
  await page.screenshot({ path: shots + "phone-6-pinch-pan.png" });

  await fresh();
  // Lift one finger mid-pinch and keep moving the other: it pans, no tap.
  await touch("touchStart", [[150, 400], [250, 400]]);
  await touch("touchEnd", [[250, 400]].map(([x, y]) => [x, y])); // finger 0 lifts
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 280, y: 420, id: 1 }] });
  await touch("touchEnd", []);
  await expectColor(page, 315, 345, "square", "remaining finger pans after a pinch");
  await expectColor(page, 280, 420, "background", "lifting a pinch finger is not a tap");
  await context.close();
}

// --- Desktop: mouse and wheel.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await frame(page);
  // World (0,0) at (640,400): square 1 covers (680..770, 280..370).
  await page.mouse.click(300, 600);
  await expectColor(page, 300, 600, "circle", "mouse click places the circle");
  await page.mouse.move(725, 325);
  await page.mouse.down();
  await page.mouse.move(800, 325, { steps: 8 });
  await expectColor(page, 800, 325, "dragging", "mouse drag colours the square");
  await page.mouse.move(900, 325, { steps: 8 });
  await page.mouse.up();
  await expectColor(page, 900, 325, "square", "mouse drag drops the square");
  await expectColor(page, 300, 600, "circle", "a square drag leaves the circle alone");
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(150, 100, { steps: 8 });
  await page.mouse.up();
  await expectColor(page, 350, 600, "circle", "mouse drag on the background pans everything");
  await page.mouse.move(350, 600);
  await page.mouse.wheel(0, -400); // zoom in around the cursor
  await expectColor(page, 350, 600, "circle", "wheel zoom keeps the point under the cursor");
  // exp(0.8) ≈ 2.23x around (350,600): square 2 (570..660, 460..550) grows to x 840..1040, y 288..489.
  await expectColor(page, 1035, 480, "square", "wheel zoom grew square 2 away from the cursor");
  await expectColor(page, 1045, 480, "background", "wheel zoom: right of square 2 is empty");
  await page.screenshot({ path: shots + "desktop-zoomed.png" });
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
