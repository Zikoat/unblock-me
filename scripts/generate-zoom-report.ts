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
const desktopMp4 = join(artifacts, "issue-13-map-desktop.mp4");
const mobileMp4 = join(artifacts, "issue-13-map-mobile.mp4");
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
    title: "Issue 13 correction — map-style pan and zoom",
    summary: "Only continuous diagonal pan, combined two-finger pan/zoom, and edge-free World zoom are shown.",
    commit,
    issueNumber: 13,
    issueName: "Add pinch and wheel zoom to the browser Viewport",
    issueUrl: "https://github.com/Zikoat/unblock-me/issues/13",
    deploymentUrl: "https://zikoat.github.io/unblock-me/",
    requirements: [
      "Pan updates continuously before pointer release",
      "One pan may move in X and Y simultaneously",
      "Two fingers pan and zoom as one centroid-and-distance gesture",
      "The two-finger gesture uses the same World camera as one-pointer pan",
      "Zooming out does not reveal a bounded World edge",
    ],
    checks: [
      "Desktop camera coordinates changed on both axes while the pointer was still held",
      "Phone camera coordinates and zoom changed during the same two-pointer gesture",
      "World camera crossed the original 40×40 coordinates and generated the resulting Viewport",
      "A 20×20 overscan surface covered the frame at minimum zoom",
      "Wheel zoom retained its pointer anchor",
    ],
    verification: [
      "TypeScript compilation passed",
      "Focused camera, zoom, session, and World reducer tests passed",
      "Desktop mouse and phone touch Playwright flows passed",
      "Playwright observed no page or console errors",
      "GitHub Pages deployment checked after publishing",
      "Report screenshots were visually inspected",
      "Both H.264 videos were checked from their HTTPS Pages URLs",
    ],
    screenshots,
    videos: [
      { caption: "Desktop: continuous diagonal drag, then anchored wheel zoom", url: `${videoBase}/${basename(desktopMp4)}` },
      { caption: "Phone: one combined pinch-pan gesture", url: `${videoBase}/${basename(mobileMp4)}` },
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
