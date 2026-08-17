import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sessionKey = "unblock-me.browser-session.v1";

export async function runFeedbackVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4321;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-feedback-")) : undefined;
  let browser;
  try {
    const url = `http://127.0.0.1:${port}/app/`;
    await waitForServer(url);
    await access(edge);
    browser = await chromium.launch({ executablePath: edge, headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 844 } } : undefined,
    });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    const video = page.video();
    const screenshots = videoDir ? screenshotSet(videoDir) : [];
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const session = await context.newCDPSession(page);

    await page.locator("#feedback-comment").fill("Interesting before I solved it");
    await touchTap(page, session, "[data-rating='down']");
    const unfinished = await storedSession(page);
    assert(unfinished.feedbackEntries[0]?.comment === "Interesting before I solved it", "Unfinished comment was not stored with its vote.");
    assert(unfinished.feedbackEntries[0]?.solved === false, "Unfinished vote was incorrectly marked solved.");
    if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
    await touchTap(page, session, "[data-action='new-level']");
    assert((await page.locator("#seed").textContent())?.startsWith("Seed "), "Unfinished level could not advance.");

    await page.evaluate((key) => localStorage.removeItem(key), sessionKey);
    await page.reload({ waitUntil: "domcontentloaded" });
    await solveWithTouch(page, session, humanPace);
    assert(await page.locator("#win").isVisible(), "Solved level did not show its win state.");

    await touchTap(page, session, "[data-action='new-level']");
    assert((await page.locator("#seed").textContent()) === "Fixed level", "Solved level advanced without a vote.");
    assert((await page.locator("#status").textContent())?.includes("Choose thumbs"), "Solved progression gate did not explain the required vote.");
    if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });

    await touchDrag(page, session, "A", 0, 50, humanPace);
    const movesAfterWin = Number.parseInt(await page.locator("#moves").textContent() ?? "0", 10);
    assert(movesAfterWin > 7, "Solved level stopped accepting Block movement.");
    assert(await page.locator("#win").isVisible(), "Continued interaction cleared the solved state.");
    await page.locator("#feedback-comment").fill("Good clear finish");
    await touchTap(page, session, "[data-rating='up']");
    const solved = await storedSession(page);
    assert(solved.feedbackEntries[0]?.comment === "Good clear finish", "Solved comment was not stored.");
    assert(solved.feedbackEntries[0]?.rating === "up", "Solved thumbs-up was not stored.");
    assert(solved.feedbackEntries[0]?.solved === true, "Solved vote was not marked solved.");
    if (screenshots[2]) await page.screenshot({ path: screenshots[2].path, fullPage: true });

    await touchTap(page, session, "[data-action='new-level']");
    assert((await page.locator("#seed").textContent())?.startsWith("Seed "), "Vote did not unlock the next level.");
    if (screenshots[3]) await page.screenshot({ path: screenshots[3].path, fullPage: true });
    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors)}.`);
    await pause(humanPace, 600);
    await context.close();
    return { videoPath: video ? await video.path() : undefined, screenshots, videoDir };
  } catch (error) {
    if (videoDir) await rm(videoDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function solveWithTouch(page, session, humanPace) {
  await touchDrag(page, session, "A", 0, -75, humanPace);
  await touchDrag(page, session, "B", 0, 75, humanPace);
  await touchDrag(page, session, "R", 320, 0, humanPace);
}

async function touchDrag(page, session, blockId, dx, dy, humanPace) {
  const box = await page.locator(`[data-block-id='${blockId}']`).boundingBox();
  if (!box) throw new Error(`Missing Block ${blockId}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8, id: 1 }],
    });
    await pause(humanPace, 35);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(humanPace, 250);
}

async function touchTap(page, session, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Missing tappable ${selector}.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(100);
}

async function storedSession(page) {
  return JSON.parse(await page.evaluate((key) => localStorage.getItem(key), sessionKey));
}

function screenshotSet(directory) {
  return [
    ["Unfinished feedback", "Thumbs down and an optional comment saved before solving", "feedback-unfinished.png"],
    ["Solved progression gate", "The solved board remains visible while Next requires a vote", "feedback-gated.png"],
    ["Solved and still interactive", "One more Block move after solving, with thumbs up and a comment saved", "feedback-interactive.png"],
    ["Vote unlocks next", "A new generated level after the solved level received feedback", "feedback-next.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Web server did not start.");
}

async function pause(enabled, milliseconds) {
  if (enabled) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1] === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("/", "\\")) {
  const result = await runFeedbackVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Playwright verified unfinished and solved feedback paths.");
}
