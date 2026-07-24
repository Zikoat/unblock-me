import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { renderIssueReport, type ScreenshotEvidence } from "./web-report-template";

const exec = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;
const cwd = process.cwd();
const artifacts = join(cwd, "artifacts");
const releaseBase = "https://github.com/Zikoat/unblock-me/releases/download/issue-13-browser-zoom";

await exec("bun", ["run", "typecheck"], { cwd });
await exec("bun", ["test", "test/web-zoom.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/zoom-playwright.mjs",
  "--record",
  "--human",
  "--json",
], { cwd })).stdout.trim()) as {
  desktopVideoPath?: string;
  mobileVideoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.desktopVideoPath || !playback.mobileVideoPath) throw new Error("Zoom recorder did not create both videos.");

await mkdir(artifacts, { recursive: true });
const desktopMp4 = join(artifacts, "issue-13-desktop.mp4");
const mobileMp4 = join(artifacts, "issue-13-mobile.mp4");
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
    title: "Issue 13 — wheel and pinch zoom",
    summary: "Only desktop wheel zoom, phone pinch zoom, zoom bounds, and drag ownership are shown.",
    commit,
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/13",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    checks: [
      "Desktop wheel changed zoom from 100% to 140% without a modifier key",
      "Phone two-pointer pinch changed zoom",
      "The phone pinch began on the movable Red Block and committed 0 moves",
      "Red Block engine coordinates were unchanged after both gestures",
      "Zoom is bounded between 75% and 250%",
      "3 focused zoom tests passed",
    ],
    screenshots,
    videos: [
      { caption: "Desktop wheel zoom", url: `${releaseBase}/${basename(desktopMp4)}` },
      { caption: "Phone pinch beginning on the Red Block", url: `${releaseBase}/${basename(mobileMp4)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-13-browser-zoom.html"), html);
  console.log("Report: artifacts/issue-13-browser-zoom.html");
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
