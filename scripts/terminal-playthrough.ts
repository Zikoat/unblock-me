import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { chromium, type Browser } from "playwright";

// Cross-platform terminal verification. Runs the real `bun src/index.ts` entry point, drives the known solution,
// validates the winning transcript, and renders each captured terminal frame in
// a headless Chromium browser via Playwright to produce PNG screenshots.

const root = resolve(import.meta.dir, "..");
const SOLUTION: readonly string[] = ["A up", "B down", "R right", "R right", "R right", "R right", "R right"];
const ARTIFACT_ROOT = join(root, "artifacts", "terminal");
const SCREENSHOT_ROOT = join(ARTIFACT_ROOT, "screenshots");

interface TerminalFrame {
  moves: number;
  won: boolean;
  board: string;
}

interface GameRun {
  transcript: string;
  stderr: string;
  exitCode: number | null;
}

interface TerminalManifest {
  runId: string;
  platform: string;
  bunVersion: string;
  command: string;
  engine: string;
  solution: string[];
  executedSolution: string[];
  moveCount: number;
  won: boolean;
  transcriptPath: string;
  screenshots: string[];
  frames: Array<{ label: string; moves: number; won: boolean; screenshot: string }>;
}

export interface TerminalVerificationResult {
  runId: string;
  moveCount: number;
  won: boolean;
  artifactRoot: string;
  manifestPath: string;
  transcriptPath: string;
  screenshots: string[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17);
  return `unblock-me-terminal-${process.pid}-${stamp}`;
}

function spawnGame(): Promise<GameRun> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["src/index.ts"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
    let transcript = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { transcript += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    for (const command of SOLUTION) child.stdin.write(`${command}\n`);
    child.stdin.end();
    child.on("close", (exitCode) => resolvePromise({ transcript, stderr, exitCode }));
  });
}

function parseFrames(transcript: string): TerminalFrame[] {
  const lines = transcript.split("\n");
  const legendIndices = lines
    .map((line, index) => (line.startsWith("Legend: R/A/B=blocks") ? index : -1))
    .filter((index) => index >= 0);

  assert(legendIndices.length === SOLUTION.length + 1, `expected ${SOLUTION.length + 1} frames, found ${legendIndices.length}`);

  return legendIndices.map((legendIndex): TerminalFrame => {
    const movesLine = lines[legendIndex + 1];
    const match = movesLine?.match(/^moves=(\d+) won=(true|false)$/);
    assert(match, `missing moves footer after legend at line ${legendIndex}`);

    // The board is the contiguous run of non-empty lines directly above the
    // blank line that precedes the legend marker.
    const rows: string[] = [];
    let cursor = legendIndex - 1;
    while (cursor >= 0 && lines[cursor].trim() === "") cursor -= 1;
    while (cursor >= 0 && lines[cursor].trim() !== "") {
      rows.unshift(lines[cursor]);
      cursor -= 1;
    }
    assert(rows.length > 0, `no board row found before legend at line ${legendIndex}`);

    return { moves: Number(match[1]), won: match[2] === "true", board: rows.join("\n") };
  });
}

const COLORS: Readonly<Record<string, string>> = {
  ".": "#484f58",
  "#": "#8b949e",
  "*": "#3fb950",
  "R": "#f85149",
  "A": "#58a6ff",
  "B": "#d29922",
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]!);
}

function colorizeBoard(board: string): string {
  return board.split("\n").map((line) =>
    [...line].map((character) => {
      const color = COLORS[character];
      return color ? `<span style="color:${color}">${escapeXml(character)}</span>` : escapeXml(character);
    }).join(""),
  ).join("\n");
}

