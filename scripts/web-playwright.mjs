import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export async function runWebVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4317;
  const server = spawn("bun", ["src/web/server.ts"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-web-video-")) : undefined;
  let browser;
  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    browser = await chromium.launch({ executablePath: await browserPath(), headless: true });
    const desktop = await desktopFlow(browser, `http://127.0.0.1:${port}`, videoDir, humanPace);
    const mobile = await mobileFlow(browser, `http://127.0.0.1:${port}`, videoDir, humanPace);
    return {
      desktopVideoPath: desktop.videoPath,
      mobileVideoPath: mobile.videoPath,
      generatedSeed: mobile.seed,
      screenshots: [...desktop.screenshots, ...mobile.screenshots],
      videoDir,
    };
  } catch (error) {
    if (videoDir) await rm(videoDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function desktopFlow(browser, url, videoDir, humanPace) {
  const context = await browser.newContext({ viewport: { width: 900, height: 760 }, recordVideo: videoDir ? { dir: videoDir, size: { width: 900, height: 760 } } : undefined });
  const page = await context.newPage();
  const video = page.video();
  const screenshots = videoDir ? screenshotSet(videoDir) : undefined;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (screenshots) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const checkpointBefore = await checkpointPositions(page);
  assert(checkpointBefore[1].x - checkpointBefore[0].x < checkpointBefore[0].width * 1.2, "Checkpoint cells are not adjacent at their engine coordinates.");
  await assertCanceledPreview(page, screenshots);
  await solveWithMouse(page, humanPace);
  const checkpointAfter = await checkpointPositions(page);
  assert(JSON.stringify(checkpointAfter) === JSON.stringify(checkpointBefore), `Checkpoint moved while blocks moved: ${JSON.stringify({ checkpointBefore, checkpointAfter })}.`);
  assert((await page.locator("#win").textContent())?.includes("you win"), "Desktop mouse drag did not reach the Checkpoint.");
  if (screenshots) await page.screenshot({ path: screenshots[3].path, fullPage: true });
  await page.locator("[data-action='new-level']").click();
  await page.waitForTimeout(100);
  if (screenshots) await page.screenshot({ path: screenshots[4].path, fullPage: true });
  if (screenshots) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await addParityPanel(page);
    await page.screenshot({ path: screenshots[5].path, fullPage: true });
  }
  await pause(page, humanPace, 600);
  await context.close();
  return { videoPath: video ? await video.path() : undefined, screenshots: screenshots ?? [] };
}

async function mobileFlow(browser, url, videoDir, humanPace) {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 760 } } : undefined });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const video = page.video();
  const screenshots = videoDir ? mobileScreenshotSet(videoDir) : [];
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await assertSquareCells(page);
  await assertConnectedCheckpoint(page);
  if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
  const session = await context.newCDPSession(page);
  await solveWithTouch(page, session, humanPace);
  assert((await page.locator("#win").textContent())?.includes("you win"), "Mobile touch drag did not reach the Checkpoint.");
  await touchTap(page, session, "[data-action='new-level']");
  await page.waitForTimeout(350);
  const seed = await page.locator("#seed").textContent() ?? "";
  assert(/^Seed \d+$/.test(seed), `Mobile touch tap did not create a generated level (got ${JSON.stringify(seed)}; errors ${JSON.stringify(errors)}).`);
  await assertSquareCells(page);
  await assertConnectedCheckpoint(page);
  if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
  await pause(page, humanPace, 600);
  await context.close();
  return { videoPath: video ? await video.path() : undefined, seed, screenshots };
}

async function solveWithMouse(page, humanPace) {
  await mouseDrag(page, "A", 0, -70, humanPace);
  await mouseDrag(page, "B", 0, 70, humanPace);
  await mouseDrag(page, "R", 420, 0, humanPace);
}

async function solveWithTouch(page, session, humanPace) {
  await touchDrag(page, session, "A", 0, -70, humanPace);
  await touchDrag(page, session, "B", 0, 70, humanPace);
  await touchDrag(page, session, "R", 300, 0, humanPace);
}

async function assertCanceledPreview(page, screenshots) {
  const locator = page.locator("[data-block-id='A']");
  const originalColor = await locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 35, { steps: 6 });
  assert(await locator.getAttribute("data-drag-preview") === "true", "Half drag did not expose an in-progress preview.");
  const previewBox = await locator.boundingBox();
  assert(previewBox.y < box.y - 20, `Half drag did not visually follow the pointer: ${JSON.stringify({ box, previewBox })}.`);
  assert((await page.locator("#moves").textContent()) === "0 moves", "Half drag committed engine state before release.");
  if (screenshots) {
    await page.screenshot({ path: screenshots[1].path, fullPage: true });
    await assertScreenshotHasDetail(screenshots[1].path);
  }
  await locator.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert(await locator.getAttribute("data-drag-preview") !== "true", "Canceled drag left its preview active.");
  const restoredBox = await locator.boundingBox();
  assert(Math.abs(restoredBox.x - box.x) < 1 && Math.abs(restoredBox.y - box.y) < 1, `Canceled drag did not restore its visual position: ${JSON.stringify({ box, restoredBox })}.`);
  const restoredColor = await locator.evaluate((element) => getComputedStyle(element).backgroundColor);
  assert(restoredColor === originalColor, `Canceled drag changed the block's visual color: ${JSON.stringify({ originalColor, restoredColor })}.`);
  assert((await page.locator("#moves").textContent()) === "0 moves", "Canceled drag committed engine state.");
  if (screenshots) await page.screenshot({ path: screenshots[2].path, fullPage: true });
}

