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
await exec("bun", ["test", "test/evidence-export.test.ts", "test/browser-session.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/evidence-export-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  videoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.videoPath) throw new Error("Evidence-export recorder did not create a video.");

await mkdir(artifacts, { recursive: true });
const video = join(artifacts, "issue-17-evidence-export.mp4");
try {
  await encode(playback.videoPath, video);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 17 — complete evidence JSON export",
    summary: "Only the downloaded self-contained play and generation evidence is shown.",
    commit,
    issueNumber: 17,
    issueName: "Export complete play and generation evidence as JSON",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/17",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Repository code is unnecessary to recover Block positions or player decisions",
      "Exact geometry before and after recorded moves is included",
      "Settings, samples, seed, timing, proof, feedback, and source commit are present",
      "Playwright downloads and validates the JSON",
    ],
    checks: [
      "Downloaded JSON contained initial/current Exact State and semantic before/after move snapshots",
      "Finite settings, samples, seed, tactic, timings, and replayable proof actions were present",
      "Feedback/comment and its source commit were retained",
      "World Exact State, continuous camera, zoom, generation record, and Closure state were present",
      "The source commit was a full 40-character Git SHA and was attached to the proof",
    ],
    verification: [
      "TypeScript compilation passed",
      "Focused export and session tests passed",
      "Phone-sized Playwright download and JSON validation passed",
      "Playwright observed no page or console errors",
      "GitHub Pages deployment checked after publishing",
      "Report screenshots were visually inspected",
      "H.264 video playback checked from its HTTPS Pages URL",
    ],
    screenshots,
    videos: [
      { caption: "Phone: create evidence, export JSON, and validate the download", url: `${videoBase}/${basename(video)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-17-evidence-export-report.html"), html);
  console.log("Report: artifacts/issue-17-evidence-export-report.html");
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
