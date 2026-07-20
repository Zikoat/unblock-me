import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function writeFixture(root: string, patch: Record<string, unknown> = {}) {
  const evidenceRoot = join(root, "tmux");
  const paneRoot = join(evidenceRoot, "runs", "fixture-run", "evidence", "panes");
  await mkdir(paneRoot, { recursive: true });
  await writeFile(join(paneRoot, "001-initial.txt"), "moves=0 won=false\n", "utf8");
  await writeFile(join(paneRoot, "002-won.txt"), "moves=7 won=true\nYOU WIN\n__APP_EXIT__=0\n", "utf8");
  await writeFile(join(evidenceRoot, "runs", "fixture-run", "evidence", "transcript.txt"), "--- initial ---\nmoves=0 won=false\n--- won ---\nmoves=7 won=true\nYOU WIN\n__APP_EXIT__=0\n", "utf8");
  const manifest = {
    runId: "fixture-run", distro: "Ubuntu", tmuxVersion: "tmux fixture", bunVersion: "fixture-bun",
    repositoryWslPath: "/mnt/c/fixture",
    paneCommand: "cd '/mnt/c/fixture' && PATH='/tmp/shim':$PATH bun run start; app_status=$?; printf '\\n__APP_EXIT__=%s\\n' \"$app_status\"; exec bash",
    solution: ["A up", "B down", "R right", "R right", "R right", "R right", "R right"],
    executedSolution: ["A up", "B down", "R right", "R right", "R right", "R right", "R right"],
    tmuxCommands: [
      "bun run verify:tmux",
      "tmux new-session -d -s 'fixture-run' 'bun run start'",
      "tmux send-keys -t 'fixture-run:0.0' -l A",
      "tmux capture-pane -p -t 'fixture-run:0.0'",
    ],
    transcriptPath: "runs/fixture-run/evidence/transcript.txt",
    frames: [
      { label: "initial", path: "runs/fixture-run/evidence/panes/001-initial.txt", capturedAtUtc: "2026-07-20T00:00:00.000Z", capturedMonotonicMs: 1000, durationMs: 800 },
      { label: "won", path: "runs/fixture-run/evidence/panes/002-won.txt", capturedAtUtc: "2026-07-20T00:00:00.800Z", capturedMonotonicMs: 1800, durationMs: 800 },
    ],
    timing: {
      clock: "CLOCK_MONOTONIC",
      interactionEndedMonotonicMs: 2600,
      captureSpanMs: 1600,
      totalFrameDurationMs: 1600,
      initialHoldMs: 800,
      winningHoldMs: 800,
      interCharacterSendDeltasMs: [80],
      interCharacterCaptureDeltasMs: [81],
      commandPauseCaptureDeltasMs: [700],
    },
    ...patch,
  };
  await writeFile(join(evidenceRoot, "manifest.json"), JSON.stringify(manifest), "utf8");
  return join(evidenceRoot, "manifest.json");
}

const passedEvidence = {
  typecheck: { status: "Passed" as const, output: "typecheck passed" },
  tests: { status: "Passed" as const, output: "12 pass\n0 fail" },
  tmux: { status: "Passed" as const, output: "runId=fixture-run moves=7 won=true YOU WIN __APP_EXIT__=0" },
};