function screenshotSet(directory) {
  return [
    ["Initial board", "The fixed board before interaction", "initial-board.png"],
    ["Half drag in progress", "The Red Block following a held pointer between cells", "half-drag.png"],
    ["Canceled drag restored", "The Red Block restored after pointer cancellation", "canceled-drag.png"],
    ["Completed multi-cell drag", "One drag completed the Red Block's five-cell move", "completed-drag.png"],
    ["Generated level", "A level with randomized dimensions, Walls, Checkpoint, and blocks", "generated-level.png"],
    ["Terminal/web parity", "The web board beside its terminal occupancy projection", "terminal-web-parity.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

function mobileScreenshotSet(directory) {
  return [
    ["Phone square-cell board", "Uniform square cells and a connected Checkpoint on a phone viewport", "phone-square-board.png"],
    ["Phone generated board", "A generated level retaining square cells and a connected Checkpoint", "phone-generated-board.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function addParityPanel(page) {
  await page.evaluate(() => {
    const board = document.querySelector("#board");
    const width = Number(board.dataset.width);
    const height = Number(board.dataset.height);
    const matrix = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
    for (const cell of board.querySelectorAll(".cell")) {
      const x = Number(cell.dataset.x); const y = Number(cell.dataset.y);
      matrix[y][x] = cell.dataset.kind === "wall" ? "#" : cell.dataset.kind === "checkpoint" ? "*" : ".";
    }
    for (const block of board.querySelectorAll(".block")) {
      const x = Number(block.dataset.x); const y = Number(block.dataset.y);
      const blockWidth = Number(block.dataset.width); const blockHeight = Number(block.dataset.height);
      for (let row = 0; row < blockHeight; row += 1) for (let column = 0; column < blockWidth; column += 1) matrix[y + row][x + column] = block.dataset.blockId;
    }
    const panel = document.createElement("section");
    panel.style.cssText = "margin-top:16px;padding:14px;border:1px solid #526178;border-radius:12px;background:#090d14";
    panel.innerHTML = `<strong>Terminal projection from the shared engine state</strong><pre style="font:16px/1.45 monospace;white-space:pre;color:#d8f6e5">${matrix.map((row) => row.join(" ")).join("\n")}</pre>`;
    board.insertAdjacentElement("afterend", panel);
  });
}

async function checkpointPositions(page) {
  return page.locator(".checkpoint").evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) };
  }));
}

async function assertSquareCells(page) {
  const boxes = await page.locator(".cell").evaluateAll((nodes) => nodes.slice(0, 12).map((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  assert(boxes.length > 0, "No board cells were rendered.");
  for (const box of boxes) {
    assert(Math.abs(box.width - box.height) < 1, `Board cell is not square: ${JSON.stringify(box)}.`);
  }
}

async function assertConnectedCheckpoint(page) {
  const boxes = await checkpointPositions(page);
  assert(boxes.length === 2, `Expected a two-cell Checkpoint, got ${JSON.stringify(boxes)}.`);
  const gap = boxes[1].x - (boxes[0].x + boxes[0].width);
  assert(gap <= 1, `Checkpoint cells are visually disconnected by ${gap}px.`);
}

async function mouseDrag(page, id, dx, dy, humanPace) {
  const box = await page.locator(`[data-block-id='${id}']`).boundingBox();
  if (!box) throw new Error(`Could not find block ${id}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
  await pause(page, humanPace, 260);
}

async function touchDrag(page, session, id, dx, dy, humanPace) {
  const box = await page.locator(`[data-block-id='${id}']`).boundingBox();
  if (!box) throw new Error(`Could not find block ${id}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy, id: 1 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(page, humanPace, 260);
}

async function touchTap(page, session, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Could not find ${selector}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function pause(page, humanPace, milliseconds) { if (humanPace) await page.waitForTimeout(milliseconds); }

async function browserPath() {
  for (const candidate of edgeCandidates) { try { await access(candidate); return candidate; } catch { /* next */ } }
  throw new Error("No installed Chromium browser found for Playwright.");
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return; } catch { /* still starting */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Web server did not start.");
}

function assert(condition, message) { if (!condition) throw new Error(message); }

async function assertScreenshotHasDetail(path) {
  const statistics = await sharp(path).stats();
  assert(Math.max(...statistics.channels.slice(0, 3).map((channel) => channel.stdev)) > 8, `Screenshot is visually blank: ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const recordVideo = process.argv.includes("--record");
  const result = await runWebVerification({ recordVideo, humanPace: process.argv.includes("--human") });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log(`Playwright verified desktop mouse drag and mobile touch drag. Generated ${result.generatedSeed}.`);
}
