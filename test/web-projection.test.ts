import { expect, test } from "bun:test";
import { projectState } from "../src/game";
import { createPuzzle } from "../src/puzzle";
import { createCellViews, projectCellViews } from "../src/web/view-model";

test("assigns every browser background cell an explicit engine coordinate", () => {
  const state = createPuzzle();
  const cells = createCellViews(state);

  expect(cells).toHaveLength(state.width * state.height);
  expect(cells.filter((cell) => cell.kind === "checkpoint")).toEqual([
    { x: 5, y: 2, kind: "checkpoint" },
    { x: 6, y: 2, kind: "checkpoint" },
  ]);
});

test("browser cell projection matches the shared engine projection", () => {
  const state = createPuzzle();
  expect(projectCellViews(state, createCellViews(state))).toEqual(projectState(state));
});
