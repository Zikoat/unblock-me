import { access, mkdtemp, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function runGenerationSettingsVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4322;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-generation-settings-")) : undefined;
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
    const errors = collectBrowserErrors(page);
    const video = page.video();
    const screenshots = videoDir ? screenshotSet(videoDir) : [];
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.locator("[data-action='new-level']").tap();
    await pause(page, humanPace, 600);
    await page.locator("#generation-details summary").tap();
    await pause(page, humanPace, 500);
    const finite = JSON.parse(await page.locator("#generation-record").textContent());
    const definitionKinds = new Set(Object.values(finite.settings)
      .map((setting) => setting?.definition?.kind)
      .filter(Boolean));
    assert(finite.kind === "finite" && finite.tactic === "reverse-scramble", "Finite tactic was not recorded.");
    assert(definitionKinds.has("fixed") && definitionKinds.has("bounded-uniform") && definitionKinds.has("bounded-normal"), "Finite record omitted a distribution kind.");
    assert(finite.settings.boardWidth.sampled === Number(await page.locator("#board").getAttribute("data-width")), "Sampled width does not match the rendered level.");
    assert(finite.settings.blockShapes.length === await page.locator(".block").count(), "Block-shape record does not match rendered Blocks.");
    assertTiming(finite.timing, ["settingsMs", "layoutMs", "scrambleMs"]);
    if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });

    await page.locator("[data-mode='world']").tap();
    await pause(page, humanPace, 600);
    if (!(await page.locator("#generation-details").getAttribute("open"))) {
      await page.locator("#generation-details summary").tap();
    }
    const world = JSON.parse(await page.locator("#generation-record").textContent());
    assert(world.kind === "world" && world.tactic === "viewport-rounded-margin", "World tactic was not recorded.");
    assert(world.settings.viewportWidth.sampled === 10 && world.settings.requestMargin.sampled === 2, "World dimensions or margin are missing.");
    assert(world.settings.movementTypes[0] === "static", "World movement types are missing.");
    assertTiming(world.timing, ["requestCellsMs", "placeBlocksMs"]);
    if (screenshots[1]) await page.screenshot({ path: screenshots[1].path, fullPage: true });
    assert(errors.length === 0, `Browser emitted errors: ${JSON.stringify(errors)}.`);
    await pause(page, humanPace, 700);
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

function assertTiming(timing, phases) {
  assert(Number.isFinite(timing.totalMs), "Total generation duration is missing.");
  for (const phase of phases) assert(Number.isFinite(timing.phases[phase]), `Generation phase ${phase} is missing.`);
}

function screenshotSet(directory) {
  return [
    ["Finite generation record", "Generated finite level with its sampled settings and timings", "issue16-finite-settings.png"],
    ["World generation record", "World mode with its tactic, dimensions, counts, and phase timings", "issue16-world-settings.png"],
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
    } catch {}
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

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("/", "\\")) {
  const result = await runGenerationSettingsVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Finite and World generation records verified.");
}
