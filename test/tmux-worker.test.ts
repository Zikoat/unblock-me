import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workerPath = join(import.meta.dir, "..", "scripts", "tmux-worker.py");

async function validateTiming(patch: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "unblock-me-timing-"));
  const fixturePath = join(root, "timing.json");
  const timing = {
    clock: "CLOCK_MONOTONIC",
    workerProcessCount: 1,
    initialHoldMs: 1000,
    winningHoldMs: 1500,
    captureSpanMs: 11000,
    totalFrameDurationMs: 11000,
    interCharacterSendDeltasMs: Array.from({ length: 38 }, () => 80),
    interCharacterCaptureDeltasMs: Array.from({ length: 38 }, () => 80),
    characterToSubmitSendDeltasMs: Array.from({ length: 7 }, () => 80),
    characterToSubmitCaptureDeltasMs: Array.from({ length: 7 }, () => 90),
    commandPauseCaptureDeltasMs: Array.from({ length: 7 }, () => 700),
    ...patch,
  };
  await writeFile(fixturePath, JSON.stringify(timing), "utf8");
  try {
    const child = Bun.spawn(["python", workerPath, "--validate-timing", fixturePath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, output: `${stdout}${stderr}` };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts one persistent worker with human-cadence measured timing", async () => {
  const result = await validateTiming();

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("measured timing passed");
});

test("rejects the old 300ms-per-character capture regression", async () => {
  const result = await validateTiming({
    captureSpanMs: 24091,
    totalFrameDurationMs: 24091,
    interCharacterSendDeltasMs: Array.from({ length: 38 }, () => 325),
    interCharacterCaptureDeltasMs: Array.from({ length: 38 }, () => 340),
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain("inter-character capture delta");
});
