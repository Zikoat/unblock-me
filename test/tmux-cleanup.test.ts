import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

test("aggregates owned cleanup failures, exits nonzero, and still removes residue", async () => {
  const repositoryRoot = join(import.meta.dir, "..");
  const child = Bun.spawn([
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", join(repositoryRoot, "scripts", "tmux-playthrough.ps1"),
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, UNBLOCK_ME_VERIFY_INJECT_CLEANUP_FAILURES: "session,shim" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const output = `${stdout}${stderr}`;
  const runId = /runId=(unblock-me-verify-[A-Za-z0-9.-]+)/.exec(output)?.[1];

  expect(exitCode).toBe(1);
  expect(runId).toBeDefined();
  expect(output).toContain("main-path=passed");
  expect(output).toContain("injected tmux session cleanup failure");
  expect(output).toContain("injected shim cleanup failure");
  expect(output).toContain("cleanup-attempt=tmux-session-recovery");
  expect(output).toContain("cleanup-attempt=shim-recovery");
  expect(output).toContain("cleanup-attempt=tmux-session-residue-check");

  const sessionCheck = Bun.spawn([
    "wsl.exe", "-d", "Ubuntu-24.04", "--", "tmux", "has-session", "-t", runId!,
  ], { stdout: "ignore", stderr: "ignore" });
  expect(await sessionCheck.exited).not.toBe(0);
  expect(existsSync(join(repositoryRoot, "artifacts", "tmux", "runs", runId!, "shim"))).toBe(false);
}, 90_000);

test("preserves a primary verification error while aggregating cleanup failures", async () => {
  const repositoryRoot = join(import.meta.dir, "..");
  const child = Bun.spawn([
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", join(repositoryRoot, "scripts", "tmux-playthrough.ps1"),
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      UNBLOCK_ME_VERIFY_INJECT_CLEANUP_FAILURES: "session",
      UNBLOCK_ME_VERIFY_INJECT_PRIMARY_FAILURE: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const output = `${stdout}${stderr}`;

  expect(exitCode).toBe(1);
  expect(output).toContain("Primary verification failure: injected primary verification failure");
  expect(output).toContain("injected tmux session cleanup failure");
  expect(output).toContain("cleanup-attempt=tmux-session-recovery");
  expect(output.indexOf("Primary verification failure")).toBeLessThan(output.indexOf("Cleanup failed while preserving the primary result"));
}, 90_000);
