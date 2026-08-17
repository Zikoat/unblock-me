import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function runControlStyleVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4325;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-control-style-")) : undefined;
  let browser;
  try {
    const url = `http://127.0.0.1:${port}/app/`;
    await waitForServer(url);
    await access(edge);
    browser = await chromium.launch({ executablePath: edge, headless: true });
    const context = await browser.newContext({
      viewport: { width: 900, height: 900 },
      recordVideo: videoDir ? { dir: videoDir, size: { width: 900, height: 900 } } : undefined,
    });
    const page = await context.newPage();
    const browserErrors = collectBrowserErrors(page);
    const video = page.video();
    const screenshots = videoDir ? screenshotSet(videoDir) : [];
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await pause(page, humanPace, 600);

    const affordances = await page.evaluate(() => {
      const badge = getComputedStyle(document.querySelector("#moves"));
      const button = getComputedStyle(document.querySelector("[data-action='new-level']"));
      return {
        badge: { background: badge.backgroundImage, cursor: badge.cursor, shadow: badge.boxShadow },
        button: { background: button.backgroundImage, cursor: button.cursor, shadow: button.boxShadow },
      };
    });
    assert(affordances.badge.cursor === "default", `Badge looked interactive: ${JSON.stringify(affordances)}.`);
    assert(affordances.button.cursor === "pointer", `Button lacked a pointer affordance: ${JSON.stringify(affordances)}.`);
    assert(affordances.badge.background === "none" && affordances.button.background !== "none", "Badge and button backgrounds were not distinct.");
    assert(affordances.badge.shadow === "none" && affordances.button.shadow !== "none", "Badge and button elevation was not distinct.");

    await page.locator("[data-rating='up']").click();
    if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });
    const fixed = await normalizedBlockMetrics(page, ".block");

    await page.evaluate(() => {
      Math.random = () => 3.5 / 4_000_000_000;
    });
    await page.locator("[data-action='new-level']").click();
    await page.waitForFunction(() => document.querySelector("#board")?.dataset.width === "10");
    await pause(page, humanPace, 650);
    const generated = await normalizedBlockMetrics(page, ".block");
    assertMetricsMatch(fixed, generated, "7-column and 10-column Play boards");
    if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });

    const frame = await page.locator("#board-frame").boundingBox();
    if (!frame) throw new Error("Board frame is missing.");
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    for (let step = 0; step < 3; step += 1) {
      await page.mouse.wheel(0, -120);
      await pause(page, humanPace, 180);
    }
    assert((await page.locator("#zoom").textContent()) === "130% zoom", "Wheel zoom did not reach 130%.");
    const zoomed = await normalizedBlockMetrics(page, ".block");
    assertMetricsMatch(generated, zoomed, "100% and 130% zoom");

    await page.locator("[data-mode='world']").click();
    await pause(page, humanPace, 650);
    const world = await normalizedBlockMetrics(page, ".world-block");
    assertMetricsMatch(generated, world, "Play and World block renderers");
    if (screenshots[2]) await page.screenshot({ path: screenshots[2].path, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await pause(page, humanPace, 600);
    const phone = await normalizedBlockMetrics(page, ".world-block");
    assertMetricsMatch(world, phone, "desktop and phone widths");
    if (screenshots[3]) await page.screenshot({ path: screenshots[3].path, fullPage: true });

    assert(browserErrors.length === 0, `Browser emitted errors: ${JSON.stringify(browserErrors)}.`);
    await context.close();
    return { affordances, metrics: { fixed, generated, zoomed, world, phone }, screenshots, videoPath: video ? await video.path() : undefined, videoDir };
  } catch (error) {
    if (videoDir) await rm(videoDir, { recursive: true, force: true });
    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
}

async function normalizedBlockMetrics(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const block = getComputedStyle(element);
    const board = getComputedStyle(document.querySelector("#board"));
    const cellSize = Number.parseFloat(board.getPropertyValue("--cell-size"));
    return {
      inset: Number.parseFloat(block.marginLeft) / cellSize,
      radius: Number.parseFloat(block.borderTopLeftRadius) / cellSize,
      font: Number.parseFloat(block.fontSize) / cellSize,
      shadow: Number.parseFloat(block.boxShadow.match(/rgba?\([^)]+\)\s+[-\d.]+px\s+([-\d.]+)px/)?.[1] ?? "0") / cellSize,
    };
  });
}

function assertMetricsMatch(left, right, label) {
  for (const key of ["inset", "radius", "font", "shadow"]) {
    assert(Math.abs(left[key] - right[key]) < 0.006, `${label} changed ${key}: ${JSON.stringify({ left, right })}.`);
  }
}

function screenshotSet(directory) {
  return [
    ["Controls and labels", "Raised pressable controls are distinct from flat informational labels", "issue25-controls.png"],
    ["Large generated board", "A 10-column generated board retains the same block proportions", "issue25-generated.png"],
    ["Zoomed World blocks", "World blocks share Play styling and remain proportional at 130% zoom", "issue25-world.png"],
    ["Phone viewport", "The same block styling remains readable on a phone-sized viewport", "issue25-phone.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
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
  const result = await runControlStyleVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Control affordances and scale-consistent block geometry verified.");
}
