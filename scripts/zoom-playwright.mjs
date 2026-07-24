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
    const url = `http://127.0.0.1:${port}`;
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
  const video = page.video();
  const screenshots = videoDir ? screenshotPair(videoDir, "desktop", "wheel") : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const redBefore = await blockPosition(page, "R");
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const frame = await page.locator("#board-frame").boundingBox();
  if (!frame) throw new Error("Board frame is missing.");
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  for (let index = 0; index < 4; index += 1) await page.mouse.wheel(0, -120);
  assert((await page.locator("#zoom").textContent()) === "140% zoom", "Desktop wheel did not reach 140% zoom.");
  assert((await page.locator("#moves").textContent()) === "0 moves", "Wheel zoom committed a Block move.");
  assert(JSON.stringify(await blockPosition(page, "R")) === JSON.stringify(redBefore), "Wheel zoom changed Red Block coordinates.");
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
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
  const video = page.video();
  const screenshots = videoDir ? screenshotPair(videoDir, "phone", "pinch") : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const red = await page.locator("[data-block-id='R']").boundingBox();
  const frame = await page.locator("#board-frame").boundingBox();
  if (!red || !frame) throw new Error("Phone board geometry is missing.");
  const redBefore = await blockPosition(page, "R");
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const session = await context.newCDPSession(page);
  const first = { x: red.x + red.width / 2, y: red.y + red.height / 2, id: 1 };
  const second = { x: frame.x + frame.width * 0.75, y: frame.y + frame.height * 0.75, id: 2 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { ...first, x: Math.max(frame.x + 5, first.x - 35) },
      { ...second, x: Math.min(frame.x + frame.width - 5, second.x + 35), y: second.y + 20 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert((await page.locator("#zoom").textContent()) !== "100% zoom", "Phone pinch did not change zoom.");
  assert((await page.locator("#moves").textContent()) === "0 moves", "Pinch beginning on Red committed a Block move.");
  assert(JSON.stringify(await blockPosition(page, "R")) === JSON.stringify(redBefore), "Pinch changed Red Block coordinates.");
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await pause(page, humanPace, 700);
  await context.close();
  return { screenshots, videoPath: video ? await video.path() : undefined };
}

function screenshotPair(directory, device, gesture) {
  return [
    [`${device} — before ${gesture}`, `Board before ${gesture} zoom`, `issue13-${device}-before.png`],
    [`${device} — after ${gesture}`, `Board after ${gesture} zoom`, `issue13-${device}-after.png`],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function blockPosition(page, id) {
  return page.locator(`[data-block-id='${id}']`).evaluate((element) => ({
    x: element.dataset.x,
    y: element.dataset.y,
  }));
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
  else console.log("Wheel and pinch zoom verified without Block movement.");
}
