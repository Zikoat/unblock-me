import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { renderReport, type EvidenceSet, type TimingEvidence } from "./report-template";

const exec = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string | null;
const FPS = 25;
const FRAME_MS = 1000 / FPS;
const TIMING_EPSILON_MS = 0.02;

type Frame = {
  capturedAtUtc: string;
  capturedMonotonicMs: number;
  durationMs: number;
  eventAtMonotonicMs?: number;
  label: string;
  path: string;
};

type ManifestTiming = TimingEvidence & {
  clock: "CLOCK_MONOTONIC";
  interactionEndedMonotonicMs: number;
  totalFrameDurationMs: number;
};

type Manifest = {
  bunVersion: string;
  distro: string;
  frames: Frame[];
  executedSolution: string[];
  paneCommand: string;
  repositoryWslPath: string;
  runId: string;
  solution: string[];
  timing: ManifestTiming;
  tmuxCommands: string[];
  tmuxVersion: string;
  transcriptPath: string;
};

type ValidatedEvidence = {
  framePaths: string[];
  transcriptPath: string;
};

export type VideoMetadata = {
  codec: string;
  durationSeconds: number;
  pixelFormat: string;
};

export interface GenerateReportOptions {
  evidence: EvidenceSet;
  gitCommit?: string;
  manifestPath: string;
  outputPath: string;
  videoPath?: string;
  workingDirectory?: string;
}

export interface GeneratedReport {
  htmlPath: string;
  testSummary: string;
  tmuxSuccess: "yes" | "no";
  video: VideoMetadata;
  videoBytes: number;
  videoPath: string;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

function svg(label: string, text: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .slice(0, 29)
    .map((line, index) => `<text x="48" y="${110 + index * 21}">${escapeXml(line)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="#090d14"/><text x="48" y="64" fill="#c8d7ef" font-family="monospace" font-size="22">tmux capture · ${escapeXml(label)}</text><g fill="#d8f6e5" font-family="monospace" font-size="18" xml:space="preserve">${lines}</g></svg>`;
}

function safeRunId(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(runId)) {
    throw new Error("manifest path: unsafe runId");
  }
}

function evidenceRelativeParts(runId: string, value: string): string[] {
  if (isAbsolute(value) || value.includes("\\")) {
    throw new Error("manifest path: absolute or backslash path rejected");
  }
  const parts = value.split("/");
  const prefix = ["runs", runId, "evidence"];
  if (
    parts.length <= prefix.length
    || parts.some((part) => part === "" || part === "." || part === "..")
    || !prefix.every((part, index) => parts[index] === part)
  ) {
    throw new Error("manifest path: path is outside the declared run evidence");
  }
  return parts.slice(prefix.length);
}

function finitePositive(value: unknown, message: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
}

function assertMeasuredTiming(manifest: Manifest): void {
  if (manifest.timing?.clock !== "CLOCK_MONOTONIC") {
    throw new Error("measured timing: manifest must use CLOCK_MONOTONIC");
  }
  finitePositive(manifest.timing.interactionEndedMonotonicMs, "measured timing: invalid interaction end");
  finitePositive(manifest.timing.captureSpanMs, "measured timing: invalid capture span");
  finitePositive(manifest.timing.totalFrameDurationMs, "measured timing: invalid frame total");

  let durationTotal = 0;
  for (const [index, frame] of manifest.frames.entries()) {
    finitePositive(frame.capturedMonotonicMs, "measured timing: invalid capture timestamp");
    finitePositive(frame.durationMs, "measured timing: invalid duration");
    if (Number.isNaN(Date.parse(frame.capturedAtUtc))) {
      throw new Error("measured timing: invalid UTC capture timestamp");
    }
    const nextTimestamp = index + 1 < manifest.frames.length
      ? manifest.frames[index + 1].capturedMonotonicMs
      : manifest.timing.interactionEndedMonotonicMs;
    const observedDuration = nextTimestamp - frame.capturedMonotonicMs;
    if (observedDuration <= 0 || Math.abs(observedDuration - frame.durationMs) > TIMING_EPSILON_MS) {
      throw new Error(`measured timing: frame ${frame.label} duration does not match observed capture interval`);
    }
    durationTotal += frame.durationMs;
  }

  const observedSpan = manifest.timing.interactionEndedMonotonicMs - manifest.frames[0].capturedMonotonicMs;
  if (
    Math.abs(observedSpan - manifest.timing.captureSpanMs) > TIMING_EPSILON_MS
    || Math.abs(durationTotal - observedSpan) > TIMING_EPSILON_MS
    || Math.abs(durationTotal - manifest.timing.totalFrameDurationMs) > TIMING_EPSILON_MS
  ) {
    throw new Error("measured timing: frame total does not match the observed timestamp span");
  }
}

function parseManifest(raw: string): Manifest {
  const manifest = JSON.parse(raw) as Manifest;
  safeRunId(manifest.runId);
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
    throw new Error("manifest path: no frames");
  }
  if (!Array.isArray(manifest.solution) || manifest.solution.length === 0) {
    throw new Error("manifest path: no solution command sequence");
  }
  if (
    !Array.isArray(manifest.executedSolution)
    || manifest.executedSolution.length !== manifest.solution.length
    || manifest.solution.some((command, index) => command !== manifest.executedSolution[index])
  ) {
    throw new Error("manifest evidence: executed solution does not match declared solution");
  }
  if (!Array.isArray(manifest.tmuxCommands) || manifest.tmuxCommands.length === 0 || manifest.tmuxCommands.some((command) => typeof command !== "string")) {
    throw new Error("manifest evidence: missing executed tmux command trace");
  }
  evidenceRelativeParts(manifest.runId, manifest.transcriptPath);
  for (const frame of manifest.frames) evidenceRelativeParts(manifest.runId, frame.path);
  assertMeasuredTiming(manifest);
  return manifest;
}