test("generates a self-contained responsive verification report from a fixture capture", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const fixtureRoot = await mkdtemp(join(tmpdir(), "unblock-me-report-"));

  try {
    const manifestPath = await writeFixture(fixtureRoot);

    const outputPath = join(fixtureRoot, "verification.html");
    const result = await generateReport({
      manifestPath,
      outputPath,
      evidence: passedEvidence,
      gitCommit: "fixture-commit",
    });

    const html = await readFile(outputPath, "utf8");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain("Request and scope");
    expect(html).toContain("Run <code>fixture-run</code>, commit <code>fixture-commit</code>");
    expect(html).toContain("bun run start");
    expect(html).toContain("Pure rules engine");
    expect(html).toContain("7×5");
    expect(html).toContain("A up");
    expect(html).toContain("tmux new-session");
    expect(html).toContain("tmux send-keys");
    expect(html).toContain("tmux capture-pane");
    expect(html).toContain("Approved scope");
    expect(html).toContain("One hard-coded, solvable puzzle");
    expect(html).toContain("Deferred scope");
    expect(html).toContain("Cursor selection");
    expect(html).toContain("Verification evidence");
    expect(html).toContain("fixture-bun");
    expect(html).toContain("moves=7 won=true");
    expect(html).toContain("Deployment status");
    expect(html).toContain("At capture time, publication to a private GitHub Release was pending");
    expect(html).toContain("Limitations");
    expect(html).toContain("Android phone verification");
    expect(html).toContain("Sign in to GitHub");
    expect(html).toContain("private repository");
    expect(html).toContain("Chrome or an HTML-capable viewer");
    expect(html).toContain("Pending human verification");
    expect(html).toContain('<video controls src="data:video/mp4;base64,');
    expect(html).toContain("max-width:100%");
    expect(html).toContain("main,section,table,pre,video");
    expect(result.video.durationSeconds).toBeGreaterThanOrEqual(1.56);
    expect(result.video.durationSeconds).toBeLessThanOrEqual(1.64);
    expect(result.video.codec).toBe("h264");
    expect(result.video.pixelFormat).toBe("yuv420p");

    const match = html.match(/data:video\/mp4;base64,([^\"]+)/);
    expect(match).not.toBeNull();
    const video = Buffer.from(match![1], "base64");
    expect(video.byteLength).toBeGreaterThan(0);
    expect(video.subarray(4, 8).toString("ascii")).toBe("ftyp");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test.each([
  ["absolute", { transcriptPath: "C:/Windows/win.ini" }],
  ["traversal", { transcriptPath: "runs/fixture-run/evidence/../../outside.txt" }],
  ["mismatched run", { transcriptPath: "runs/other/evidence/transcript.txt" }],
])("rejects %s manifest paths", async (_name, patch) => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    await expect(generateReport({ manifestPath: await writeFixture(root, patch), outputPath: join(root, "out.html"), evidence: passedEvidence })).rejects.toThrow("manifest path");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects an uncontained pane path even when the transcript is valid", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    await expect(generateReport({ manifestPath: await writeFixture(root, { frames: [{ label: "bad", path: "runs/other/evidence/pane.txt", durationMs: 800 }] }), outputPath: join(root, "out.html"), evidence: passedEvidence })).rejects.toThrow("manifest path");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects a pane whose measured duration disagrees with capture timestamps", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    const frames = [
      { label: "initial", path: "runs/fixture-run/evidence/panes/001-initial.txt", capturedAtUtc: "2026-07-20T00:00:00.000Z", capturedMonotonicMs: 1000, durationMs: 80 },
      { label: "won", path: "runs/fixture-run/evidence/panes/002-won.txt", capturedAtUtc: "2026-07-20T00:00:00.800Z", capturedMonotonicMs: 1800, durationMs: 800 },
    ];
    await expect(generateReport({ manifestPath: await writeFixture(root, { frames }), outputPath: join(root, "out.html"), evidence: passedEvidence })).rejects.toThrow("measured timing");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects a manifest whose declared solution differs from the executed trace", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    await expect(generateReport({
      manifestPath: await writeFixture(root, { executedSolution: ["A up", "B down"] }),
      outputPath: join(root, "out.html"),
      evidence: passedEvidence,
    })).rejects.toThrow("executed solution does not match");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects evidence reached through a symlink or junction before reading it", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    const manifestPath = await writeFixture(root);
    const external = join(root, "external");
    await mkdir(external);
    await writeFile(join(external, "pane.txt"), "outside evidence", "utf8");
    const linked = join(root, "tmux", "runs", "fixture-run", "evidence", "panes", "linked");
    try {
      await symlink(external, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "ENOSYS")) return;
      throw error;
    }
    const frames = [
      { label: "initial", path: "runs/fixture-run/evidence/panes/linked/pane.txt", capturedAtUtc: "2026-07-20T00:00:00.000Z", capturedMonotonicMs: 1000, durationMs: 1600 },
    ];
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.frames = frames;
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await expect(generateReport({ manifestPath, outputPath: join(root, "out.html"), evidence: passedEvidence })).rejects.toThrow(/symlink|reparse|real path/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("core realpath containment rejects a regular file outside the exact run directory", async () => {
  const { assertRealPathInside } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-realpath-"));
  try {
    const evidenceRoot = join(root, "run", "evidence");
    const inside = join(evidenceRoot, "pane.txt");
    const outside = join(root, "outside.txt");
    await mkdir(evidenceRoot, { recursive: true });
    await writeFile(inside, "inside", "utf8");
    await writeFile(outside, "outside", "utf8");

    await expect(assertRealPathInside(evidenceRoot, inside, "inside")).resolves.toBe(inside);
    await expect(assertRealPathInside(evidenceRoot, outside, "outside")).rejects.toThrow("real path escapes exact run evidence directory");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("requires transcript and pane evidence to be regular files", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    const transcriptPath = "runs/fixture-run/evidence/panes";
    await expect(generateReport({ manifestPath: await writeFixture(root, { transcriptPath }), outputPath: join(root, "out.html"), evidence: passedEvidence })).rejects.toThrow("regular file");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("matches a dotted runId literally in tmux evidence", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-report-"));
  try {
    const manifestPath = await writeFixture(root, {
      runId: "fixture.run",
      transcriptPath: "runs/fixture.run/evidence/transcript.txt",
      frames: [{ label: "initial", path: "runs/fixture.run/evidence/panes/001-initial.txt", capturedAtUtc: "2026-07-20T00:00:00.000Z", capturedMonotonicMs: 1000, durationMs: 1600 }],
    });
    await expect(generateReport({ manifestPath, outputPath: join(root, "out.html"), evidence: { ...passedEvidence, tmux: { status: "Passed", output: "runId=fixtureXrun moves=7 won=true YOU WIN __APP_EXIT__=0" } } })).rejects.toThrow("tmux runId does not match");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("marks missing or failed evidence truthfully", async () => {
  const { renderReport } = await import("../scripts/report-template");
  const html = renderReport({
    bunVersion: "bun",
    evidence: { ...passedEvidence, tests: { status: "Failed", output: "1 fail" }, tmux: { status: "Unavailable", output: "missing" } },
    gitCommit: "c",
    paneCommand: "bun run start",
    repositoryWslPath: "/mnt/c/repo",
    runId: "r",
    solution: ["A up"],
    terminalTranscript: "t",
    timing: { captureSpanMs: 1, commandPauseCaptureDeltasMs: [], initialHoldMs: 1, interCharacterCaptureDeltasMs: [], interCharacterSendDeltasMs: [], winningHoldMs: 1 },
    tmuxCommandSequence: "tmux new-session",
    tmuxVersion: "tmux",
    videoBase64: "AA==",
    videoBytes: 2,
    videoDurationSeconds: 1,
    workingDirectory: "C:/long/path",
  });
  expect(html).toContain(">Failed<");
  expect(html).toContain(">Unavailable<");
});

test("summarizes captured test and tmux success output for report generation", async () => {
  const { summarizeEvidence } = await import("../scripts/generate-report");

  expect(summarizeEvidence("23 pass\n0 fail", "tmux 3.4 moves=7 won=true YOU WIN __APP_EXIT__=0")).toEqual({
    testSummary: "23 pass, 0 fail",
    tmuxSuccess: "yes",
  });
});

test("production provenance rejects tracked and untracked changes but ignores artifacts", async () => {
  const { assertCleanWorktree } = await import("../scripts/generate-report");
  const root = await mkdtemp(join(tmpdir(), "unblock-me-git-"));
  try {
    await exec("git", ["init"], { cwd: root });
    await writeFile(join(root, ".gitignore"), "artifacts/\n", "utf8");
    await writeFile(join(root, "tracked.txt"), "committed\n", "utf8");
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"], { cwd: root });

    await expect(assertCleanWorktree(root, "before capture")).resolves.toBeUndefined();

    await writeFile(join(root, "tracked.txt"), "dirty\n", "utf8");
    await expect(assertCleanWorktree(root, "before capture")).rejects.toThrow(/before capture[\s\S]*tracked\.txt/);
    await writeFile(join(root, "tracked.txt"), "committed\n", "utf8");

    await writeFile(join(root, "untracked.ts"), "export {};\n", "utf8");
    await expect(assertCleanWorktree(root, "after capture")).rejects.toThrow(/after capture[\s\S]*untracked\.ts/);
    await rm(join(root, "untracked.ts"));

    await mkdir(join(root, "artifacts"));
    await writeFile(join(root, "artifacts", "ignored.txt"), "generated\n", "utf8");
    await expect(assertCleanWorktree(root, "after capture")).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});
