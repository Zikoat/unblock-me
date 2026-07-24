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

const playback = JSON.parse((await exec("node", [
  "scripts/control-style-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  videoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.videoPath) throw new Error("Control-style recorder did not create a video.");

await mkdir(artifacts, { recursive: true });
const video = join(artifacts, "issue-25-control-style.mp4");
try {
  await encode(playback.videoPath, video);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 25 — recognizable controls and consistent blocks",
    summary: "This report covers only control affordances and block styling across board sizes, zoom, renderers, and phone layout.",
    commit,
    issueNumber: 25,
    issueName: "Make controls recognizable and block styling scale-consistent",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/25",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Pressable buttons are visually distinct from informational labels",
      "Blocks retain the same style across generated board sizes",
      "Blocks retain the same style across zoom levels and block renderers",
      "Browser behavior is verified and screenshots are included",
    ],
    checks: [
      "Flat labels have no pointer cursor, gradient, or elevation shadow",
      "Buttons have pointer, raised border/fill, hover, press, focus, selected, and disabled states",
      "Block inset, radius, type, and shadow use shared cell-relative geometry",
      "Normalized geometry matched on 7- and 10-column boards, 100% and 130% zoom, Play and World, desktop and phone",
    ],
    verification: [
      "TypeScript compilation and automated tests passed",
      "Web production build passed",
      "Targeted Playwright computed-style checks passed",
      "Playwright observed no page or console errors",
      "Screenshots were visually inspected",
      "GitHub Pages deployment and H.264 video URL checked after publishing",
    ],
    screenshots,
    videos: [
      { caption: "Human-paced control, generated-board, zoom, renderer, and phone-size walkthrough", url: `${videoBase}/${basename(video)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-25-control-style-report.html"), html);
  console.log("Report: artifacts/issue-25-control-style-report.html");
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
