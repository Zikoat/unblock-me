import { expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { runTerminalVerification } from "../scripts/terminal-playthrough";

const repositoryRoot = join(import.meta.dir, "..");
const artifactRoot = join(repositoryRoot, "artifacts", "terminal");

const SOLUTION = ["A up", "B down", "R right", "R right", "R right", "R right", "R right"];

test("cross-platform terminal playthrough wins and records screenshots", async () => {
  const result = await runTerminalVerification();

  expect(result.won).toBe(true);
  expect(result.moveCount).toBe(7);
  expect(result.screenshots.length).toBe(SOLUTION.length + 1);

  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  expect(manifest.solution).toEqual(SOLUTION);
  expect(manifest.executedSolution).toEqual(SOLUTION);
  expect(manifest.moveCount).toBe(7);
  expect(manifest.won).toBe(true);

  const transcript = await readFile(result.transcriptPath, "utf8");
  for (const marker of ["moves=0 won=false", "moves=7 won=true", "YOU WIN"]) {
    expect(transcript).toContain(marker);
  }

  expect(manifest.screenshots.length).toBe(SOLUTION.length + 1);
  for (const screenshot of manifest.screenshots) {
    const info = await stat(join(artifactRoot, screenshot));
    expect(info.size).toBeGreaterThan(0);
  }
}, 120_000);
