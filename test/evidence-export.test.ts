import { expect, test } from "bun:test";
import { applyMove } from "../src/game";
import { createGeneratedLevel } from "../src/generator";
import { createClosureState } from "../src/world/closure";
import { createPrototypeState } from "../src/world/generation";
import { createEvidenceExport } from "../src/web/evidence-export";
import { pageHtml } from "../src/web/page";
import type { BrowserSession } from "../src/web/session";

test("exports exact geometry, semantic decisions, settings, proof, feedback, view, and source", () => {
  const level = createGeneratedLevel(42);
  const action = level.solution[0]!;
  const moved = applyMove(level.state, action);
  expect(moved.ok).toBe(true);
  if (!moved.ok) return;
  const session: BrowserSession = {
    version: 1,
    mode: "world",
    zoom: 1.25,
    currentSeed: 42,
    currentGeneration: level.generation,
    currentSolution: level.solution,
    currentLevelId: "level-42",
    currentLevelSolved: false,
    initialState: level.state,
    playState: moved.state,
    moveHistory: [{
      type: "block-move",
      blockId: action.blockId,
      direction: action.direction,
      requestedSteps: 1,
      movedSteps: 1,
      before: level.state,
      after: moved.state,
    }],
    feedbackDraft: { rating: "up", comment: "Good shape mix" },
    feedbackEntries: [],
    worldState: createPrototypeState(9),
    worldView: { x: -2.5, y: 4.25 },
    closureState: createClosureState("separator"),
  };

  const exported = createEvidenceExport(session, "abc1234", "2026-07-24T12:00:00.000Z");
  expect(exported).toMatchObject({
    schemaVersion: 1,
    sourceCommit: "abc1234",
    exportedAt: "2026-07-24T12:00:00.000Z",
    play: {
      currentLevelId: "level-42",
      seed: 42,
      initialExactState: { blocks: level.state.blocks },
      currentExactState: { blocks: moved.state.blocks },
      moves: [{ before: level.state, after: moved.state }],
      feedback: { current: { rating: "up", comment: "Good shape mix" } },
      generation: { settings: level.generation.settings, timing: level.generation.timing },
      proof: { sourceCommit: "abc1234", solution: level.solution },
    },
    view: { mode: "world", worldCamera: { x: -2.5, y: 4.25 }, zoom: 1.25 },
    world: { exactState: session.worldState, generation: session.worldState.generation },
    closure: { exactState: session.closureState },
  });
});

test("offers a data export action", () => {
  expect(pageHtml).toContain('data-action="export"');
  expect(pageHtml).toContain("Export data");
});
