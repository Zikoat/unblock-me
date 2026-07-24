import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GameState } from "../src/game";
import { validateDecisionStateCompression } from "../src/search/decision-state";

const exec = promisify(execFile);
const root = join(import.meta.dir, "..");

export async function runValidationCorpus(sourceCommit: string) {
  const cases = validationCases().map(({ name, description, state, seed }) => ({
    name,
    description,
    seed,
    initialState: state,
    result: validateDecisionStateCompression(state, { sourceCommit, seed }),
  }));
  return {
    schemaVersion: 1,
    sourceCommit,
    conclusion: cases.every((entry) => entry.result.comparison.reachabilityMatches)
      ? "candidate-matched-corpus"
      : "candidate-rejected-by-exact-oracle",
    cases,
  };
}

if (import.meta.main) {
  const sourceCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const record = await runValidationCorpus(sourceCommit);
  const artifacts = join(root, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await Bun.write(join(artifacts, "issue18-decision-state-validation.json"), JSON.stringify(record, null, 2));
  if (process.argv.includes("--record")) {
    await Bun.write(
      join(root, "learning-records", "0003-decision-state-compression-validation.json"),
      JSON.stringify(record, null, 2),
    );
    await Bun.write(
      join(root, "learning-records", "0003-decision-state-compression-validation.md"),
      markdownRecord(record),
    );
  }
  const summary = record.cases.map((entry) => ({
    name: entry.name,
    exactStates: entry.result.exact.states,
    exactDecisionStates: entry.result.exactDecisionStates,
    candidateStates: entry.result.compressed.states,
    match: entry.result.comparison.reachabilityMatches,
    missing: entry.result.comparison.missingDecisionStates,
    extra: entry.result.comparison.extraDecisionStates,
  }));
  if (process.argv.includes("--json")) console.log(JSON.stringify({ conclusion: record.conclusion, sourceCommit, cases: summary }));
  else console.log(`${record.conclusion}: ${summary.map((entry) => `${entry.name} ${entry.exactStates}->${entry.candidateStates} match=${entry.match}`).join("; ")}`);
}

function validationCases(): Array<{ description: string; name: string; seed: number; state: GameState }> {
  return [
    {
      name: "independent-parallel",
      description: "Two independent parallel Blocks each translate through four positions.",
      seed: 1801,
      state: {
        width: 5,
        height: 2,
        blocks: [
          { id: "A", x: 0, y: 0, width: 2, height: 1, movement: "horizontal" },
          { id: "B", x: 2, y: 1, width: 2, height: 1, movement: "horizontal" },
        ],
        walls: [],
        checkpoint: [],
        moves: 0,
        won: false,
      },
    },
    {
      name: "checkpoint-event-boundary",
      description: "A Red Block translates harmlessly until full Checkpoint occupancy changes the consequence.",
      seed: 1802,
      state: {
        width: 6,
        height: 1,
        blocks: [{ id: "R", x: 0, y: 0, width: 2, height: 1, movement: "horizontal" }],
        walls: [],
        checkpoint: [{ x: 4, y: 0 }, { x: 5, y: 0 }],
        moves: 0,
        won: false,
      },
    },
    {
      name: "dependency-gate-counterexample",
      description: "A vertical Block gates the Red Block; independent region expansion recombines incompatible positions.",
      seed: 1803,
      state: {
        width: 5,
        height: 4,
        blocks: [
          { id: "R", x: 0, y: 2, width: 2, height: 1, movement: "horizontal" },
          { id: "A", x: 2, y: 1, width: 1, height: 2, movement: "vertical" },
        ],
        walls: [],
        checkpoint: [{ x: 3, y: 2 }, { x: 4, y: 2 }],
        moves: 0,
        won: false,
      },
    },
  ];
}

function markdownRecord(record: Awaited<ReturnType<typeof runValidationCorpus>>): string {
  const rows = record.cases.map((entry) =>
    `| ${entry.name} | ${entry.result.exact.states} | ${entry.result.exactDecisionStates} | ${entry.result.compressed.states} | ${entry.result.comparison.reachabilityMatches ? "yes" : "no"} | ${entry.result.comparison.extraDecisionStates} |`
  ).join("\n");
  const counterexample = record.cases.find((entry) => entry.result.counterexample)?.result.counterexample;
  return `# Decision State compression validation

Source commit: \`${record.sourceCommit}\`

The finite Exact State search is the correctness oracle. The candidate search retains complete positioned Blocks, derives each Block's Interaction Region and Blocker Dependencies, and expands Event Boundary moves without enumerating the Cartesian product of independent harmless translations.

| Case | Exact States | Exact Decision States | Candidate states | Reachability match | Spurious states |
|---|---:|---:|---:|---:|---:|
${rows}

## Result

The independent-parallel case confirms the intended memory collapse: 16 Exact States become one Decision State. Full Checkpoint occupancy remains a distinct Event Boundary.

The candidate is not yet a correct general search. The Dependency Gate case produces spurious reachable Decision States by combining Interaction Region positions that are individually reachable but not jointly compatible. Exact search rejected that over-approximation. Future compression must retain compatibility/order constraints or a witnessed compatible representative when composing Block regions.

${counterexample ? `The durable counterexample is in the adjacent JSON record with seed \`${counterexample.seed}\`, source commit \`${counterexample.sourceCommit}\`, complete initial geometry, and the spurious witness state.` : ""}
`;
}
