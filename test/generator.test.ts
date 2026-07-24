import { expect, test } from "bun:test";
import { applyMove, validateState, type GameState, type MoveAction } from "../src/game";
import { createGeneratedLevel } from "../src/generator";
import { sampleNumericSetting } from "../src/generation/settings";

const seeds = [1, 2, 42, 999, 123456];

test("generated levels are deterministic, valid, unwon, and proof-solvable", () => {
  for (const seed of seeds) {
    const first = createGeneratedLevel(seed);
    const second = createGeneratedLevel(seed);
    expect(first.state).toEqual(second.state);
    expect(first.solution).toEqual(second.solution);
    expect(first.generation.settings).toEqual(second.generation.settings);
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

test("samples fixed, bounded-uniform, and bounded-normal numeric settings deterministically", () => {
  const values = [0.1, 0.9, 0.25, 0.75];
  let index = 0;
  const random = () => values[index++ % values.length]!;
  expect(sampleNumericSetting({ kind: "fixed", value: 4 }, random)).toEqual({
    definition: { kind: "fixed", value: 4 },
    sampled: 4,
  });
  const uniform = sampleNumericSetting({ kind: "bounded-uniform", min: 3, max: 8, integer: true }, random);
  const normal = sampleNumericSetting({
    kind: "bounded-normal",
    min: 1,
    max: 5,
    mean: 3,
    standardDeviation: 1,
    integer: true,
  }, random);
  expect(uniform.sampled).toBeGreaterThanOrEqual(3);
  expect(uniform.sampled).toBeLessThanOrEqual(8);
  expect(normal.sampled).toBeGreaterThanOrEqual(1);
  expect(normal.sampled).toBeLessThanOrEqual(5);
});

test("records complete sampled settings and generation timings", () => {
  const level = createGeneratedLevel(42);
  expect(level.generation).toMatchObject({
    kind: "finite",
    seed: 42,
    tactic: "reverse-scramble",
    settings: {
      boardWidth: { definition: { kind: "bounded-uniform", min: 6, max: 10 }, sampled: level.state.width },
      boardHeight: { sampled: level.state.height },
      checkpointWidth: { definition: { kind: "fixed", value: 2 }, sampled: 2 },
    },
  });
  expect(level.generation.settings.blockShapes).toEqual(level.state.blocks.map((block) => ({
    id: block.id,
    width: block.width,
    height: block.height,
    movement: block.movement,
  })));
  expect(typeof level.generation.timing.totalMs).toBe("number");
  expect(Number.isFinite(level.generation.timing.totalMs)).toBe(true);
  expect(Object.keys(level.generation.timing.phases)).toEqual(["settingsMs", "layoutMs", "scrambleMs"]);
  expect(Object.values(level.generation.timing.phases).every((duration) => Number.isFinite(duration))).toBe(true);
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
