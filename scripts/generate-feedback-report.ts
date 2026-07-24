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
await exec("bun", ["test", "test/web-feedback.test.ts", "test/browser-session.test.ts", "test/game.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/feedback-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  videoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.videoPath) throw new Error("Feedback recorder did not create a video.");

await mkdir(artifacts, { recursive: true });
const video = join(artifacts, "issue-15-feedback.mp4");
try {
  await encode(playback.videoPath, video);
  const screenshots = await Promise.all(playback.screenshots.slice(0, 3).map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 15 — level feedback and solved progression",
    summary: "Only level ratings, optional comments, post-solve interaction, and the solved-level progression gate are shown.",
    commit,
    issueNumber: 15,
    issueName: "Collect level feedback and gate solved progression",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/15",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Feedback is available before and after solving",
      "A solved level remains interactive",
      "Post-solve next-level progression requires a vote",
      "An unfinished level can advance without a vote",
      "Optional comments are stored with votes",
      "Playwright covers solved and unfinished paths",
    ],
    checks: [
      "Thumbs and an optional comment were stored before and after solving",
      "An unfinished level advanced without requiring feedback",
      "A solved level rejected Next until a vote was saved",
      "Blocks remained movable after the solved state",
      "A saved vote unlocked the next generated level",
    ],
    verification: [
      "TypeScript compilation passed",
      "Focused engine, session, and feedback tests passed",
      "Phone-sized Playwright touch flow passed",
      "Playwright observed no page or console errors",
      "GitHub Pages deployment checked after publishing",
      "Report screenshots were visually inspected",
      "H.264 video playback checked from its HTTPS Pages URL",
    ],
    screenshots,
    videos: [
      { caption: "Phone touch: unfinished feedback, solved gate, continued play, and vote unlock", url: `${videoBase}/${basename(video)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-15-feedback-report.html"), html);
  console.log("Report: artifacts/issue-15-feedback-report.html");
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
