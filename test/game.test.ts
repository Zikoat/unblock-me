import { expect, test } from "bun:test";
import { applyMove } from "../src/game";
import { createPuzzle as createInitialPuzzle } from "../src/puzzle";

test("creates the specified valid initial puzzle", async () => {
  const state = createInitialPuzzle();
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

test("moves a block one cell along its axis", () => {
  const result = applyMove(createInitialPuzzle(), { blockId: "a", direction: "up" });

  expect(result).toMatchObject({ ok: true, state: { moves: 1, won: false } });
  if (result.ok) {
    expect(result.state.blocks.find((block) => block.id === "A")).toMatchObject({ x: 2, y: 0 });
  }
});

test("rejects a move on the wrong axis without changing state", () => {
  const state = createInitialPuzzle();
  const result = applyMove(state, { blockId: "A", direction: "left" });

  expect(result).toMatchObject({ ok: false, code: "wrong-axis" });
  expect(result.state).toBe(state);
  expect(result.state.moves).toBe(0);
});

test("rejects collisions without changing state", () => {
  const puzzle = createInitialPuzzle();
  const state = {
    ...puzzle,
    blocks: puzzle.blocks.map((block) =>
      block.id === "R" || block.id === "A" ? { ...block, y: 0 } : block,
    ),
  };
  const result = applyMove(state, { blockId: "R", direction: "right" });

  expect(result).toMatchObject({ ok: false, code: "blocked" });
  expect(result.state).toBe(state);
  expect(result.state.moves).toBe(0);
});

test("rejects Walls without changing state", () => {
  const puzzle = createInitialPuzzle();
  const state = { ...puzzle, walls: [...puzzle.walls, { x: 2, y: 0 }] };
  const result = applyMove(state, { blockId: "A", direction: "up" });

  expect(result).toMatchObject({ ok: false, code: "blocked" });
  expect(result.state).toBe(state);
  expect(result.state.moves).toBe(0);
});

test("rejects moves beyond board bounds without changing state", () => {
  const state = createInitialPuzzle();
  const result = applyMove(state, { blockId: "A", direction: "up" });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const outOfBounds = applyMove(result.state, { blockId: "A", direction: "up" });
  expect(outOfBounds).toMatchObject({ ok: false, code: "out-of-bounds" });
  expect(outOfBounds.state).toBe(result.state);
  expect(outOfBounds.state.moves).toBe(1);
});

test("does not win when the Red Block only partially overlaps the Checkpoint", () => {
  let state = createInitialPuzzle();
  state = move(state, "A", "up");
  state = move(state, "B", "down");
  state = move(state, "R", "right");
  state = move(state, "R", "right");
  state = move(state, "R", "right");
  state = move(state, "R", "right");

  expect(state.blocks.find((block) => block.id === "R")).toMatchObject({ x: 4, y: 2 });
  expect(state.won).toBe(false);
});

test("wins after the seven-move solution fully occupies the Checkpoint", () => {
  let state = createInitialPuzzle();
  state = move(state, "A", "up");
  state = move(state, "B", "down");
  for (let index = 0; index < 5; index += 1) state = move(state, "R", "right");

  expect(state.blocks.find((block) => block.id === "R")).toMatchObject({ x: 5, y: 2 });
  expect(state).toMatchObject({ moves: 7, won: true });
  expect(applyMove(state, { blockId: "R", direction: "left" })).toMatchObject({
    ok: false,
    state,
    code: "already-won",
  });
});

function move(state: Awaited<ReturnType<typeof createInitialPuzzle>>, blockId: string, direction: "left" | "right" | "up" | "down") {
  const result = applyMove(state, { blockId, direction });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
