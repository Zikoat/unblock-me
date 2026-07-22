import { expect, test } from "bun:test";
import { applyMove, validateState, type GameState, type MoveAction } from "../src/game";
import { createGeneratedLevel } from "../src/generator";

const seeds = [1, 2, 42, 999, 123456];

test("generated levels are deterministic, valid, unwon, and proof-solvable", () => {
  for (const seed of seeds) {
    const first = createGeneratedLevel(seed);
    expect(first).toEqual(createGeneratedLevel(seed));
    expect(first.state.width).toBeGreaterThanOrEqual(6);
    expect(first.state.width).toBeLessThanOrEqual(10);
    expect(first.state.height).toBeGreaterThanOrEqual(5);
    expect(first.state.height).toBeLessThanOrEqual(8);
    expect(first.state.moves).toBe(0);
    expect(first.state.won).toBe(false);
    expect(validateState(first.state)).toEqual([]);
    expect(replay(first.state, first.solution).won).toBe(true);
  }
});

test("generated levels vary board, Checkpoint, Walls, and blocks", () => {
  const levels = seeds.map(createGeneratedLevel);

  expect(new Set(levels.map(({ state }) => `${state.width}x${state.height}`)).size).toBeGreaterThan(1);
  expect(new Set(levels.map(({ state }) => JSON.stringify(state.checkpoint))).size).toBeGreaterThan(1);
  expect(new Set(levels.map(({ state }) => JSON.stringify(state.walls))).size).toBeGreaterThan(1);
  expect(new Set(levels.map(({ state }) => JSON.stringify(state.blocks))).size).toBeGreaterThan(1);
  expect(levels.some(({ state }) => state.blocks.some((block) => block.id !== "R" && block.width === block.height))).toBe(true);
});

test("keeps a horizontal two-cell Red Block and Checkpoint", () => {
  for (const { state } of seeds.map(createGeneratedLevel)) {
    const red = state.blocks.find((block) => block.id === "R");
    expect(red).toMatchObject({ width: 2, height: 1, movement: "horizontal" });
    expect(state.checkpoint).toHaveLength(2);
    expect(state.checkpoint[0]!.y).toBe(state.checkpoint[1]!.y);
    expect(state.checkpoint[1]!.x).toBe(state.checkpoint[0]!.x + 1);
  }
});

function replay(initial: GameState, solution: readonly MoveAction[]): GameState {
  let state = initial;
  for (const action of solution) {
    const result = applyMove(state, action);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}
