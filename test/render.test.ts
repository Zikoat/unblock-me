import { expect, test } from "bun:test";
import { applyMove } from "../src/game";
import { createPuzzle } from "../src/puzzle";
import { instructions, renderFrame } from "../src/render";

test("renders the exact initial grid with state and legend", () => {
  const frame = renderFrame(createPuzzle());

  expect(frame).toContain(". . . . . # #\n. . A . . # #\nR R A . B * *\n. . . . B # #\n. . . . . # #");
  expect(frame).toContain("moves=0 won=false");
  expect(frame).toContain("Legend: R/A/B=blocks #=Wall *=Checkpoint .=empty");
  expect(instructions).toBe("Enter <block-id> <direction> (left, right, up, down), help, or quit.");
});

test("places an error notice above the complete board", () => {
  const frame = renderFrame(createPuzzle(), "Unknown block: Z.");

  expect(frame).toStartWith("Unknown block: Z.\n\n. . . . . # #");
  expect(frame).toContain("moves=0 won=false");
});

test("renders the won frame after the seven-move solution", () => {
  let state = createPuzzle();
  state = move(state, "A", "up");
  state = move(state, "B", "down");
  for (let index = 0; index < 5; index += 1) state = move(state, "R", "right");

  const frame = renderFrame(state);
  expect(frame).toContain("moves=7 won=true");
  expect(frame).toContain("YOU WIN");
  expect(frame).toContain(". . . . . R R");
});

function move(state: ReturnType<typeof createPuzzle>, blockId: string, direction: "left" | "right" | "up" | "down") {
  const result = applyMove(state, { blockId, direction });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
