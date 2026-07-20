import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("generates a self-contained responsive verification report from a fixture capture", async () => {
  const { generateReport } = await import("../scripts/generate-report");
  const fixtureRoot = await mkdtemp(join(tmpdir(), "unblock-me-report-"));

  try {
    const evidenceRoot = join(fixtureRoot, "tmux");
    const paneRoot = join(evidenceRoot, "runs", "fixture-run", "evidence", "panes");
    await mkdir(paneRoot, { recursive: true });
    await writeFile(join(paneRoot, "001-initial.txt"), "moves=0 won=false\n", "utf8");
    await writeFile(join(paneRoot, "002-won.txt"), "moves=7 won=true\nYOU WIN\n__APP_EXIT__=0\n", "utf8");
    await writeFile(
      join(evidenceRoot, "runs", "fixture-run", "evidence", "transcript.txt"),
      "--- initial ---\nmoves=0 won=false\n--- won ---\nmoves=7 won=true\nYOU WIN\n__APP_EXIT__=0\n",
      "utf8",
    );
    await writeFile(
      join(evidenceRoot, "manifest.json"),
      JSON.stringify({
        runId: "fixture-run",
        distro: "Ubuntu",
        tmuxVersion: "tmux fixture",
        bunVersion: "fixture-bun",
        transcriptPath: "runs/fixture-run/evidence/transcript.txt",
        frames: [
          { label: "initial", path: "runs/fixture-run/evidence/panes/001-initial.txt", durationMs: 800 },
          { label: "won", path: "runs/fixture-run/evidence/panes/002-won.txt", durationMs: 800 },
        ],
      }),
      "utf8",
    );

    const outputPath = join(fixtureRoot, "verification.html");
    await generateReport({
      manifestPath: join(evidenceRoot, "manifest.json"),
      outputPath,
      typecheckOutput: "typecheck passed",
      testOutput: "12 pass",
      tmuxOutput: "moves=7 won=true YOU WIN __APP_EXIT__=0",
      gitCommit: "fixture-commit",
    });

    const html = await readFile(outputPath, "utf8");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain("Request and scope");
    expect(html).toContain("bun run start");
    expect(html).toContain("Verification evidence");
    expect(html).toContain("fixture-bun");
    expect(html).toContain("moves=7 won=true");
    expect(html).toContain("Deployment status");
    expect(html).toContain("Limitations");
    expect(html).toContain("Android phone verification");
    expect(html).toContain("Pending human verification");
    expect(html).toContain('<video controls src="data:video/mp4;base64,');
    expect(html).toContain("max-width: 100%");

    const match = html.match(/data:video\/mp4;base64,([^\"]+)/);
    expect(match).not.toBeNull();
    const video = Buffer.from(match![1], "base64");
    expect(video.byteLength).toBeGreaterThan(0);
    expect(video.subarray(4, 8).toString("ascii")).toBe("ftyp");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("summarizes captured test and tmux success output for report generation", async () => {
  const { summarizeEvidence } = await import("../scripts/generate-report");

  expect(summarizeEvidence("23 pass\n0 fail", "tmux 3.4 moves=7 won=true YOU WIN __APP_EXIT__=0")).toEqual({
    testSummary: "23 pass, 0 fail",
    tmuxSuccess: "yes",
  });
});
