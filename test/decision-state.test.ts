import { expect, test } from "bun:test";
import type { GameState } from "../src/game";
import {
  decisionStateKey,
  deriveInteractionRegion,
  validateDecisionStateCompression,
} from "../src/search/decision-state";

test("collapses the Cartesian product of independent harmless translations", () => {
  const state: GameState = {
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
  };
  const shifted: GameState = {
    ...state,
    blocks: [
      { ...state.blocks[0]!, x: 3 },
      { ...state.blocks[1]!, x: 0 },
    ],
  };

  expect(decisionStateKey(state)).toBe(decisionStateKey(shifted));
  const validation = validateDecisionStateCompression(state, { sourceCommit: "abc1234" });
  expect(validation.exact.states).toBe(16);
  expect(validation.exactDecisionStates).toBe(1);
  expect(validation.compressed.states).toBe(1);
  expect(validation.comparison.reachabilityMatches).toBe(true);
});

test("treats full Checkpoint occupancy as an Event Boundary", () => {
  const state: GameState = {
    width: 6,
    height: 1,
    blocks: [{ id: "R", x: 0, y: 0, width: 2, height: 1, movement: "horizontal" }],
    walls: [],
    checkpoint: [{ x: 4, y: 0 }, { x: 5, y: 0 }],
    moves: 0,
    won: false,
  };

  expect(deriveInteractionRegion(state, state.blocks[0]!).positions).toHaveLength(4);
  const validation = validateDecisionStateCompression(state, { sourceCommit: "abc1234" });
  expect(validation.exact.states).toBe(5);
  expect(validation.exactDecisionStates).toBe(2);
  expect(validation.compressed.states).toBe(2);
  expect(validation.comparison).toEqual({
    reachabilityMatches: true,
    missingDecisionStates: 0,
    extraDecisionStates: 0,
  });
});

test("retains a reproducible counterexample when independent-region expansion invents a state", () => {
  const state: GameState = {
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
  };

  const validation = validateDecisionStateCompression(state, {
    seed: 77,
    sourceCommit: "abc1234",
  });
  expect(validation.comparison.reachabilityMatches).toBe(false);
  expect(validation.comparison.extraDecisionStates).toBeGreaterThan(0);
  expect(validation.counterexample).toMatchObject({
    kind: "spurious-reachable",
    initialState: state,
    seed: 77,
    sourceCommit: "abc1234",
    witnessState: { blocks: expect.any(Array) },
  });
});

test("derives positioned Blocker Dependencies", () => {
  const state: GameState = {
    width: 5,
    height: 3,
    blocks: [
      { id: "R", x: 0, y: 1, width: 2, height: 1, movement: "horizontal" },
      { id: "A", x: 3, y: 0, width: 1, height: 2, movement: "vertical" },
    ],
    walls: [],
    checkpoint: [{ x: 3, y: 1 }, { x: 4, y: 1 }],
    moves: 0,
    won: false,
  };

  expect(deriveInteractionRegion(state, state.blocks[0]!)).toMatchObject({
    blockId: "R",
    blockerDependencies: ["R->A"],
  });
});
