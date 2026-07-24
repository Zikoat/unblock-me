import type { BrowserSession } from "./session";

declare const __SOURCE_COMMIT__: string;

export interface EvidenceExport {
  closure: { exactState: BrowserSession["closureState"] };
  exportedAt: string;
  play: {
    currentExactState: BrowserSession["playState"];
    currentLevelId: string;
    feedback: {
      current: BrowserSession["feedbackDraft"];
      records: BrowserSession["feedbackEntries"];
    };
    generation: BrowserSession["currentGeneration"];
    initialExactState: BrowserSession["initialState"];
    moves: BrowserSession["moveHistory"];
    proof?: {
      solution: NonNullable<BrowserSession["currentSolution"]>;
      sourceCommit: string;
      tactic: "recorded-reverse-scramble";
    };
    seed: BrowserSession["currentSeed"];
  };
  schemaVersion: 1;
  sourceCommit: string;
  view: {
    mode: BrowserSession["mode"];
    worldCamera: BrowserSession["worldView"];
    zoom: number;
  };
  world: {
    exactState: BrowserSession["worldState"];
    generation: BrowserSession["worldState"]["generation"];
  };
}

export function bundledSourceCommit(): string {
  return typeof __SOURCE_COMMIT__ === "string" ? __SOURCE_COMMIT__ : "working-tree";
}

export function createEvidenceExport(
  session: BrowserSession,
  sourceCommit = bundledSourceCommit(),
  exportedAt = new Date().toISOString(),
): EvidenceExport {
  return structuredClone({
    schemaVersion: 1,
    exportedAt,
    sourceCommit,
    play: {
      currentLevelId: session.currentLevelId,
      seed: session.currentSeed,
      initialExactState: session.initialState,
      currentExactState: session.playState,
      moves: session.moveHistory,
      feedback: {
        current: session.feedbackDraft,
        records: session.feedbackEntries,
      },
      generation: session.currentGeneration,
      proof: session.currentSolution
        ? {
          tactic: "recorded-reverse-scramble",
          solution: session.currentSolution,
          sourceCommit,
        }
        : undefined,
    },
    view: {
      mode: session.mode,
      worldCamera: session.worldView,
      zoom: session.zoom,
    },
    world: {
      exactState: session.worldState,
      generation: session.worldState.generation,
    },
    closure: { exactState: session.closureState },
  });
}