function pathIsInside(root: string, target: string): boolean {
  const difference = relative(root, target);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

export async function assertRealPathInside(root: string, target: string, label: string): Promise<string> {
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
  if (!pathIsInside(realRoot, realTarget)) {
    throw new Error(`manifest path: real path escapes exact run evidence directory: ${label}`);
  }
  return realTarget;
}

async function assertDirectoryWithoutLinks(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`manifest path: symlink or reparse point rejected: ${path}`);
  if (!info.isDirectory()) throw new Error(`manifest path: expected evidence directory: ${path}`);
}

async function validateEvidenceFile(
  manifestDirectory: string,
  runId: string,
  value: string,
): Promise<string> {
  const parts = evidenceRelativeParts(runId, value);
  const runsRoot = join(manifestDirectory, "runs");
  const runRoot = join(runsRoot, runId);
  const evidenceRoot = join(runRoot, "evidence");
  await assertDirectoryWithoutLinks(runsRoot);
  await assertDirectoryWithoutLinks(runRoot);
  await assertDirectoryWithoutLinks(evidenceRoot);

  let current = evidenceRoot;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      throw new Error(`manifest path: symlink or reparse point rejected: ${value}`);
    }
    if (index < parts.length - 1 && !info.isDirectory()) {
      throw new Error(`manifest path: expected evidence directory: ${value}`);
    }
    if (index === parts.length - 1 && !info.isFile()) {
      throw new Error(`manifest path: evidence must be a regular file: ${value}`);
    }
  }

  return assertRealPathInside(evidenceRoot, current, value);
}

async function validateEvidence(manifestPath: string, manifest: Manifest): Promise<ValidatedEvidence> {
  const manifestDirectory = dirname(manifestPath);
  const transcriptPath = await validateEvidenceFile(manifestDirectory, manifest.runId, manifest.transcriptPath);
  const framePaths: string[] = [];
  for (const frame of manifest.frames) {
    framePaths.push(await validateEvidenceFile(manifestDirectory, manifest.runId, frame.path));
  }
  return { framePaths, transcriptPath };
}

