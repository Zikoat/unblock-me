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
await exec("bun", ["test", "test/browser-session.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/persistence-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  beforeVideoPath?: string;
  afterVideoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.beforeVideoPath || !playback.afterVideoPath) throw new Error("Persistence recorder did not create both videos.");

await mkdir(artifacts, { recursive: true });
const beforeMp4 = join(artifacts, "issue-14-before-close.mp4");
const afterMp4 = join(artifacts, "issue-14-after-reopen.mp4");
try {
  await Promise.all([encode(playback.beforeVideoPath, beforeMp4), encode(playback.afterVideoPath, afterMp4)]);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 14 — exact browser session persistence",
    summary: "Only exact-state storage and restoration after closing and reopening the browser page are shown.",
    commit,
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/14",
    deploymentUrl: "https://zikoat.github.io/unblock-me/app/",
    checks: [
      "New page restored the previous Closure mode, separator result, and zoom",
      "World camera and Generated Regions were restored",
      "Play restored the exact moved Block coordinate and move count",
      "Semantic history retained action plus complete before/after Game State snapshots",
      "3 focused session-codec tests passed",
    ],
    screenshots,
    videos: [
      { caption: "Interactions and state before closing the page", url: `${videoBase}/${basename(beforeMp4)}` },
      { caption: "Restored state in a newly opened page", url: `${videoBase}/${basename(afterMp4)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-14-browser-persistence.html"), html);
  console.log("Report: artifacts/issue-14-browser-persistence.html");
} finally {
  if (playback.videoDir) await rm(playback.videoDir, { recursive: true, force: true });
}

async function encode(input: string, output: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static is unavailable.");
  await exec(ffmpegPath, [
    "-y", "-i", input, "-an",
    "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output,
  ]);
}
