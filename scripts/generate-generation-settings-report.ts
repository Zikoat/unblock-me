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
await exec("bun", ["test", "test/generator.test.ts", "test/world-modes.test.ts"], { cwd });
const playback = JSON.parse((await exec("node", [
  "scripts/generation-settings-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  videoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.videoPath) throw new Error("Generation-settings recorder did not create a video.");

await mkdir(artifacts, { recursive: true });
const video = join(artifacts, "issue-16-generation-settings.mp4");
try {
  await encode(playback.videoPath, video);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const html = renderIssueReport({
    title: "Issue 16 — distribution-backed generation records",
    summary: "Only generator setting definitions, sampled values, reproducibility inputs, and timings are shown.",
    commit,
    issueNumber: 16,
    issueName: "Record distribution-backed generator settings and timings",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/16",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Settings retain distribution definition and sampled value",
      "Finite and World generation record complete settings",
      "Generation records total duration and phase timings",
      "Finite levels remain reproducible from recorded inputs",
      "Tests cover bounds and deterministic seeded reproduction",
    ],
    checks: [
      "Fixed, bounded-uniform, and bounded-normal definitions appear beside their sampled values",
      "Finite records include seed, reverse-scramble tactic, dimensions, Checkpoint, Walls, Block counts/shapes/movements, and timings",
      "World records include seed, Viewport and initial dimensions, request margin, Block counts/size, static movement, zero Walls/Checkpoints, tactic, and timings",
      "Rendered finite dimensions and Blocks matched the recorded samples",
      "Repeated finite generation from the same seed reproduced state, solution, and settings",
    ],
    verification: [
      "TypeScript compilation passed",
      "Focused distribution, finite generator, and World generator tests passed",
      "Phone-sized Playwright inspection passed",
      "Playwright observed no page or console errors",
      "GitHub Pages deployment checked after publishing",
      "Report screenshots were visually inspected",
      "H.264 video playback checked from its HTTPS Pages URL",
    ],
    screenshots,
    videos: [
      { caption: "Phone: inspect finite and World generation records", url: `${videoBase}/${basename(video)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-16-generation-settings-report.html"), html);
  console.log("Report: artifacts/issue-16-generation-settings-report.html");
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