function frameHtml(frame: TerminalFrame): string {
  const headerColor = frame.won ? "#3fb950" : "#7d8590";
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0d1117">
<div style="padding:20px;font-family:Menlo,Consolas,'DejaVu Sans Mono',monospace;color:#e6edf3;font-size:20px;line-height:1.5">
<div style="color:${headerColor};margin-bottom:12px">moves=${frame.moves} won=${frame.won}${frame.won ? " · YOU WIN" : ""}</div>
<pre style="margin:0">${colorizeBoard(frame.board)}</pre>
</div></body></html>`;
}

async function screenshotFrames(browser: Browser, frames: TerminalFrame[]): Promise<string[]> {
  const context = await browser.newContext({ viewport: { width: 720, height: 320 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const paths: string[] = [];
  try {
    for (const [index, frame] of frames.entries()) {
      const label = index === 0 ? "initial" : frame.won ? "won" : `move-${frame.moves}`;
      const filename = `${String(index + 1).padStart(3, "0")}-${label}.png`;
      const path = join(SCREENSHOT_ROOT, filename);
      await page.setContent(frameHtml(frame), { waitUntil: "domcontentloaded" });
      const box = await page.locator("body > div").boundingBox();
      assert(box, "terminal frame did not lay out");
      await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
      await page.locator("body > div").screenshot({ path });
      paths.push(path);
    }
    return paths;
  } finally {
    await context.close();
  }
}

async function bunVersion(): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolvePromise(output.trim()) : reject(new Error(`bun --version exited ${code}`))));
  });
}

export async function runTerminalVerification(): Promise<TerminalVerificationResult> {
  const id = runId();
  const { transcript, stderr, exitCode } = await spawnGame();
  assert(exitCode === 0, `bun src/index.ts exited ${exitCode}: ${stderr}`);
  assert(stderr === "", `unexpected stderr from the game: ${stderr}`);

  const frames = parseFrames(transcript);
  assert(frames.length === SOLUTION.length + 1, "frame count does not match the solution");
  assert(frames[0].moves === 0 && !frames[0].won, "initial frame is missing");
  assert(frames.every((frame, index) => frame.moves === index), "move counters are not sequential");
  const final = frames[frames.length - 1];
  assert(final.moves === 7 && final.won, `final frame is not a win: moves=${final.moves} won=${final.won}`);
  assert(transcript.includes("YOU WIN"), "transcript is missing YOU WIN");

  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let screenshotPaths: string[] = [];
  try {
    screenshotPaths = await screenshotFrames(browser, frames);
  } finally {
    await browser.close();
  }

  const manifest: TerminalManifest = {
    runId: id,
    platform: process.platform,
    bunVersion: await bunVersion(),
    command: "bun src/index.ts",
    engine: "playwright/chromium",
    solution: [...SOLUTION],
    executedSolution: [...SOLUTION],
    moveCount: final.moves,
    won: final.won,
    transcriptPath: "transcript.txt",
    screenshots: screenshotPaths.map((path) => join("screenshots", basename(path))),
    frames: frames.map((frame, index) => ({
      label: index === 0 ? "initial" : frame.won ? "won" : `move-${frame.moves}`,
      moves: frame.moves,
      won: frame.won,
      screenshot: join("screenshots", basename(screenshotPaths[index])),
    })),
  };

  const transcriptPath = join(ARTIFACT_ROOT, "transcript.txt");
  const manifestPath = join(ARTIFACT_ROOT, "manifest.json");
  await writeFile(transcriptPath, transcript);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    runId: id,
    moveCount: final.moves,
    won: final.won,
    artifactRoot: ARTIFACT_ROOT,
    manifestPath,
    transcriptPath,
    screenshots: screenshotPaths,
  };
}

if (import.meta.main) {
  process.exitCode = await runTerminalVerification()
    .then((result) => {
      console.log(`runId=${result.runId} moves=${result.moveCount} won=${result.won} YOU WIN __APP_EXIT__=0`);
      console.log(`Artifacts: ${result.artifactRoot}`);
      console.log(`Screenshots: ${result.screenshots.length} frame(s)`);
      return 0;
    })
    .catch((error: unknown) => {
      console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    });
}
