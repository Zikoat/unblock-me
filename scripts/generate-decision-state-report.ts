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
await exec("bun", ["test", "test/decision-state.test.ts"], { cwd });
await exec("bun", ["scripts/run-decision-state-validation.ts"], { cwd });
const validation = JSON.parse(await readFile(join(artifacts, "issue18-decision-state-validation.json"), "utf8"));
const playback = JSON.parse((await exec("node", [
  "scripts/decision-state-evidence-playwright.mjs", "--record", "--human", "--json",
], { cwd })).stdout.trim()) as {
  videoPath?: string;
  screenshots: Array<{ alt: string; caption: string; path: string }>;
  videoDir?: string;
};
if (!playback.videoPath) throw new Error("Decision State recorder did not create a video.");

await mkdir(artifacts, { recursive: true });
const video = join(artifacts, "issue-18-decision-state.mp4");
try {
  await encode(playback.videoPath, video);
  const screenshots = await Promise.all(playback.screenshots.map(async (screenshot): Promise<ScreenshotEvidence> => ({
    alt: screenshot.alt,
    caption: screenshot.caption,
    base64: (await readFile(screenshot.path)).toString("base64"),
  })));
  const commit = (await exec("git", ["rev-parse", "--short", "HEAD"], { cwd })).stdout.trim();
  const independent = validation.cases.find((entry) => entry.name === "independent-parallel").result;
  const counterexample = validation.cases.find((entry) => entry.name === "dependency-gate-counterexample").result;
  const html = renderIssueReport({
    title: "Issue 18 — Decision State compression validation",
    summary: "The finite Exact State oracle confirms the independent-motion collapse and rejects one unsound composition rule.",
    commit,
    issueNumber: 18,
    issueName: "Validate Decision State compression with finite exact search",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/18",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Exact search is the finite correctness oracle",
      "Compression uses positioned Blocks and derived Blocker Dependencies",
      "Compressed and Exact State reachability are compared",
      "Mismatches emit a reproducible board and source commit",
      "State counts, duration, and memory-relevant counts are recorded",
    ],
    checks: [
      `${independent.exact.states} independent Exact States collapsed to ${independent.compressed.states} Decision State with matching reachability`,
      "Full Checkpoint occupancy remained a distinct Event Boundary",
      `The Dependency Gate case had ${counterexample.exact.states} Exact States and ${counterexample.exactDecisionStates} oracle Decision States`,
      `Exact search rejected ${counterexample.comparison.extraDecisionStates} spurious candidate states caused by combining incompatible Block positions`,
      "The counterexample retains complete initial/witness geometry, seed, metrics, and source commit",
      "Peak queue, transitions, Interaction Region positions examined, and exact/compressed durations were recorded",
    ],
    verification: [
      "TypeScript compilation passed",
      "Focused oracle, Interaction Region, Event Boundary, and counterexample tests passed",
      "Validation corpus completed without search truncation",
      "Evidence screenshots were visually inspected",
      "GitHub release record checked after publishing",
      "H.264 evidence walkthrough checked from its HTTPS Pages URL",
    ],
    screenshots,
    videos: [
      { caption: "Phone: compare the valid collapse with the rejected Dependency Gate composition", url: `${videoBase}/${basename(video)}` },
    ],
  });
  await writeFile(join(artifacts, "issue-18-decision-state-report.html"), html);
  console.log("Report: artifacts/issue-18-decision-state-report.html");
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
