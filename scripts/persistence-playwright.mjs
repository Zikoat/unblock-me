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
const sessionKey = "unblock-me.browser-session.v1";

export async function runPersistenceVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4320;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-persistence-")) : undefined;
  let browser;
  try {
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(url);
    await access(edge);
    browser = await chromium.launch({ executablePath: edge, headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 760 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 760 } } : undefined,
    });
    const screenshots = videoDir ? screenshotSet(videoDir) : [];

    const beforePage = await context.newPage();
    const beforeVideo = beforePage.video();
    await beforePage.goto(url, { waitUntil: "domcontentloaded" });
    const session = await context.newCDPSession(beforePage);
    await touchDragBlock(beforePage, session, "A", 0, -70);
    assert((await beforePage.locator("#history").textContent()) === "1 recorded move", "Move history was not recorded.");
    await pinchBoard(beforePage, session);
    const zoom = await beforePage.locator("#zoom").textContent();
    assert(zoom !== "100% zoom", "Pinch did not create a zoom value to persist.");

    await touchTap(beforePage, session, "[data-mode='world']");
    const empty = await emptyWorldCell(beforePage);
    await touchDragAt(session, empty.x, empty.y, empty.x - 150, empty.y);
    const camera = await beforePage.locator("#moves").textContent();
    assert(camera !== "Camera 0,0", "World camera did not move before persistence.");

    await touchTap(beforePage, session, "[data-mode='closure']");
    await touchTapByText(beforePage, session, "separator");
    await touchTapByText(beforePage, session, "Run");
    assert((await beforePage.locator("#moves").textContent()) === "separated", "Closure did not reach its persisted outcome.");
    if (screenshots[0]) await beforePage.screenshot({ path: screenshots[0].path, fullPage: true });
    const stored = await beforePage.evaluate((key) => JSON.parse(localStorage.getItem(key)), sessionKey);
    assert(stored.version === 1, "Stored session version is missing.");
    assert(stored.mode === "closure" && stored.zoom > 1, "Mode or zoom is missing from storage.");
    assert(stored.moveHistory.length === 1, "Semantic move history is missing from storage.");
    assert(stored.moveHistory[0].before.blocks[1].y === 1, "Move before-snapshot is not exact.");
    assert(stored.moveHistory[0].after.blocks[1].y === 0, "Move after-snapshot is not exact.");
    assert(stored.worldState.camera.x > 0, "World camera is missing from storage.");
    assert(stored.closureState.status === "separated", "Closure progress is missing from storage.");
    await pause(beforePage, humanPace, 600);
    await beforePage.close();
    const beforeVideoPath = beforeVideo ? await beforeVideo.path() : undefined;

    const afterPage = await context.newPage();
    const afterVideo = afterPage.video();
    await afterPage.goto(url, { waitUntil: "domcontentloaded" });
    assert(await afterPage.locator("[data-mode='closure']").getAttribute("aria-pressed") === "true", "Mode was not restored.");
    assert((await afterPage.locator("#zoom").textContent()) === zoom, "Zoom was not restored.");
    assert((await afterPage.locator("#moves").textContent()) === "separated", "Closure outcome was not restored.");
    if (screenshots[1]) await afterPage.screenshot({ path: screenshots[1].path, fullPage: true });

    await afterPage.locator("[data-mode='world']").click();
    assert((await afterPage.locator("#moves").textContent()) === camera, "World camera was not restored.");
    await afterPage.locator("[data-mode='play']").click();
    assert((await afterPage.locator("#moves").textContent()) === "1 move", "Play move count was not restored.");
    assert((await afterPage.locator("#history").textContent()) === "1 recorded move", "Semantic history count was not restored.");
    assert(await afterPage.locator("[data-block-id='A']").getAttribute("data-y") === "0", "Exact Block position was not restored.");
    if (screenshots[2]) await afterPage.screenshot({ path: screenshots[2].path, fullPage: true });
    await pause(afterPage, humanPace, 600);
    await afterPage.close();
    const afterVideoPath = afterVideo ? await afterVideo.path() : undefined;
    await context.close();
    return { beforeVideoPath, afterVideoPath, screenshots, videoDir };
  } finally {
    await browser?.close();
    server.kill();
  }
}

function screenshotSet(directory) {
  return [
    ["Before page close", "Closure mode, zoom, and prior interactions before closing the page", "issue14-before-close.png"],
    ["After page reopen", "Closure mode and zoom restored in a newly opened page", "issue14-after-reopen.png"],
    ["Exact Play state restored", "Moved Block position and semantic move count after reopening", "issue14-play-restored.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function pinchBoard(page, session) {
  const red = await page.locator("[data-block-id='R']").boundingBox();
  const frame = await page.locator("#board-frame").boundingBox();
  if (!red || !frame) throw new Error("Board geometry is unavailable.");
  const first = { x: red.x + red.width / 2, y: red.y + red.height / 2, id: 8 };
  const second = { x: frame.x + frame.width * 0.75, y: frame.y + frame.height * 0.75, id: 9 };
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first, second] });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...first, x: first.x - 30 }, { ...second, x: second.x + 30 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function touchDragBlock(page, session, id, dx, dy) {
  const box = await page.locator(`[data-block-id='${id}']`).boundingBox();
  if (!box) throw new Error(`Block ${id} is missing.`);
  await touchDragAt(session, box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

async function emptyWorldCell(page) {
  const point = await page.locator(".cell").evaluateAll((cells) => {
    const occupied = new Set([...document.querySelectorAll("[data-world-block]")].map((node) => `${node.dataset.worldX},${node.dataset.worldY}`));
    const frame = document.querySelector("#board-frame")?.getBoundingClientRect();
    const cell = cells.find((candidate) => {
      if (occupied.has(`${candidate.dataset.worldX},${candidate.dataset.worldY}`) || !frame) return false;
      const box = candidate.getBoundingClientRect();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      return centerX > frame.left && centerX < frame.right && centerY > frame.top && centerY < frame.bottom;
    });
    if (!cell) return undefined;
    const box = cell.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  if (!point) throw new Error("No empty World cell.");
  return point;
}

async function touchDragAt(session, startX, startY, endX, endY) {
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY, id: 5 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: endX, y: endY, id: 5 }] });
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
  const result = await runPersistenceVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Exact Play, World, Closure, camera, mode, zoom, and move history restored after page reopen.");
}
