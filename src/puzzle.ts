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
      { id: "R", width: 2, height: 1, movement: "horizontal", x: 0, y: 2 },
      { id: "A", width: 1, height: 2, movement: "vertical", x: 2, y: 1 },
      { id: "B", width: 1, height: 2, movement: "vertical", x: 4, y: 2 },
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
