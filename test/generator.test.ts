import { expect, test } from "bun:test";
import { applyMove } from "../src/game";
import { createGeneratedLevel } from "../src/generator";

test("generated levels are deterministic, scrambled, and solvable", () => {
  const first = createGeneratedLevel(42);
  const second = createGeneratedLevel(42);

  expect(first.state).toEqual(second.state);
  expect(first.state.moves).toBe(0);
  expect(first.solution.length).toBeGreaterThanOrEqual(3);

  let state = first.state;
  for (const action of first.solution) {
    const result = applyMove(state, action);
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
  }
  expect(state.won).toBe(true);
});
