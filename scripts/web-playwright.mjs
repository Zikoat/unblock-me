import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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
    return { desktopVideoPath: desktop, mobileVideoPath: mobile.videoPath, generatedSeed: mobile.seed, videoDir };
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
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await solveWithMouse(page, humanPace);
  assert((await page.locator("#win").textContent())?.includes("you win"), "Desktop mouse drag did not reach the Checkpoint.");
  await pause(page, humanPace, 600);
  await context.close();
  return video ? await video.path() : undefined;
}

async function mobileFlow(browser, url, videoDir, humanPace) {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 760 } } : undefined });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const video = page.video();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const session = await context.newCDPSession(page);
  await solveWithTouch(page, session, humanPace);
  assert((await page.locator("#win").textContent())?.includes("you win"), "Mobile touch drag did not reach the Checkpoint.");
  await touchTap(page, session, "[data-action='new-level']");
  await page.waitForTimeout(350);
  const seed = await page.locator("#seed").textContent() ?? "";
  assert(/^Seed \d+$/.test(seed), `Mobile touch tap did not create a generated level (got ${JSON.stringify(seed)}; errors ${JSON.stringify(errors)}).`);
  await pause(page, humanPace, 600);
  await context.close();
  return { videoPath: video ? await video.path() : undefined, seed };
}

async function solveWithMouse(page, humanPace) {
  await mouseDrag(page, "A", 0, -70, humanPace);
  await mouseDrag(page, "B", 0, 70, humanPace);
  for (let index = 0; index < 5; index += 1) await mouseDrag(page, "R", 70, 0, humanPace);
}

async function solveWithTouch(page, session, humanPace) {
  await touchDrag(page, session, "A", 0, -70, humanPace);
  await touchDrag(page, session, "B", 0, 70, humanPace);
  for (let index = 0; index < 5; index += 1) await touchDrag(page, session, "R", 70, 0, humanPace);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const recordVideo = process.argv.includes("--record");
  const result = await runWebVerification({ recordVideo, humanPace: process.argv.includes("--human") });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log(`Playwright verified desktop mouse drag and mobile touch drag. Generated ${result.generatedSeed}.`);
}
