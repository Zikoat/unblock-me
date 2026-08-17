import { access, mkdtemp } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const browserCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export async function runWorldModesVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4318;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-world-modes-")) : undefined;
  let browser;
  try {
    const url = `http://127.0.0.1:${port}/app/`;
    await waitForServer(url);
    browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
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
  const screenshots = videoDir ? desktopScreenshots(videoDir) : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("[data-mode='world']").click();
  assert(await page.locator(".cell").count() === 100, "World mode must render exactly 100 Viewport cells.");
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });

  const empty = await emptyWorldCell(page);
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x - 190, empty.y - 70, { steps: 10 });
  await page.mouse.up();
  assert((await page.locator("#moves").textContent()) !== "Camera 0,0", "Mouse drag did not pan the World.");
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await pause(page, humanPace, 500);

  await page.locator("[data-mode='closure']").click();
  for (const [scenario, expected, screenshotIndex] of [
    ["natural", "closed", 2],
    ["runaway", "capped", 3],
    ["separator", "separated", 4],
  ]) {
    await page.getByRole("button", { name: scenario, exact: true }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    assert((await page.locator("#moves").textContent()) === expected, `${scenario} did not stop as ${expected}.`);
    if (screenshots[screenshotIndex]) await page.screenshot({ path: screenshots[screenshotIndex].path, fullPage: true });
    await pause(page, humanPace, 450);
  }
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
  const screenshots = videoDir ? mobileScreenshots(videoDir) : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const session = await context.newCDPSession(page);
  await touchTap(page, session, "[data-mode='world']");
  const empty = await emptyWorldCell(page);
  await touchDragAt(session, empty.x, empty.y, empty.x - 150, empty.y - 40);
  assert((await page.locator("#moves").textContent()) !== "Camera 0,0", "Phone drag did not pan the World.");
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  await pause(page, humanPace, 500);

  await touchTap(page, session, "[data-mode='closure']");
  await touchTapByText(page, session, "separator");
  await touchTapByText(page, session, "Run");
  assert((await page.locator("#moves").textContent()) === "separated", "Phone Closure did not reach separator.");
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await pause(page, humanPace, 500);
  await context.close();
  return { screenshots, videoPath: video ? await video.path() : undefined };
}

function desktopScreenshots(directory) {
  return [
    ["World — initial Viewport", "The initial generated 10 by 10 Viewport", "issue12-world-initial.png"],
    ["World — after empty-space pan", "A panned Viewport with newly committed content", "issue12-world-panned.png"],
    ["Closure — natural", "Natural dependency closure ended at clear committed space", "issue12-closure-natural.png"],
    ["Closure — runaway", "Runaway dependency closure stopped at the safety cap", "issue12-closure-runaway.png"],
    ["Closure — separator", "Dependency closure stopped at an immovable separator", "issue12-closure-separator.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

function mobileScreenshots(directory) {
  return [
    ["Phone — World pan", "Phone World Viewport after an empty-space drag", "issue12-phone-world.png"],
    ["Phone — Closure", "Phone separator outcome in Dependency closure mode", "issue12-phone-closure.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function emptyWorldCell(page) {
  const point = await page.locator(".cell").evaluateAll((cells) => {
    const occupied = new Set(
      [...document.querySelectorAll("[data-world-block]")]
        .map((node) => `${node.dataset.worldX},${node.dataset.worldY}`),
    );
    const cell = cells.find((candidate) => !occupied.has(`${candidate.dataset.worldX},${candidate.dataset.worldY}`));
    if (!cell) return undefined;
    const box = cell.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  if (!point) throw new Error("No empty World cell is available for panning.");
  return point;
}

async function touchDragAt(session, startX, startY, endX, endY) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY, id: 5 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: endX, y: endY, id: 5 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function touchTap(page, session, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Could not find ${selector}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function touchTapByText(page, session, label) {
  const selector = await page.getByRole("button", { name: label, exact: true }).evaluate((element) => {
    element.dataset.playwrightTap = "true";
    return "[data-playwright-tap='true']";
  });
  await touchTap(page, session, selector);
}

async function browserPath() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error("No installed Chromium browser found.");
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      // Server is still starting.
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
  const result = await runWorldModesVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("World and Closure modes verified with desktop mouse and phone touch.");
}
