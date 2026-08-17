import { access, mkdtemp } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function runZoomVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4319;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-zoom-")) : undefined;
  let browser;
  try {
    const url = `http://127.0.0.1:${port}/app/`;
    await waitForServer(url);
    await access(edge);
    browser = await chromium.launch({ executablePath: edge, headless: true });
    const desktop = await desktopFlow(browser, url, videoDir, humanPace);
    const mobile = await mobileFlow(browser, url, videoDir, humanPace);
    return {
      desktopVideoPath: desktop.videoPath,
      mobileVideoPath: mobile.videoPath,
      screenshots: [...desktop.screenshots, ...mobile.screenshots],
      videoDir,
    };
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function desktopFlow(browser, url, videoDir, humanPace) {
  const context = await browser.newContext({
    viewport: { width: 900, height: 760 },
    recordVideo: videoDir ? { dir: videoDir, size: { width: 900, height: 760 } } : undefined,
  });
  const page = await context.newPage();
  const browserErrors = collectBrowserErrors(page);
  const video = page.video();
  const screenshots = videoDir ? screenshotPair(videoDir, "desktop", "map") : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-mode='world']").click();
  await pause(page, humanPace, 500);
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const frame = await page.locator("#board-frame").boundingBox();
  if (!frame) throw new Error("Board frame is missing.");
  const cameraBefore = cameraPosition(await page.locator("#moves").textContent());
  const x = frame.x + frame.width / 2;
  const y = frame.y + frame.height / 2;
  const hitTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { className: element?.className, tagName: element?.tagName };
  }, { x, y });
  assert(hitTarget.className, `Desktop map center had no interactive target: ${JSON.stringify(hitTarget)}.`);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(x + 110 * step / 10, y + 75 * step / 10);
    await pause(page, humanPace, 70);
  }
  const cameraDuringDrag = cameraPosition(await page.locator("#moves").textContent());
  assert(
    cameraDuringDrag.x !== cameraBefore.x && cameraDuringDrag.y !== cameraBefore.y,
    `Desktop drag did not continuously pan both axes before release: ${JSON.stringify({ cameraBefore, cameraDuringDrag, browserErrors, hitTarget })}.`,
  );
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await page.mouse.up();
  await pause(page, humanPace, 500);
  await page.mouse.move(x, y);
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, -120);
    await pause(page, humanPace, 180);
  }
  assert((await page.locator("#zoom").textContent()) === "140% zoom", "Desktop wheel did not reach 140% zoom.");
  assert(browserErrors.length === 0, `Desktop browser emitted errors: ${JSON.stringify(browserErrors)}.`);
  if (screenshots[2]) await page.screenshot({ path: screenshots[2].path, fullPage: true });
  await pause(page, humanPace, 700);
  await context.close();
  return { screenshots, videoPath: video ? await video.path() : undefined };
}

async function mobileFlow(browser, url, videoDir, humanPace) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 760 } } : undefined,
  });
  const page = await context.newPage();
  const browserErrors = collectBrowserErrors(page);
  const video = page.video();
  const screenshots = videoDir ? screenshotPair(videoDir, "phone", "map") : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-mode='world']").tap();
  await pause(page, humanPace, 500);
  const frame = await page.locator("#board-frame").boundingBox();
  if (!frame) throw new Error("Phone board geometry is missing.");
  const cameraBefore = cameraPosition(await page.locator("#moves").textContent());
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const session = await context.newCDPSession(page);
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const first = { x: center.x - 90, y: center.y, id: 1 };
  const second = { x: center.x + 90, y: center.y, id: 2 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { ...first, x: first.x + 85 * step / 8, y: first.y + 30 * step / 8 },
        { ...second, x: second.x - 5 * step / 8, y: second.y + 30 * step / 8 },
      ],
    });
    await pause(page, humanPace, 70);
  }
  const cameraDuringGesture = cameraPosition(await page.locator("#moves").textContent());
  assert(cameraDuringGesture.x !== cameraBefore.x && cameraDuringGesture.y !== cameraBefore.y, "Phone pinch did not pan both axes.");
  assert((await page.locator("#zoom").textContent()) !== "100% zoom", "Phone pinch did not zoom.");
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const boardBox = await page.locator("#board").boundingBox();
  if (!boardBox) throw new Error("World map is missing.");
  assert(
    boardBox.x <= frame.x && boardBox.y <= frame.y
      && boardBox.x + boardBox.width >= frame.x + frame.width
      && boardBox.y + boardBox.height >= frame.y + frame.height,
    "Zooming out exposed a World map edge.",
  );
  assert(browserErrors.length === 0, `Phone browser emitted errors: ${JSON.stringify(browserErrors)}.`);
  if (screenshots[2]) await page.screenshot({ path: screenshots[2].path, fullPage: true });
  await pause(page, humanPace, 700);
  await context.close();
  return { screenshots, videoPath: video ? await video.path() : undefined };
}

function screenshotPair(directory, device, gesture) {
  return [
    [`${device} — before ${gesture} gesture`, `World map before ${gesture} gesture`, `issue13-${device}-before.png`],
    [`${device} — gesture still held`, `World map panned diagonally before pointer release`, `issue13-${device}-held.png`],
    [`${device} — completed ${gesture} gesture`, `World map after combined pan and zoom`, `issue13-${device}-after.png`],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

function cameraPosition(text) {
  const match = text?.match(/^Camera (-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
  if (!match) throw new Error(`Could not read camera position from ${JSON.stringify(text)}.`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Web server did not start.");
}

function pause(page, enabled, milliseconds) {
  return enabled ? page.waitForTimeout(milliseconds) : Promise.resolve();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runZoomVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Continuous diagonal pan and combined phone pinch-pan verified.");
}