async function atomicWrite(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function probe(path: string): Promise<VideoMetadata> {
  try {
    await exec(ffmpegPath!, ["-hide_banner", "-i", path]);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const duration = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(stderr);
    const video = /Video: ([^ ]+).*?, ([a-z0-9]+)/.exec(stderr);
    if (!duration || !video) throw error;
    return {
      codec: video[1],
      durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
      pixelFormat: video[2],
    };
  }
  throw new Error("ffmpeg probe unexpectedly succeeded");
}

async function encode(
  manifest: Manifest,
  evidence: ValidatedEvidence,
  output: string,
): Promise<VideoMetadata> {
  if (!ffmpegPath) throw new Error("ffmpeg-static unavailable");
  const temporaryRoot = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  const encoded = `${output}.${process.pid}.tmp.mp4`;
  try {
    const images: string[] = [];
    for (const [index, frame] of manifest.frames.entries()) {
      const imagePath = join(temporaryRoot, `${index}.png`);
      const pane = await readFile(evidence.framePaths[index], "utf8");
      await sharp(Buffer.from(svg(frame.label, pane))).png().toFile(imagePath);
      images.push(imagePath);
    }

    let emittedFrames = 0;
    let accumulatedMs = 0;
    const concatLines: string[] = [];
    for (const [index, frame] of manifest.frames.entries()) {
      accumulatedMs += frame.durationMs;
      const frameCount = Math.max(1, Math.round(accumulatedMs / FRAME_MS) - emittedFrames);
      emittedFrames += frameCount;
      for (let count = 0; count < frameCount; count += 1) {
        concatLines.push(`file '${images[index].replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
        concatLines.push("duration 0.040");
      }
    }

    const concatPath = join(temporaryRoot, "frames.ffconcat");
    await writeFile(concatPath, `ffconcat version 1.0\n${concatLines.join("\n")}\n`);
    await mkdir(dirname(output), { recursive: true });
    await exec(ffmpegPath, [
      "-y",
      "-safe", "0",
      "-f", "concat",
      "-i", concatPath,
      "-r", String(FPS),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      encoded,
    ]);
    const metadata = await probe(encoded);
    const expectedSeconds = manifest.timing.totalFrameDurationMs / 1000;
    if (
      metadata.codec !== "h264"
      || metadata.pixelFormat !== "yuv420p"
      || Math.abs(metadata.durationSeconds - expectedSeconds) > 1 / FPS + 0.001
    ) {
      throw new Error(`encoded video failed metadata or measured timing validation: ${JSON.stringify({ metadata, expectedSeconds })}`);
    }
    await rename(encoded, output);
    return metadata;
  } finally {
    await rm(encoded, { force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function summarizeEvidence(testOutput: string, tmuxOutput: string): {
  testSummary: string;
  tmuxSuccess: "yes" | "no";
} {
  const passes = testOutput.match(/(\d+) pass/)?.[1] ?? "unknown";
  const failures = testOutput.match(/(\d+) fail/)?.[1] ?? "unknown";
  return {
    testSummary: `${passes} pass, ${failures} fail`,
    tmuxSuccess: /moves=7 won=true[\s\S]*YOU WIN[\s\S]*__APP_EXIT__=0/.test(tmuxOutput) ? "yes" : "no",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function generateReport(options: GenerateReportOptions): Promise<GeneratedReport> {
  const manifestPath = resolve(options.manifestPath);
  const outputPath = resolve(options.outputPath);
  const manifest = parseManifest(await readFile(manifestPath, "utf8"));
  if (Object.values(options.evidence).some((value) => value.status !== "Passed")) {
    throw new Error("required evidence is not passed");
  }
  const tmuxOutput = options.evidence.tmux.output;
  if (!new RegExp(`runId=${escapeRegExp(manifest.runId)}(?:\\s|$)`).test(tmuxOutput)) {
    throw new Error("tmux runId does not match manifest");
  }

  const validatedEvidence = await validateEvidence(manifestPath, manifest);
  const videoPath = resolve(options.videoPath ?? join(dirname(outputPath), "terminal-mvp.mp4"));
  const video = await encode(manifest, validatedEvidence, videoPath);
  const transcript = await readFile(validatedEvidence.transcriptPath, "utf8");
  const videoBytes = await readFile(videoPath);
  const summary = summarizeEvidence(options.evidence.tests.output, tmuxOutput);
  await atomicWrite(outputPath, renderReport({
    bunVersion: manifest.bunVersion,
    evidence: options.evidence,
    gitCommit: options.gitCommit ?? "fixture",
    paneCommand: manifest.paneCommand,
    repositoryWslPath: manifest.repositoryWslPath,
    runId: manifest.runId,
    solution: manifest.solution,
    terminalTranscript: transcript,
    timing: manifest.timing,
    tmuxCommandSequence: manifest.tmuxCommands.join("\n"),
    tmuxVersion: `${manifest.tmuxVersion} on ${manifest.distro}`,
    videoBase64: videoBytes.toString("base64"),
    videoBytes: videoBytes.length,
    videoDurationSeconds: video.durationSeconds,
    workingDirectory: options.workingDirectory ?? process.cwd(),
  }));
  return {
    htmlPath: outputPath,
    videoPath,
    videoBytes: videoBytes.length,
    video,
    ...summary,
  };
}

async function runChecked(args: string[]): Promise<string> {
  try {
    const result = await exec("bun", args);
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    throw new Error(
      `required command failed: bun ${args.join(" ")}\n${String((error as { stdout?: string }).stdout ?? "")}${String((error as { stderr?: string }).stderr ?? "")}`,
    );
  }
}

async function head(cwd: string): Promise<string> {
  return (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
}

export async function assertCleanWorktree(cwd: string, phase: string): Promise<void> {
  const status = (await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd })).stdout.trim();
  if (status) {
    throw new Error(`Git worktree must be clean ${phase}:\n${status}`);
  }
}

export async function generateProductionReport(cwd = process.cwd()): Promise<GeneratedReport> {
  await assertCleanWorktree(cwd, "before capture");
  const commitBeforeCapture = await head(cwd);
  const typecheck = await runChecked(["run", "typecheck"]);
  const tests = await runChecked(["test"]);
  const tmux = await runChecked(["run", "verify:tmux"]);
  if (commitBeforeCapture !== await head(cwd)) {
    throw new Error("Git HEAD changed during evidence capture");
  }
  await assertCleanWorktree(cwd, "after capture");

  const evidence: EvidenceSet = {
    typecheck: { status: "Passed", output: typecheck },
    tests: { status: "Passed", output: tests },
    tmux: { status: "Passed", output: tmux },
  };
  await Promise.all([
    atomicWrite(join(cwd, "artifacts/typecheck.txt"), typecheck),
    atomicWrite(join(cwd, "artifacts/tests.txt"), tests),
    atomicWrite(join(cwd, "artifacts/tmux-verification.txt"), tmux),
  ]);
  return generateReport({
    evidence,
    gitCommit: commitBeforeCapture,
    manifestPath: join(cwd, "artifacts/tmux/manifest.json"),
    outputPath: join(cwd, "artifacts/terminal-mvp-verification.html"),
    workingDirectory: cwd,
  });
}

if (import.meta.main) {
  const result = await generateProductionReport();
  console.log(
    `Report: ${result.htmlPath}\nEmbedded video bytes: ${result.videoBytes}\nTest summary: ${result.testSummary}\ntmux success: ${result.tmuxSuccess}`,
  );
}
