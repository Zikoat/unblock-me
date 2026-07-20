import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { renderReport } from "./report-template";

const execFileAsync = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;

interface Frame {
  durationMs: number;
  label: string;
  path: string;
}

interface TmuxManifest {
  bunVersion: string;
  distro: string;
  frames: Frame[];
  runId: string;
  tmuxVersion: string;
  transcriptPath: string;
}

export interface GenerateReportOptions {
  gitCommit?: string;
  manifestPath?: string;
  outputPath?: string;
  testOutput?: string;
  tmuxOutput?: string;
  typecheckOutput?: string;
  videoPath?: string;
  workingDirectory?: string;
}

export interface GeneratedReport {
  htmlPath: string;
  testSummary: string;
  tmuxSuccess: "yes" | "no";
  videoBytes: number;
  videoPath: string;
}

const terminalWidth = 1280;
const terminalHeight = 720;

function escapeXml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character]!);
}

function paneSvg(label: string, paneText: string): string {
  const lines = paneText.replace(/\r/g, "").split("\n");
  const displayLines = lines.slice(0, 29);
  const text = displayLines.map((line, index) => `<text x="48" y="${110 + index * 21}">${escapeXml(line)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${terminalWidth}" height="${terminalHeight}" viewBox="0 0 ${terminalWidth} ${terminalHeight}">
  <rect width="100%" height="100%" fill="#090d14"/>
  <rect x="28" y="28" width="1224" height="56" rx="10" fill="#172234"/>
  <circle cx="58" cy="56" r="8" fill="#f87171"/><circle cx="84" cy="56" r="8" fill="#fbbf24"/><circle cx="110" cy="56" r="8" fill="#4ade80"/>
  <text x="146" y="63" fill="#c8d7ef" font-family="ui-monospace, Consolas, monospace" font-size="22">tmux capture · ${escapeXml(label)}</text>
  <g fill="#d8f6e5" font-family="ui-monospace, Consolas, monospace" font-size="18" xml:space="preserve">${text}</g>
</svg>`;
}

function absoluteFromManifest(manifestPath: string, relativePath: string): string {
  return isAbsolute(relativePath) ? relativePath : resolve(dirname(manifestPath), relativePath);
}

function ffconcatPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "Not captured before report generation.";
    throw error;
  }
}

async function currentCommit(workingDirectory: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workingDirectory });
    return stdout.trim();
  } catch {
    return "Unavailable";
  }
}

export function summarizeEvidence(testOutput: string, tmuxOutput: string): { testSummary: string; tmuxSuccess: "yes" | "no" } {
  const passes = testOutput.match(/(\d+) pass/);
  const failures = testOutput.match(/(\d+) fail/);
  return {
    testSummary: `${passes?.[1] ?? "unknown"} pass, ${failures?.[1] ?? "unknown"} fail`,
    tmuxSuccess: /moves=7 won=true[\s\S]*YOU WIN[\s\S]*__APP_EXIT__=0/.test(tmuxOutput) ? "yes" : "no",
  };
}

async function encodeVideo(manifest: TmuxManifest, manifestPath: string, videoPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide an ffmpeg executable path.");
  if (manifest.frames.length === 0) throw new Error("The tmux manifest has no frames.");

  const temporaryRoot = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    const pngPaths: string[] = [];
    for (const [index, frame] of manifest.frames.entries()) {
      const paneText = await readFile(absoluteFromManifest(manifestPath, frame.path), "utf8");
      const pngPath = join(temporaryRoot, `${String(index + 1).padStart(3, "0")}-${basename(frame.path, ".txt")}.png`);
      await sharp(Buffer.from(paneSvg(frame.label, paneText))).png().toFile(pngPath);
      pngPaths.push(pngPath);
    }

    const concatLines = manifest.frames.flatMap((frame, index) => [
      `file '${ffconcatPath(pngPaths[index])}'`,
      `duration ${(frame.durationMs / 1000).toFixed(3)}`,
    ]);
    concatLines.push(`file '${ffconcatPath(pngPaths.at(-1)!)}'`);
    const concatPath = join(temporaryRoot, "frames.ffconcat");
    await writeFile(concatPath, `ffconcat version 1.0\n${concatLines.join("\n")}\n`, "utf8");
    await mkdir(dirname(videoPath), { recursive: true });
    await execFileAsync(ffmpegPath, [
      "-y", "-safe", "0", "-f", "concat", "-i", concatPath,
      "-vsync", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", videoPath,
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function generateReport(options: GenerateReportOptions = {}): Promise<GeneratedReport> {
  const workingDirectory = resolve(options.workingDirectory ?? process.cwd());
  const manifestPath = resolve(options.manifestPath ?? join(workingDirectory, "artifacts", "tmux", "manifest.json"));
  const outputPath = resolve(options.outputPath ?? join(workingDirectory, "artifacts", "terminal-mvp-verification.html"));
  const videoPath = resolve(options.videoPath ?? join(dirname(outputPath), "terminal-mvp.mp4"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as TmuxManifest;
  const transcript = await readFile(absoluteFromManifest(manifestPath, manifest.transcriptPath), "utf8");

  await encodeVideo(manifest, manifestPath, videoPath);
  const video = await readFile(videoPath);
  const [typecheckOutput, testOutput, tmuxOutput, gitCommit] = await Promise.all([
    options.typecheckOutput ?? readOptional(join(workingDirectory, "artifacts", "typecheck.txt")),
    options.testOutput ?? readOptional(join(workingDirectory, "artifacts", "tests.txt")),
    options.tmuxOutput ?? readOptional(join(workingDirectory, "artifacts", "tmux-verification.txt")),
    options.gitCommit ?? currentCommit(workingDirectory),
  ]);
  const html = renderReport({
    bunVersion: manifest.bunVersion,
    gitCommit,
    runId: manifest.runId,
    terminalTranscript: transcript,
    testOutput,
    tmuxOutput,
    tmuxVersion: `${manifest.tmuxVersion} on ${manifest.distro}`,
    typecheckOutput,
    videoBase64: video.toString("base64"),
    videoBytes: video.byteLength,
    workingDirectory,
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  return { htmlPath: outputPath, videoBytes: video.byteLength, videoPath, ...summarizeEvidence(testOutput, tmuxOutput) };
}

if (import.meta.main) {
  const result = await generateReport();
  console.log(`Report: ${result.htmlPath}`);
  console.log(`Embedded video bytes: ${result.videoBytes}`);
  console.log(`Test summary: ${result.testSummary}`);
  console.log(`tmux success: ${result.tmuxSuccess}`);
}
