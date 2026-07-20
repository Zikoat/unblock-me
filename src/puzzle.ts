import type { GameState, Point } from "./game";

const corridorWalls: readonly Point[] = [
  { x: 5, y: 0 },
  { x: 6, y: 0 },
  { x: 5, y: 1 },
  { x: 6, y: 1 },
  { x: 5, y: 3 },
  { x: 6, y: 3 },
  { x: 5, y: 4 },
  { x: 6, y: 4 },
];

export function createPuzzle(): GameState {
  return {
    width: 7,
    height: 5,
    blocks: [
      { id: "R", axis: "horizontal", length: 2, x: 0, y: 2 },
      { id: "A", axis: "vertical", length: 2, x: 2, y: 1 },
      { id: "B", axis: "vertical", length: 2, x: 4, y: 2 },
    ],
    walls: corridorWalls.map((wall) => ({ ...wall })),
    checkpoint: [
      { x: 5, y: 2 },
      { x: 6, y: 2 },
    ],
    moves: 0,
    won: false,
  };
}
