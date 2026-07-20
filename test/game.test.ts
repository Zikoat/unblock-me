import { expect, test } from "bun:test";
import { createPuzzle } from "../src/puzzle";

test("creates the specified valid initial puzzle", async () => {
  const state = createPuzzle();
  const { blockCells, validateState } = await import("../src/game");

  expect(state.width).toBe(7);
  expect(state.height).toBe(5);
  expect(validateState(state)).toEqual([]);
  expect(blockCells(state.blocks.find((block) => block.id === "R")!)).toEqual([
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ]);
  expect(state.checkpoint).toEqual([
    { x: 5, y: 2 },
    { x: 6, y: 2 },
  ]);
  expect(state.walls).toHaveLength(8);
  expect(state.walls.every((wall) => wall.x >= 5)).toBe(true);
});
