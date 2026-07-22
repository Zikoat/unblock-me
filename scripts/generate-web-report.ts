import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { renderWebReport, type ScreenshotEvidence } from "./web-report-template";

const exec = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;
const cwd = process.cwd();
const artifacts = join(cwd, "artifacts");

const [typecheck, tests] = await Promise.all([runBun(["run", "typecheck"]), runBun(["test"])]);
const playback = JSON.parse(await runNode(["scripts/web-playwright.mjs", "--record", "--human", "--json"])) as { desktopVideoPath?: string; mobileVideoPath?: string; generatedSeed: string; screenshots: Array<{ alt: string; caption: string; path: string }>; videoDir?: string };
if (!playback.desktopVideoPath || !playback.mobileVideoPath) throw new Error("Playwright did not create both verification videos.");

await mkdir(artifacts, { recursive: true });
const screenshotDirectory = join(artifacts, "web-screenshots");
await mkdir(screenshotDirectory, { recursive: true });
const desktopMp4 = join(artifacts, "web-desktop.mp4");
const mobileMp4 = join(artifacts, "web-mobile.mp4");
try {
  await Promise.all([encode(playback.desktopVideoPath, desktopMp4), encode(playback.mobileVideoPath, mobileMp4)]);
  const [desktop, mobile, screenshots] = await Promise.all([
    readFile(desktopMp4),
    readFile(mobileMp4),
    Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => {
      const bytes = await readFile(screenshot.path);
      await writeFile(join(screenshotDirectory, basename(screenshot.path)), bytes);
      return { alt: screenshot.alt, caption: screenshot.caption, base64: bytes.toString("base64") };
    })),
  ]);
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderWebReport({ commit, desktopVideoBase64: desktop.toString("base64"), mobileVideoBase64: mobile.toString("base64"), generatedSeed: playback.generatedSeed, screenshots, tests, typecheck });
  const report = join(artifacts, "web-drag-generation-verification.html");
  await writeFile(report, html);
  console.log(`Report: ${report}\nDesktop and mobile Playwright videos are embedded.`);
} finally {
  if (playback.videoDir) await rm(playback.videoDir, { recursive: true, force: true });
}

async function encode(input: string, output: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable.");
  await exec(ffmpegPath, ["-y", "-i", input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
}

async function runBun(args: string[]): Promise<string> {
  const result = await exec("bun", args, { cwd });
  return `${result.stdout}${result.stderr}`;
}

async function runNode(args: string[]): Promise<string> {
  const result = await exec("node", args, { cwd });
  return result.stdout.trim();
}

