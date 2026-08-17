import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { renderIssueReport, type ScreenshotEvidence } from "./web-report-template";

const exec = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;
const cwd = process.cwd();
const artifacts = join(cwd, "artifacts");
const videoBase = "https://zikoat.github.io/unblock-me/reports";

await exec("bun", ["run", "typecheck"], { cwd });
await exec("bun", ["test", "test/world-modes.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/world-modes-playwright.mjs",
  "--record",
  "--human",
  "--json",
], { cwd })).stdout.trim()) as {
  desktopVideoPath?: string;
  mobileVideoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.desktopVideoPath || !playback.mobileVideoPath) throw new Error("Targeted recorder did not create both videos.");

await mkdir(artifacts, { recursive: true });
const desktopMp4 = join(artifacts, "issue-12-desktop.mp4");
const mobileMp4 = join(artifacts, "issue-12-mobile.mp4");
try {
  await Promise.all([
    encode(playback.desktopVideoPath, desktopMp4),
    encode(playback.mobileVideoPath, mobileMp4),
  ]);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 12 — browser World and Closure modes",
    summary: "Only the new Viewport-driven World generation, empty-space camera pan, and Dependency-closure modes are shown.",
    commit,
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/12",
    deploymentUrl: "https://zikoat.github.io/unblock-me/app/",
    checks: [
      "World renders exactly the 10×10 Viewport while retaining 40×40 state",
      "Desktop mouse and phone touch empty-space drags changed camera coordinates",
      "Block-origin drag is not interpreted as camera pan",
      "Natural, runaway, and separator scenarios stopped as closed, capped, and separated",
      "3 focused World projection and mode tests passed",
    ],
    screenshots,
    videos: [
      { caption: "Desktop mouse: World pan and all Closure outcomes", url: `${videoBase}/${basename(desktopMp4)}` },
      { caption: "Phone touch: World pan and separator outcome", url: `${videoBase}/${basename(mobileMp4)}` },
    ],
  });
  const report = join(artifacts, "issue-12-browser-world-modes.html");
  await writeFile(report, html);
  console.log(`Report: ${report}`);
} finally {
  if (playback.videoDir) await rm(playback.videoDir, { recursive: true, force: true });
}

async function encode(input: string, output: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable.");
  await exec(ffmpegPath, [
    "-y",
    "-i",
    input,
    "-an",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ]);
}
