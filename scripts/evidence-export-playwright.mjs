import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFile = promisify(execFileCallback);
const root = resolve(import.meta.dirname, "..");
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function runEvidenceExportVerification({ recordVideo = false, humanPace = false } = {}) {
  await execFile("bun", ["run", "build:web"], { cwd: root });
  const port = 4323;
  const server = spawn("bun", ["src/web/server.ts"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const videoDir = recordVideo ? await mkdtemp(join(tmpdir(), "unblock-me-evidence-export-")) : undefined;
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
      acceptDownloads: true,
      deviceScaleFactor: 1,
      recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 844 } } : undefined,
    });
    const page = await context.newPage();
    const errors = collectBrowserErrors(page);
    const video = page.video();
    const screenshots = videoDir ? screenshotSet(videoDir) : [];
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const session = await context.newCDPSession(page);

    await page.locator("[data-action='new-level']").tap();
    await pause(page, humanPace, 600);
    const stored = await storedSession(page);
    const firstAction = stored.currentSolution[0];
    await touchMove(page, session, firstAction, humanPace);
    await page.locator("#feedback-comment").fill("Keep this generation profile");
    await page.locator("[data-rating='up']").tap();
    await page.locator("#generation-details summary").tap();
    await pause(page, humanPace, 600);
    if (screenshots[0]) await page.screenshot({ path: screenshots[0].path, fullPage: true });

    await page.locator("[data-mode='world']").tap();
    await pause(page, humanPace, 500);
    const frame = await page.locator("#board-frame").boundingBox();
    if (!frame) throw new Error("World frame is missing.");
    await touchDragAt(
      session,
      frame.x + frame.width / 2,
      frame.y + frame.height / 2,
      frame.x + frame.width / 2 - 80,
      frame.y + frame.height / 2 - 55,
      humanPace,
    );
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.wheel(0, -120);
    await pause(page, humanPace, 500);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-action='export']").tap(),
    ]);
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Export download has no path.");
    const exported = JSON.parse(await readFile(downloadPath, "utf8"));
    validateExport(exported);
    await addExportPreview(page, exported);
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

function validateExport(exported) {
  assert(exported.schemaVersion === 1, "Export schema version is missing.");
  assert(/^[0-9a-f]{40}$/.test(exported.sourceCommit), "Export source commit is not a full Git commit.");
  assert(exported.play.initialExactState.blocks.length > 0, "Initial Block geometry is missing.");
  assert(exported.play.currentExactState.blocks.length > 0, "Current Block geometry is missing.");
  assert(exported.play.moves.length === 1, "Semantic move is missing.");
  assert(JSON.stringify(exported.play.moves[0].before) !== JSON.stringify(exported.play.moves[0].after), "Move snapshots are not distinct.");
  assert(exported.play.generation.settings.boardWidth.definition.kind, "Generator definition is missing.");
  assert(Number.isFinite(exported.play.generation.timing.totalMs), "Finite generation timing is missing.");
  assert(exported.play.proof.solution.length > 0, "Solver proof is missing.");
  assert(exported.play.proof.sourceCommit === exported.sourceCommit, "Proof is not attached to its source commit.");
  assert(exported.play.feedback.records[0].comment === "Keep this generation profile", "Feedback comment is missing.");
  assert(exported.play.feedback.records[0].sourceCommit === exported.sourceCommit, "Feedback record source commit is missing.");
  assert(exported.view.worldCamera.x !== 0 && exported.view.worldCamera.y !== 0, "World camera is missing.");
  assert(exported.view.zoom !== 1, "Zoom is missing.");
  assert(exported.world.exactState.blocks.length > 0 && exported.world.generation.settings, "Exact World or generation record is missing.");
  assert(exported.closure.exactState.status, "Closure state is missing.");
}

async function touchMove(page, session, action, humanPace) {
  const block = await page.locator(`[data-block-id='${action.blockId}']`).boundingBox();
  if (!block) throw new Error(`Proof Block ${action.blockId} is missing.`);
  const horizontal = action.direction === "left" || action.direction === "right";
  const first = await page.locator(".cell[data-x='0'][data-y='0']").boundingBox();
  const next = await page.locator(horizontal ? ".cell[data-x='1'][data-y='0']" : ".cell[data-x='0'][data-y='1']").boundingBox();
  if (!first || !next) throw new Error("Cell pitch is unavailable.");
  const pitch = horizontal ? next.x - first.x : next.y - first.y;
  const sign = action.direction === "left" || action.direction === "up" ? -1 : 1;
  await touchDragAt(
    session,
    block.x + block.width / 2,
    block.y + block.height / 2,
    block.x + block.width / 2 + (horizontal ? sign * pitch : 0),
    block.y + block.height / 2 + (horizontal ? 0 : sign * pitch),
    humanPace,
  );
}

async function touchDragAt(session, startX, startY, endX, endY, humanPace) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y: startY, id: 4 }],
  });
  for (let step = 1; step <= 7; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: startX + (endX - startX) * step / 7,
        y: startY + (endY - startY) * step / 7,
        id: 4,
      }],
    });
    if (humanPace) await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  if (humanPace) await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
}

async function addExportPreview(page, exported) {
  await page.evaluate((summary) => {
    const panel = document.createElement("section");
    panel.id = "export-preview";
    panel.style.cssText = "margin:12px 0;padding:12px;border:1px solid #526178;border-radius:12px;background:#171e28";
    panel.innerHTML = `<h2>Downloaded JSON validated</h2><pre style="white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace"></pre>`;
    panel.querySelector("pre").textContent = JSON.stringify(summary, null, 2);
    document.querySelector("main").append(panel);
  }, {
    schemaVersion: exported.schemaVersion,
    sourceCommit: exported.sourceCommit,
    levelId: exported.play.currentLevelId,
    exactBlocks: exported.play.currentExactState.blocks.length,
    semanticMoves: exported.play.moves.length,
    feedbackRecords: exported.play.feedback.records.length,
    generatorTactic: exported.play.generation.tactic,
    proofMoves: exported.play.proof.solution.length,
    worldCamera: exported.view.worldCamera,
    zoom: exported.view.zoom,
  });
}

function screenshotSet(directory) {
  return [
    ["Evidence before export", "Generated level with one semantic move, feedback, and its generation record", "issue17-before-export.png"],
    ["Downloaded JSON validated", "Validated self-contained evidence summary after browser download", "issue17-export-validated.png"],
  ].map(([caption, alt, filename]) => ({ caption, alt, path: join(directory, filename) }));
}

async function storedSession(page) {
  return JSON.parse(await page.evaluate(() => localStorage.getItem("unblock-me.browser-session.v1")));
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
  const result = await runEvidenceExportVerification({
    recordVideo: process.argv.includes("--record"),
    humanPace: process.argv.includes("--human"),
  });
  if (process.argv.includes("--json")) console.log(JSON.stringify(result));
  else console.log("Downloaded evidence JSON validated.");
}
